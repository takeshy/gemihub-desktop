import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/context";
import { speechHTTPRequest } from "../lib/wailsBackend";
import type { SpeechSettings } from "./settings";
import { speechErrorMessage } from "./speechErrors";
import { watchSpeechSilence } from "./speechSilence";
import {
  recordingsToWav,
  speechDraft,
  transcribeSpeech,
  validateSpeechSettings,
} from "./speechTranscription";

export interface ChatSpeechOptions {
  input: string;
  scope: string;
  disabled: boolean;
  settings: SpeechSettings;
  onInput: (text: string) => void;
  onSend: (text: string) => void;
  /**
   * The send phrase ended listening with nothing to send. The user asked to
   * stop rather than to say something, so hands-free mode ends with it.
   */
  onEnd?: () => void;
}
interface QueuedClip {
  clip: Blob;
  durationMs: number;
  afterSilence: boolean;
}
interface Session {
  controller: AbortController;
  settings: SpeechSettings;
  stream?: MediaStream;
  mimeType?: string;
  recorder?: MediaRecorder;
  recorders: Set<MediaRecorder>;
  stopSilence?: () => void;
  timer?: ReturnType<typeof setTimeout>;
  pendingCaptures: number;
  processing: boolean;
  ending?: boolean;
  cancelAfterStop?: boolean;
  startedAt?: number;
  base: string;
  lastRendered: string;
}
type TaggedRecorder = MediaRecorder & { afterSilence?: boolean };

export function useRecordedSpeech(options: ChatSpeechOptions) {
  const { t } = useI18n();
  const latest = useRef(options);
  latest.current = options;
  const active = useRef<Session | null>(null);
  const retained = useRef<QueuedClip[]>([]);
  const [retainedCount, setRetainedCount] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "starting" | "recording" | "preparing" | "transcribing"
  >("idle");
  const [meterStream, setMeterStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [silenceHint, setSilenceHint] = useState("");
  const [backgroundTranscribing, setBackgroundTranscribing] = useState(false);
  const supported = !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    typeof OfflineAudioContext !== "undefined";

  function publishQueue() {
    setRetainedCount(retained.current.length);
  }
  function stop(preserve = true) {
    const current = active.current;
    active.current = null;
    if (current) {
      current.controller.abort();
      clearTimeout(current.timer);
      current.stopSilence?.();
      for (const recorder of current.recorders) {
        recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      current.stream?.getTracks().forEach((track) => track.stop());
    }
    if (!preserve) retained.current = [];
    publishQueue();
    setStatus("idle");
    setMeterStream(null);
    setSilenceHint("");
    setBackgroundTranscribing(false);
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

  function newSession(settings = { ...options.settings }): Session {
    return {
      controller: new AbortController(),
      settings,
      recorders: new Set(),
      pendingCaptures: 0,
      processing: false,
      base: options.input,
      lastRendered: options.input,
    };
  }

  async function drain(current: Session) {
    if (current.processing || active.current !== current) return;
    current.processing = true;
    try {
      while (retained.current.length && active.current === current) {
        const queued = retained.current[0];
        if (current.ending) {
          setStatus("preparing");
          setMeterStream(null);
        }
        const wav = await recordingsToWav(
          [queued.clip],
          current.controller.signal,
        );
        current.controller.signal.throwIfAborted();
        if (current.ending) setStatus("transcribing");
        else setBackgroundTranscribing(true);
        const transcript = await transcribeSpeech(
          wav,
          current.settings,
          speechHTTPRequest,
          current.controller.signal,
        );
        if (active.current !== current) return;
        if (!transcript) {
          if (queued.afterSilence) {
            retained.current.shift();
            publishQueue();
            continue;
          }
          throw new Error(t("speech.empty"));
        }
        if (latest.current.input !== current.lastRendered) {
          current.base = latest.current.input;
        }
        const draft = speechDraft(
          current.base,
          transcript,
          true,
          current.settings.sendPhrase,
          {
            question: current.settings.questionPhrases ?? "",
            newline: current.settings.newlinePhrases ?? "",
            exclamation: current.settings.exclamationPhrases ?? "",
          },
          current.settings.replacements ?? "",
        );
        retained.current.shift();
        publishQueue();
        current.base = draft.text;
        current.lastRendered = draft.text;
        latest.current.onInput(draft.text);
        // The send phrase always ends the session, even when it is the only
        // thing said: there is then nothing to send, but recording must stop.
        if (draft.send) {
          stop(false);
          if (draft.text.trim()) latest.current.onSend(draft.text);
          else latest.current.onEnd?.();
          return;
        }
      }
    } catch (caught) {
      if (active.current === current) {
        setError(
          `${t("speech.recognitionError")}: ${speechErrorMessage(caught, t)}`,
        );
        current.cancelAfterStop = true;
        if (current.recorder?.state === "recording") finishRecording(current);
        else if (!current.pendingCaptures) stop();
      }
    } finally {
      current.processing = false;
      if (active.current === current && !current.ending) {
        setBackgroundTranscribing(false);
      }
      if (
        active.current === current && current.ending &&
        !current.pendingCaptures && !retained.current.length
      ) stop(false);
    }
  }

  function finishRecording(current: Session, afterSilence = false) {
    if (active.current !== current || current.recorder?.state !== "recording") {
      return;
    }
    const recorder = current.recorder as TaggedRecorder;
    recorder.afterSilence = afterSilence;
    current.stopSilence?.();
    if (!afterSilence) {
      current.ending = true;
      clearTimeout(current.timer);
    }
    recorder.stop();
    if (afterSilence) startChunk(current, true);
    else {
      current.stream?.getTracks().forEach((track) => track.stop());
      setStatus("preparing");
      setMeterStream(null);
      setSilenceHint("");
    }
  }

  function startChunk(current: Session, followsSilence = false) {
    if (!current.stream) return;
    const stream = current.stream;
    const recorder = new MediaRecorder(
      stream,
      current.mimeType ? { mimeType: current.mimeType } : undefined,
    ) as TaggedRecorder;
    current.recorder = recorder;
    current.recorders.add(recorder);
    current.pendingCaptures++;
    const chunks: Blob[] = [];
    let size = 0;
    let heardVoice = false;
    let silenceAvailable = false;
    const startedAt = performance.now();
    recorder.ondataavailable = (event) => {
      if (active.current !== current) return;
      size += event.data.size;
      const queuedBytes = retained.current.reduce(
        (sum, item) => sum + item.clip.size,
        0,
      );
      if (size + queuedBytes > 20 * 1024 * 1024) {
        setError(t("speech.sizeLimit"));
        stop();
      } else if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      setError(t("speech.recordError"));
      stop();
    };
    recorder.onstop = async () => {
      current.recorders.delete(recorder);
      current.pendingCaptures--;
      if (active.current !== current) return;
      const clip = new Blob(chunks, { type: recorder.mimeType });
      // A clip the voice gate never fired on is silence: transcribing it costs a
      // request and invites an invented sentence, so it is dropped unqueued.
      const silent = silenceAvailable && !heardVoice;
      if (silent && current.ending && !retained.current.length) {
        setError(t("speech.noSpeech"));
      }
      if (clip.size && !silent) {
        retained.current.push({
          clip,
          durationMs: performance.now() - startedAt,
          afterSilence: recorder.afterSilence === true,
        });
      }
      publishQueue();
      if (current.cancelAfterStop) {
        if (!current.pendingCaptures) stop();
        return;
      }
      await drain(current);
    };
    current.startedAt ??= performance.now();
    recorder.start(1000);
    // The watcher also feeds the voice gate that keeps a silent clip from being
    // transcribed, so it runs even when automatic stopping is off.
    current.stopSilence = watchSpeechSilence(
      stream,
      current.settings.silenceSeconds,
      () => finishRecording(current, true),
      (available) => {
        silenceAvailable = available;
        if (active.current === current) {
          setSilenceHint(
            current.settings.silenceSeconds <= 0
              ? ""
              : available
              ? t("speech.autoStopHint").replace(
                "{seconds}",
                String(current.settings.silenceSeconds),
              )
              : t("speech.noSilence"),
          );
        }
      },
      () => {
        heardVoice = true;
      },
      followsSilence ? 0 : 3000,
    );
  }

  /** Close the retained-clips notice: drop the audio it offers and the error. */
  function dismiss() {
    retained.current = [];
    publishQueue();
    setError("");
  }

  async function retryRecording() {
    if (active.current || options.disabled || !retained.current.length) return;
    const current = newSession();
    current.ending = true;
    active.current = current;
    setError("");
    await drain(current);
  }

  async function toggle() {
    if (active.current) {
      if (active.current.recorder?.state === "recording") {
        finishRecording(active.current);
      } else if (active.current.pendingCaptures) {
        active.current.cancelAfterStop = true;
      } else stop();
      return;
    }
    if (options.disabled) return;
    setError("");
    if (!supported) {
      setError(t("speech.noRecording"));
      return;
    }
    const current = newSession();
    active.current = current;
    setStatus("starting");
    try {
      validateSpeechSettings(current.settings);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (active.current !== current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      // Retry deliberately reuses retained audio; starting a new recording is
      // the opposite choice: abandon a clip that may itself be why transcription
      // keeps failing. Only after the microphone is acquired, so a permission
      // failure does not destroy the one retryable recording.
      retained.current = [];
      current.stream = stream;
      current.mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      startChunk(current);
      setMeterStream(stream);
      setStatus("recording");
      publishQueue();
      current.timer = setTimeout(() => finishRecording(current), 5 * 60 * 1000);
    } catch (caught) {
      if (active.current === current) {
        stop();
        setError(
          `${t("speech.recordStartError")}: ${speechErrorMessage(caught, t)}`,
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
    backgroundTranscribing,
    supported,
    toggle,
    dismiss,
    stop: () => stop(),
  };
}
