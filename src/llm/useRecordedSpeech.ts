import { useEffect, useRef, useState } from "react";
import { workflowHTTPRequest } from "../lib/wailsBackend";
import type { SpeechSettings } from "./settings";
import { watchSpeechSilence } from "./speechSilence";
import {
  recordingsToWav,
  speechDraft,
  transcribeSpeech,
  transcriptionURL,
} from "./speechTranscription";

export interface ChatSpeechOptions {
  input: string;
  scope: string;
  disabled: boolean;
  settings: SpeechSettings;
  onInput: (text: string) => void;
  onSend: (text: string) => void;
}

export function useRecordedSpeech(options: ChatSpeechOptions) {
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<
    {
      controller: AbortController;
      stream?: MediaStream;
      recorder?: MediaRecorder;
      timer?: ReturnType<typeof setTimeout>;
      stopSilence?: () => void;
      startedAt?: number;
      captured?: boolean;
      cancelAfterStop?: boolean;
    } | null
  >(null);
  const retained = useRef<{ clips: Blob[]; durationMs: number }>({
    clips: [],
    durationMs: 0,
  });
  const [retainedCount, setRetainedCount] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "starting" | "recording" | "preparing" | "transcribing"
  >("idle");
  const [meterStream, setMeterStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [silenceHint, setSilenceHint] = useState("");
  const supported = !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    typeof OfflineAudioContext !== "undefined";

  function stop(preserve = true) {
    const current = active.current;
    active.current = null;
    if (current) {
      current.controller.abort();
      clearTimeout(current.timer);
      current.stopSilence?.();
      if (current.recorder) {
        current.recorder.onstop = null;
        current.recorder.ondataavailable = null;
        current.recorder.onerror = null;
        if (current.recorder.state !== "inactive") current.recorder.stop();
      }
      current.stream?.getTracks().forEach((track) => track.stop());
    }
    setStatus("idle");
    setMeterStream(null);
    setSilenceHint("");
    if (!preserve) {
      retained.current = { clips: [], durationMs: 0 };
      setRetainedCount(0);
    }
  }

  function finishRecording(current: NonNullable<typeof active.current>) {
    if (active.current !== current || current.recorder?.state !== "recording") {
      return;
    }
    clearTimeout(current.timer);
    current.stopSilence?.();
    current.recorder.stop();
    current.stream?.getTracks().forEach((track) => track.stop());
    setStatus("preparing");
    setMeterStream(null);
    setSilenceHint("");
  }

  useEffect(() => {
    stop(false);
    setError("");
    return () => stop(false);
  }, [options.scope, options.settings.provider]);

  useEffect(() => {
    if (options.disabled) stop();
  }, [options.disabled]);

  useEffect(() => {
    stop();
  }, [options.settings]);

  async function transcribeRetained(
    current: NonNullable<typeof active.current>,
    base: string,
    scope: string,
    settings: SpeechSettings,
  ) {
    const valid = () =>
      active.current === current && !latest.current.disabled &&
      latest.current.scope === scope && latest.current.input === base;
    setStatus("preparing");
    setMeterStream(null);
    try {
      const wav = await recordingsToWav(
        retained.current.clips,
        current.controller.signal,
      );
      current.controller.signal.throwIfAborted();
      setStatus("transcribing");
      // Reuse the desktop transport that permits explicit localhost/LAN HTTP endpoints.
      const transcript = await transcribeSpeech(
        wav,
        settings,
        workflowHTTPRequest,
        current.controller.signal,
      );
      if (!valid()) return;
      if (!transcript) {
        throw new Error(
          "音声を認識できませんでした。もう一度録音してください。",
        );
      }
      // Evaluate the send phrase only after the complete recording is transcribed.
      const draft = speechDraft(
        base,
        transcript,
        true,
        settings.sendPhrase,
      );
      stop(false);
      latest.current.onInput(draft.text);
      if (draft.send && draft.text.trim()) {
        latest.current.onSend(draft.text);
      }
    } catch (caught) {
      if (active.current === current) {
        setError(
          `音声認識: ${
            caught instanceof Error ? caught.message : String(caught)
          }`,
        );
      }
    } finally {
      if (active.current === current) stop();
    }
  }

  async function retryRecording() {
    if (active.current || options.disabled || !retained.current.clips.length) {
      return;
    }
    const current = { controller: new AbortController(), captured: true };
    active.current = current;
    setError("");
    await transcribeRetained(current, options.input, options.scope, {
      ...options.settings,
    });
  }

  async function toggle() {
    const previous = active.current;
    if (previous) {
      if (previous.recorder?.state === "recording") {
        finishRecording(previous);
      } else if (previous.recorder && !previous.captured) {
        // Let the final dataavailable/stop events retain the complete last chunk.
        previous.cancelAfterStop = true;
      } else stop();
      return;
    }
    if (options.disabled) return;
    setError("");
    if (retained.current.durationMs >= 299000) {
      setError(
        "保持中の録音が5分に達しています。「保持中の録音を変換」を押してください。",
      );
      return;
    }
    if (!supported) {
      setError("この環境はマイク録音に対応していません。");
      return;
    }
    const current: NonNullable<typeof active.current> = {
      controller: new AbortController(),
    };
    const base = options.input;
    const scope = options.scope;
    const settings = { ...options.settings };
    active.current = current;
    setStatus("starting");
    const valid = () =>
      active.current === current && !latest.current.disabled &&
      latest.current.scope === scope && latest.current.input === base;
    try {
      transcriptionURL(settings.baseUrl, settings.endpointType);
      if (settings.endpointType !== "whisper-cpp" && !settings.model.trim()) {
        throw new Error("STTのModelを設定してください。");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!valid()) {
        stream.getTracks().forEach((track) => track.stop());
        if (active.current === current) stop();
        return;
      }
      current.stream = stream;
      setMeterStream(stream);
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      current.recorder = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      recorder.ondataavailable = (event) => {
        size += event.data.size;
        if (size > 20 * 1024 * 1024) {
          setError("録音サイズの上限に達しました。短く録音し直してください。");
          stop();
        } else if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setError(
          "マイク録音に失敗しました。マイクの接続と権限を確認してください。",
        );
        stop();
      };
      recorder.onstop = async () => {
        clearTimeout(current.timer);
        current.stopSilence?.();
        setSilenceHint("");
        stream.getTracks().forEach((track) => track.stop());
        if (!valid()) {
          if (active.current === current) stop();
          return;
        }
        const clip = new Blob(chunks, { type: recorder.mimeType });
        chunks.length = 0;
        current.captured = true;
        if (clip.size) {
          retained.current = {
            clips: [...retained.current.clips, clip],
            durationMs: retained.current.durationMs +
              (performance.now() - (current.startedAt ?? performance.now())),
          };
          setRetainedCount(retained.current.clips.length);
        }
        if (current.cancelAfterStop) {
          stop();
          return;
        }
        await transcribeRetained(current, base, scope, settings);
      };
      recorder.start(1000);
      current.startedAt = performance.now();
      setStatus("recording");
      if (settings.silenceSeconds > 0) {
        current.stopSilence = watchSpeechSilence(
          stream,
          settings.silenceSeconds,
          () => finishRecording(current),
          (available) => {
            if (active.current === current) {
              setSilenceHint(
                available
                  ? `話し終えてから約${settings.silenceSeconds}秒の無音で自動停止・文字起こしします。`
                  : "無音検出を利用できません。停止ボタンで録音を終了してください。",
              );
            }
          },
        );
      }
      current.timer = setTimeout(
        () => finishRecording(current),
        Math.max(1000, 5 * 60 * 1000 - retained.current.durationMs),
      );
    } catch (caught) {
      if (active.current === current) {
        stop();
        setError(
          `録音を開始できません: ${
            caught instanceof Error ? caught.message : String(caught)
          }`,
        );
      }
    }
  }

  return {
    listening: status === "recording",
    busy: status === "starting" || status === "preparing" ||
      status === "transcribing",
    meterStream,
    silenceHint,
    retainedCount,
    retryRecording,
    status,
    error,
    supported,
    toggle,
    stop: () => stop(),
  };
}
