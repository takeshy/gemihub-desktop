import type { SpeechSettings } from "./settings";
import type {
  ExternalHTTPRequest,
  ExternalHTTPResponse,
} from "../lib/wailsBackend";

export function transcriptionURL(
  baseUrl: string,
  endpointType: SpeechSettings["endpointType"] = "openai",
): string {
  const url = new URL(baseUrl.trim());
  if (
    !["http:", "https:"].includes(url.protocol) || url.username ||
    url.password || url.search || url.hash
  ) {
    throw new Error(
      "Base URLには認証情報・クエリ・フラグメントを含まないHTTP(S) URLを指定してください。",
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "") +
    (endpointType === "whisper-cpp" ? "/inference" : "/audio/transcriptions");
  return url.toString();
}

export function speechDraft(
  base: string,
  transcript: string,
  final: boolean,
  sendPhrase = "over, オーバー",
) {
  const phrases = sendPhrase.split(/[,、\n]/).map((phrase) => phrase.trim())
    .filter(Boolean).sort((a, b) => b.length - a.length);
  const pattern = phrases.map((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (/^[a-z0-9_]/i.test(phrase) ? "\\b" : "") + escaped;
  }).join("|");
  const command = pattern
    ? new RegExp(`(?:${pattern})[\\s。．.!！?？、,]*$`, "i")
    : null;
  const send = final && !!command && command.test(transcript);
  const spoken = send && command
    ? transcript.replace(command, "").trimEnd()
    : transcript;
  return {
    text: base + (base && spoken && !/\s$/.test(base) ? " " : "") + spoken,
    send,
  };
}

// 16 kHz mono PCM WAV also works with servers that cannot decode WebM/Opus.
export function encodeSpeechWav(samples: Float32Array): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  tag(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      44 + i * 2,
      Math.round(value * (value < 0 ? 32768 : 32767)),
      true,
    );
  });
  return new Blob([bytes], { type: "audio/wav" });
}

export async function recordingToWav(blob: Blob): Promise<Blob> {
  const decoder = new OfflineAudioContext(1, 1, 16000);
  const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
  if (!decoded.length || decoded.duration > 301) {
    throw new Error("録音は5分以内にしてください。");
  }
  const renderer = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * 16000),
    16000,
  );
  const source = renderer.createBufferSource();
  source.buffer = decoded;
  source.connect(renderer.destination);
  source.start();
  const mono = await renderer.startRendering();
  return encodeSpeechWav(mono.getChannelData(0));
}

// Join PCM payloads, not complete WAV/WebM files with separate container headers.
export async function combineSpeechWavs(wavs: Blob[]): Promise<Blob> {
  const buffers = await Promise.all(wavs.map((wav) => wav.arrayBuffer()));
  const size = buffers.reduce(
    (total, buffer) => total + buffer.byteLength - 44,
    0,
  );
  if (!buffers.length || size <= 0) throw new Error("録音が空です。");
  if (size > 16000 * 2 * 301) {
    throw new Error("保持分を含めた録音は5分以内にしてください。");
  }
  const result = new Uint8Array(44 + size);
  result.set(new Uint8Array(buffers[0], 0, 44));
  let offset = 44;
  for (const buffer of buffers) {
    const pcm = new Uint8Array(buffer, 44);
    result.set(pcm, offset);
    offset += pcm.length;
  }
  const header = new DataView(result.buffer);
  header.setUint32(4, result.byteLength - 8, true);
  header.setUint32(40, size, true);
  return new Blob([result], { type: "audio/wav" });
}

export async function recordingsToWav(
  clips: Blob[],
  signal: AbortSignal,
): Promise<Blob> {
  const wavs: Blob[] = [];
  for (const clip of clips) {
    signal.throwIfAborted();
    wavs.push(await recordingToWav(clip));
  }
  signal.throwIfAborted();
  return combineSpeechWavs(wavs);
}

export async function transcribeSpeech(
  audio: Blob,
  settings: SpeechSettings,
  transport: (request: ExternalHTTPRequest) => Promise<ExternalHTTPResponse>,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const url = transcriptionURL(settings.baseUrl, settings.endpointType);
  const native = settings.endpointType === "whisper-cpp";
  if (!native && !settings.model.trim()) {
    throw new Error("STTのModelを設定してください。");
  }
  if (!audio.size) throw new Error("録音が空です。");
  const form = new FormData();
  form.append("file", audio, "recording.wav");
  if (!native) form.append("model", settings.model.trim());
  if (native) form.append("response_format", "json");
  const language = settings.language.trim();
  if (native) {
    form.append(
      "language",
      language && language.toLowerCase() !== "auto" ? language : "auto",
    );
  } else if (language && language.toLowerCase() !== "auto") {
    form.append("language", language);
  }
  const request = new Request(url, { method: "POST", body: form });
  const bytes = new Uint8Array(await request.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("content-type")!,
  };
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }
  signal.throwIfAborted();
  const response = await transport({
    url,
    method: "POST",
    headers,
    bodyBase64: btoa(binary),
  });
  signal.throwIfAborted();
  // Never echo server error bodies, which may contain credentials or recorded text.
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `STT HTTP ${response.status}: ${
        response.status === 401 || response.status === 403
          ? "API Keyとサーバーの認証設定を確認してください。"
          : "Base URL・Model・サーバーの対応形式を確認してください。"
      }`,
    );
  }
  let result: unknown;
  try {
    result = JSON.parse(response.body);
  } catch {
    throw new Error("STTの応答がJSONではありません。");
  }
  if (
    !result || typeof result !== "object" || !("text" in result) ||
    typeof result.text !== "string"
  ) {
    throw new Error("STTの応答にtextフィールドがありません。");
  }
  const text = result.text.trim();
  return /^\[BLANK_AUDIO\]$/i.test(text) ? "" : text;
}
