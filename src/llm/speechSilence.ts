// Require a short run of audible input before arming the silence timeout.
export function createSilenceDetector(seconds: number) {
  let voiceStarted: number | null = null;
  let lastVoice = 0;
  let armed = false;
  let finished = false;
  return (rms: number, now: number): boolean => {
    if (finished || seconds <= 0) return false;
    if (rms >= 0.015) {
      voiceStarted ??= now;
      if (now - voiceStarted >= 250) armed = true;
      lastVoice = now;
    } else {
      voiceStarted = null;
      if (armed && now - lastVoice >= seconds * 1000) {
        finished = true;
        return true;
      }
    }
    return false;
  };
}

export function watchSpeechSilence(
  stream: MediaStream,
  seconds: number,
  onSilence: () => void,
  onStatus: (available: boolean) => void,
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
    const detect = createSilenceDetector(seconds);
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
        if (detect(rms, performance.now())) {
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
