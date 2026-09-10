import { createVoiceGate } from "./speechSilence";

export function resamplePCM16(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Int16Array {
  if (!input.length || inputRate <= 0 || outputRate <= 0) {
    return new Int16Array();
  }
  const output = new Int16Array(
    Math.max(1, Math.floor(input.length * outputRate / inputRate)),
  );
  const scale = inputRate / outputRate;
  for (let i = 0; i < output.length; i++) {
    const position = i * scale;
    const left = Math.min(input.length - 1, Math.floor(position));
    const right = Math.min(input.length - 1, left + 1);
    const sample = input[left] +
      (input[right] - input[left]) * (position - left);
    const value = Math.max(-1, Math.min(1, sample));
    output[i] = Math.round(value * (value < 0 ? 32768 : 32767));
  }
  return output;
}
function base64(samples: Int16Array): string {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength,
  );
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(value);
}
export async function createPCMCapture(
  stream: MediaStream,
  outputRate: number,
  onChunk: (chunk: string) => Promise<void>,
  onError: (error: unknown) => void,
) {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  let stopped = false;
  let pending = Promise.resolve();
  const gate = createVoiceGate();
  let first: number | null = null;
  let previous: number | null = null;
  let heard = false;
  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = event.inputBuffer.getChannelData(0);
    const rms = Math.sqrt(
      input.reduce((sum, sample) => sum + sample * sample, 0) / input.length,
    );
    if (gate(rms)) {
      const now = performance.now();
      if (first === null || previous === null || now - previous > 300) {
        first = now;
      }
      if (now - first >= 50) heard = true;
      previous = now;
    }
    pending = pending.then(() =>
      onChunk(base64(resamplePCM16(input, context.sampleRate, outputRate)))
    ).catch((error) => {
      stopped = true;
      onError(error);
    });
  };
  return {
    heardVoice: () => heard,
    stop: async () => {
      if (!stopped) {
        stopped = true;
        processor.onaudioprocess = null;
        source.disconnect();
        processor.disconnect();
        mute.disconnect();
      }
      await pending;
      await context.close();
    },
  };
}
