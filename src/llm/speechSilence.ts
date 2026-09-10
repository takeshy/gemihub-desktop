const NOISE_WINDOW_FRAMES = 50;
const MIN_FLOOR = 0.001;

export function createVoiceGate(
  {
    frames = NOISE_WINDOW_FRAMES,
    voiceMargin = 3.5,
    silenceMargin = 1.8,
    minVoice = 0.012,
  } = {},
) {
  const recent = new Array(frames).fill(MIN_FLOOR);
  let next = 0;
  let voice = false;
  return (rms: number): boolean => {
    recent[next] = rms;
    next = (next + 1) % frames;
    const ordered = recent.toSorted((a, b) => a - b);
    const floor = Math.max(
      MIN_FLOOR,
      ordered[Math.floor((ordered.length - 1) * 0.2)],
    );
    const threshold = voice
      ? Math.max(minVoice * 0.6, floor * silenceMargin)
      : Math.max(minVoice, floor * voiceMargin);
    voice = rms >= threshold;
    return voice;
  };
}

export function createSilenceDetector(
  seconds: number,
  { graceMs = 3000, ...gateOptions }: {
    graceMs?: number;
    frames?: number;
    voiceMargin?: number;
    silenceMargin?: number;
    minVoice?: number;
  } = {},
) {
  const gate = createVoiceGate(gateOptions);
  let startedAt: number | null = null;
  let firstVoice: number | null = null;
  let previousVoice: number | null = null;
  let lastVoice = 0;
  let armed = false;
  let finished = false;
  return (rms: number, now: number): boolean => {
    startedAt ??= now;
    if (finished || seconds <= 0) return false;
    if (gate(rms)) {
      if (
        firstVoice === null || previousVoice === null ||
        now - previousVoice > 300
      ) firstVoice = now;
      if (now - firstVoice >= 100) {
        armed = true;
        lastVoice = now;
      }
      previousVoice = now;
    } else if (
      armed && now - startedAt >= graceMs && now - lastVoice >= seconds * 1000
    ) {
      finished = true;
      return true;
    }
    return false;
  };
}

export function watchSpeechSilence(
  stream: MediaStream,
  seconds: number,
  onSilence: () => void,
  onStatus: (available: boolean) => void,
  onVoice: () => void = () => {},
  graceMs = 3000,
): () => void {
  let context: AudioContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const cleanup = () => {
    disposed = true;
    clearInterval(timer);
    if (context && context.state !== "closed") {
      void context.close().catch(() => {});
    }
  };
  try {
    context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const detect = createSilenceDetector(seconds, { graceMs });
    void context.resume().then(() => {
      if (disposed) return;
      if (context?.state !== "running") {
        onStatus(false);
        cleanup();
        return;
      }
      onStatus(true);
      timer = setInterval(() => {
        if (context?.state !== "running") {
          onStatus(false);
          cleanup();
          return;
        }
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, sample) => sum + sample * sample, 0) /
            samples.length,
        );
        const quiet = detect(rms, performance.now());
        if (rms >= 0.012) onVoice();
        if (quiet) {
          cleanup();
          onSilence();
        }
      }, 100);
    }).catch(() => {
      if (!disposed) onStatus(false);
      cleanup();
    });
  } catch {
    onStatus(false);
    cleanup();
  }
  return cleanup;
}
