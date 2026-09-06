import { useI18n } from "../i18n/context";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

function AudioMeter({ stream }: { stream: MediaStream | null }) {
  const { t } = useI18n();
  const bars = useRef<HTMLSpanElement[]>([]);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(false);
    if (!stream || typeof AudioContext === "undefined") return;
    let context: AudioContext | undefined;
    let frame = 0;
    let disposed = false;
    try {
      context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      const values = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(values);
        bars.current.forEach((bar, i) => {
          let sum = 0;
          for (let j = 0; j < 6; j++) sum += values[1 + i * 6 + j];
          bar.style.height = `${3 + (sum / (6 * 255)) * 29}px`;
        });
        frame = requestAnimationFrame(draw);
      };
      void context.resume().then(() => {
        if (disposed || context?.state !== "running") return;
        setAvailable(true);
        draw();
      }).catch(() => {});
    } catch { /* Recognition remains usable without the optional meter. */ }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      void context?.close().catch(() => {});
    };
  }, [stream]);
  return (
    <div className="speech-meter-wrap">
      <div
        className="speech-meter"
        role="img"
        aria-label={available ? t("speech.meter") : t("speech.noMeter")}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            ref={(node) => {
              if (node) bars.current[i] = node;
            }}
          />
        ))}
      </div>
      <small>{available ? t("speech.level") : t("speech.noLevel")}</small>
    </div>
  );
}

export function SpeechActivity({ status, stream, browser, silenceHint }: {
  status: string;
  stream: MediaStream | null;
  browser: boolean;
  silenceHint?: string;
}) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [status]);
  const listening = status === "recording";
  const title = listening
    ? t("speech.listening")
    : status === "starting"
    ? t("speech.starting")
    : status === "preparing"
    ? t("speech.preparing")
    : t("speech.transcribing");
  return (
    <div
      className={`speech-activity ${
        listening ? "is-listening" : "is-processing"
      }`}
    >
      {listening ? <AudioMeter stream={stream} /> : (
        <LoaderCircle
          className="speech-spinner"
          size={24}
          aria-hidden="true"
        />
      )}
      <div className="speech-activity-copy">
        <strong role="status">{title}</strong>
        <small>
          {listening
            ? browser ? t("speech.liveHint") : t("speech.recordHint")
            : browser || status === "starting"
            ? t("speech.cancelHint")
            : t("speech.retainHint")}
        </small>
        {listening && silenceHint && <small>{silenceHint}</small>}
        {status === "transcribing" && elapsed >= 20 && (
          <small>
            {t("speech.waiting")}
          </small>
        )}
      </div>
      <time
        className="speech-elapsed"
        aria-label={t("speech.elapsed").replace("{seconds}", String(elapsed))}
      >
        {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
      </time>
      {!listening && (
        <div className="speech-progress" aria-hidden="true">
          <span />
        </div>
      )}
    </div>
  );
}
