import { useEffect, useRef, useState } from "react";
import { type ChatSpeechOptions, useRecordedSpeech } from "./useRecordedSpeech";
import { speechDraft } from "./speechTranscription";

interface SpeechResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useChatSpeech(options: ChatSpeechOptions) {
  const recorded = useRecordedSpeech(options);
  const latest = useRef(options);
  latest.current = options;
  const recognition = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [meterStream, setMeterStream] = useState<MediaStream | null>(null);
  const meterRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const speechWindow = window as SpeechWindow;
  const Constructor = speechWindow.SpeechRecognition ??
    speechWindow.webkitSpeechRecognition;

  function stop() {
    const current = recognition.current;
    recognition.current = null;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      current.abort();
    }
    setListening(false);
    meterRef.current?.getTracks().forEach((track) => track.stop());
    meterRef.current = null;
    setMeterStream(null);
  }

  useEffect(() => {
    stop();
    setError("");
    return stop;
  }, [options.scope, options.disabled, options.settings.provider]);

  function toggle() {
    if (recognition.current) {
      stop();
      return;
    }
    if (options.disabled) return;
    setError("");
    if (!Constructor) {
      setError("この環境は音声認識（SpeechRecognition）に対応していません。");
      return;
    }
    const base = options.input;
    const scope = options.scope;
    try {
      const current = new Constructor();
      recognition.current = current;
      current.lang = "ja-JP";
      current.continuous = true;
      current.interimResults = true;
      current.onresult = (event) => {
        if (
          recognition.current !== current || latest.current.disabled ||
          latest.current.scope !== scope
        ) return;
        const results = Array.from(event.results);
        const transcript = results.map((result) => result[0].transcript).join(
          "",
        );
        // Only a final trailing command sends; interim hypotheses may change.
        const { text, send: shouldSend } = speechDraft(
          base,
          transcript,
          results.length > 0 && results.every((result) => result.isFinal),
          latest.current.settings.sendPhrase,
        );
        latest.current.onInput(text);
        if (shouldSend) {
          stop();
          if (text.trim()) latest.current.onSend(text);
        }
      };
      current.onerror = (event) => {
        const messages: Record<string, string> = {
          "not-allowed":
            "マイクの使用が許可されていません。アプリ／OSのマイク権限を確認してください。",
          "service-not-allowed":
            "この環境では音声認識サービスを利用できません。",
          "audio-capture":
            "マイクを利用できません。接続と設定を確認してください。",
          network: "音声認識サービスに接続できません。",
          "no-speech":
            "音声を検出できませんでした。マイクボタンで再開できます。",
        };
        setError(
          `音声認識: ${messages[event.error] ?? event.error} (${event.error})`,
        );
        stop();
      };
      current.onend = stop;
      setListening(true);
      current.start();
      // Metering is optional: failure must not disable browser recognition.
      void navigator.mediaDevices?.getUserMedia({ audio: true }).then(
        (stream) => {
          if (recognition.current !== current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          meterRef.current = stream;
          setMeterStream(stream);
        },
      ).catch(() => {});
    } catch (caught) {
      stop();
      setError(
        `音声認識を開始できません: ${
          caught instanceof Error ? caught.message : String(caught)
        }`,
      );
    }
  }

  if (options.settings.provider !== "browser") return recorded;
  return {
    listening,
    busy: false,
    meterStream,
    silenceHint: "",
    retainedCount: 0,
    retryRecording: () => {},
    status: listening ? "recording" : "idle",
    error,
    supported: !!Constructor,
    toggle,
    stop,
  };
}
