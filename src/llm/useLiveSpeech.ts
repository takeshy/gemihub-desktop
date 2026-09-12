import { useEffect, useRef, useState } from "react";
import {
  type LiveSpeechEvent,
  liveSpeechTransport,
  onLiveSpeech,
} from "../lib/wailsBackend";
import { createPCMCapture } from "./pcmCapture";
import { speechDraft, validateSpeechSettings } from "./speechTranscription";
import type { ChatSpeechOptions } from "./useRecordedSpeech";
import { useI18n } from "../i18n/context";

type Capture = Awaited<ReturnType<typeof createPCMCapture>>;
interface ActiveLiveSpeech {
  id: string;
  stream: MediaStream;
  capture?: Capture;
  base: string;
  partial: string;
  items: Map<string, string>;
  lastRendered?: string;
}
export function useLiveSpeech(options: ChatSpeechOptions) {
  const { t } = useI18n();
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<ActiveLiveSpeech | null>(null);
  const ending = useRef(false);
  // Invalidates an in-flight start when the hook is cleared or a new start
  // begins, so an unmount or scope change cannot leak a live session or mic.
  const startToken = useRef(0);
  const [status, setStatus] = useState<
    "idle" | "starting" | "recording" | "transcribing"
  >("idle");
  const [meterStream, setMeterStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const clear = async () => {
    startToken.current++;
    const current = active.current;
    active.current = null;
    ending.current = false;
    current?.stream.getTracks().forEach((track) => track.stop());
    try {
      await current?.capture?.stop();
    } catch {}
    await liveSpeechTransport.stop().catch(() => {});
    setStatus("idle");
    setMeterStream(null);
  };
  useEffect(() => {
    const off = onLiveSpeech(handleEvent);
    return () => {
      off();
      void clear();
    };
  }, []);
  useEffect(() => {
    void clear();
    setError("");
  }, [options.scope, options.settings.provider]);
  useEffect(() => {
    if (options.disabled) void clear();
  }, [options.disabled]);
  function draft(
    current: ActiveLiveSpeech,
    transcript: string,
    final: boolean,
  ) {
    return speechDraft(
      current.base,
      transcript,
      final,
      latest.current.settings.sendPhrase,
      {
        question: latest.current.settings.questionPhrases ?? "",
        newline: latest.current.settings.newlinePhrases ?? "",
        exclamation: latest.current.settings.exclamationPhrases ?? "",
      },
      latest.current.settings.replacements ?? "",
    );
  }
  function render(current: ActiveLiveSpeech, text: string) {
    current.lastRendered = text;
    latest.current.onInput(text);
  }
  function handleEvent(event: LiveSpeechEvent) {
    const current = active.current;
    if (!current || event.sessionId !== current.id) return;
    if (latest.current.input !== current.lastRendered) {
      current.base = latest.current.input;
      current.partial = "";
      current.items.clear();
      current.lastRendered = current.base;
    }
    if (event.kind === "error") {
      setError(event.message ?? "Live transcription failed");
      void clear();
      return;
    }
    if (event.kind === "done") {
      active.current = null;
      ending.current = false;
      setStatus("idle");
      setMeterStream(null);
      return;
    }
    if (event.kind === "delta") {
      current.items.set(
        event.itemId ?? "",
        (current.items.get(event.itemId ?? "") ?? "") + (event.text ?? ""),
      );
      current.partial = [...current.items.values()].join("");
      render(current, draft(current, current.partial, false).text);
      return;
    }
    if (event.kind === "interim") {
      current.partial = event.text ?? "";
      render(current, draft(current, current.partial, false).text);
      return;
    }
    if (event.kind === "final") {
      if (event.itemId) current.items.delete(event.itemId);
      const result = draft(current, event.text ?? "", true);
      current.base = result.text;
      current.partial = [...current.items.values()].join("");
      render(
        current,
        current.partial
          ? draft(current, current.partial, false).text
          : result.text,
      );
      // The send phrase always ends listening, even when it is the only thing
      // said: there is then nothing to send, but the microphone must still stop.
      if (result.send) {
        void clear();
        if (result.text.trim()) latest.current.onSend(result.text);
        else latest.current.onEnd?.();
      }
    }
  }
  async function toggle(input = options.input) {
    if (active.current) {
      if (ending.current) {
        await clear();
        return;
      }
      ending.current = true;
      setStatus("transcribing");
      setMeterStream(null);
      const current = active.current;
      current.stream.getTracks().forEach((track) => track.stop());
      try {
        await current.capture?.stop();
        if (current.capture?.heardVoice() === false) {
          await clear();
          return;
        }
        await liveSpeechTransport.finish(current.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        await clear();
      }
      return;
    }
    if (options.disabled) return;
    setError("");
    const token = ++startToken.current;
    try {
      validateSpeechSettings(options.settings);
      setStatus("starting");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== startToken.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const id = await liveSpeechTransport.start({
        endpointType: options.settings.endpointType,
        apiKey: options.settings.apiKey,
        language: options.settings.language,
        vertexProjectId: options.settings.vertexProjectId,
      });
      if (token !== startToken.current) {
        stream.getTracks().forEach((track) => track.stop());
        await liveSpeechTransport.stop().catch(() => {});
        return;
      }
      const current: ActiveLiveSpeech = {
        id,
        stream,
        base: input,
        partial: "",
        items: new Map<string, string>(),
      };
      active.current = current;
      current.capture = await createPCMCapture(
        stream,
        options.settings.endpointType === "openai" ? 24000 : 16000,
        (chunk) => liveSpeechTransport.send(id, chunk),
        (caught) => {
          setError(String(caught));
          void clear();
        },
      );
      // The session may have been stopped while the capture was starting: it is
      // then already finishing, so the meter must not come back to life.
      if (token !== startToken.current || ending.current) {
        await current.capture?.stop().catch(() => {});
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      setMeterStream(stream);
      setStatus("recording");
    } catch (caught) {
      setError(
        `${t("speech.startError")}: ${
          caught instanceof Error ? caught.message : String(caught)
        }`,
      );
      await clear();
    }
  }
  return {
    listening: status === "recording",
    busy: status === "starting" || status === "transcribing",
    meterStream,
    silenceHint: "",
    retainedCount: 0,
    retryRecording: () => {},
    status,
    error,
    backgroundTranscribing: false,
    supported: !!navigator.mediaDevices?.getUserMedia,
    toggle,
    dismiss: () => setError(""),
    stop: () => {
      void clear();
    },
  };
}
