import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/context";
import type { Language } from "../i18n/translations";
import { clampReadAloudRate } from "./settings";

const SPEECH_LANGUAGE_BY_LOCALE: Record<Language, string> = {
  en: "en-US",
  ja: "ja-JP",
};

export function speechLanguageFor(language: Language): string {
  return SPEECH_LANGUAGE_BY_LOCALE[language] ?? "en-US";
}

/** Remove Markdown constructs that speech engines otherwise read as punctuation. */
export function textForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+] |\d+[.)] )/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Spoken answers need a different shape than read ones: markup and long
 * transcripts are either dropped by textForSpeech or read out as punctuation.
 */
export function buildReadAloudSystemPrompt(): string {
  return [
    "\n\nAutomatic read-aloud is on: this answer is spoken by a speech synthesizer instead of being read on screen.",
    "Answer in a few short sentences and lead with the answer itself, without preamble, restating the question, or closing offers.",
    "Write speakable prose in the user's language: no headings, bullet lists, tables, code blocks, URLs, or file paths, because those are dropped or read out as punctuation.",
    "When something can only be shown in writing, such as code or a long list, say briefly what it is and keep the written part as short as the request allows.",
    "If the answer genuinely needs to be long, say the summary first and ask whether to continue.",
  ].join(" ");
}

let speakingKey: string | null = null;
let utteranceSequence = 0;
const speakingListeners = new Set<() => void>();

function setSpeakingKey(key: string | null): void {
  if (speakingKey === key) return;
  speakingKey = key;
  for (const listener of [...speakingListeners]) listener();
}

function subscribeSpeaking(listener: () => void): () => void {
  speakingListeners.add(listener);
  return () => {
    speakingListeners.delete(listener);
  };
}

export function stopReadingAloud(): void {
  utteranceSequence++;
  setSpeakingKey(null);
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
}

let readAloudRate = 1;

/**
 * The rate is a setting, but both readers of an answer - the auto-read hook and
 * an explicit replay - are far from it, so it is held here rather than threaded
 * through every caller.
 */
export function setReadAloudRate(rate: number): void {
  readAloudRate = clampReadAloudRate(rate);
}

export function getReadAloudRate(): number {
  return readAloudRate;
}

export function useReadAloudRate(rate: number): void {
  useEffect(() => {
    setReadAloudRate(rate);
  }, [rate]);
}

/**
 * Settle once nothing is being read aloud, so a listener can act on the silence.
 * Speech usually starts in the same commit as the caller's effect, so a moment of
 * grace is allowed before concluding that nothing will speak at all (an engine
 * that is missing, or an answer with no speakable text).
 */
export function whenReadingSettles(
  graceMs = 300,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let grace: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    const finish = () => {
      if (grace) clearTimeout(grace);
      grace = null;
      unsubscribe();
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    signal?.addEventListener("abort", finish, { once: true });
    unsubscribe = subscribeSpeaking(() => {
      if (speakingKey) {
        // Speech started; from here only its end matters.
        if (grace) clearTimeout(grace);
        grace = null;
        return;
      }
      if (!grace) finish();
    });
    if (speakingKey) return;
    grace = setTimeout(finish, graceMs);
  });
}

export function readAloud(
  text: string,
  lang = "en-US",
  key: string | null = null,
): boolean {
  const spoken = textForSpeech(text);
  if (typeof window === "undefined") return false;
  if (
    !spoken || !window.speechSynthesis ||
    typeof SpeechSynthesisUtterance === "undefined"
  ) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.lang = lang;
  utterance.rate = readAloudRate;
  // A cancelled utterance still reports end or error afterwards, so only the
  // newest one may clear the speaking state.
  const sequence = ++utteranceSequence;
  let started = false;
  const finish = () => {
    clearTimeout(startGuard);
    if (sequence === utteranceSequence) setSpeakingKey(null);
  };
  // Some engines accept an utterance and then neither speak nor fire events,
  // for example when no voice is installed. Clear the state if it never starts.
  const startGuard = setTimeout(() => {
    if (!started) finish();
  }, 2000);
  utterance.onstart = () => {
    started = true;
    clearTimeout(startGuard);
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  setSpeakingKey(key);
  window.speechSynthesis.speak(utterance);
  return true;
}

interface ReadAloudMessage {
  id?: string;
  role: string;
  content: string;
}

/** Read only newly completed assistant turns, never a conversation loaded from history. */
export function useAutoReadAloud<M extends ReadAloudMessage>(
  messages: readonly M[],
  isLoading: boolean,
  enabled: boolean,
): void {
  const { language } = useI18n();
  const previousLoading = useRef(isLoading);
  const previousEnabled = useRef(enabled);
  useEffect(() => {
    const completed = previousLoading.current && !isLoading;
    const startedLoading = !previousLoading.current && isLoading;
    const disabledNow = previousEnabled.current && !enabled;
    previousLoading.current = isLoading;
    previousEnabled.current = enabled;
    if (!enabled) {
      if (disabledNow) stopReadingAloud();
      return;
    }
    if (startedLoading) {
      stopReadingAloud();
      return;
    }
    if (!completed) return;
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return;
    const key = `message:${last.id ?? messages.length - 1}`;
    readAloud(last.content, speechLanguageFor(language), key);
  }, [enabled, isLoading, messages, language]);
}
