import { SpeechError } from "./speechErrors";
import { isGeminiSpeech, type SpeechSettings } from "./settings";
import type {
  ExternalHTTPRequest,
  ExternalHTTPResponse,
} from "../lib/wailsBackend";
import {
  applyReplacementRules,
  applySpeechCommands,
  parseReplacementRules,
  type SpeechCommands,
  trailingSpeechCommand,
} from "./speechText";

export function transcriptionURL(
  baseUrl: string,
  endpointType: SpeechSettings["endpointType"] = "openai",
  vertexProjectId = "",
): string {
  if (endpointType === "vertex-transcribe") {
    const project = vertexProjectId.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(project)) {
      throw new SpeechError("speech.error.project");
    }
    return `https://aiplatform.googleapis.com/v1beta1/projects/${project}/locations/global/publishers/google/models/gemini-3.5-transcribe-preview:generateContent`;
  }
  if (endpointType === "gemini-transcribe") {
    return "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent";
  }
  const url = new URL(baseUrl.trim());
  if (
    !["http:", "https:"].includes(url.protocol) || url.username ||
    url.password || url.search || url.hash
  ) {
    throw new SpeechError("speech.error.url");
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
  commands?: SpeechCommands,
  replacements = "",
) {
  const command = trailingSpeechCommand(transcript, sendPhrase);
  const send = final && !!command;
  let spoken = send && command
    ? transcript.slice(0, command.index).trimEnd()
    : transcript;
  if (final) {
    spoken = applyReplacementRules(spoken, parseReplacementRules(replacements));
    if (commands) spoken = applySpeechCommands(spoken, commands);
  }
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
    throw new SpeechError("speech.error.duration");
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
  if (!buffers.length || size <= 0) throw new SpeechError("speech.error.empty");
  if (size > 16000 * 2 * 301) {
    throw new SpeechError("speech.error.combinedDuration");
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

export function validateSpeechSettings(settings: SpeechSettings): string {
  if (settings.provider === "live") {
    if (
      !["openai", "gemini-transcribe", "vertex-transcribe"].includes(
        settings.endpointType,
      )
    ) throw new SpeechError("speech.error.model");
    if (
      settings.endpointType !== "vertex-transcribe" && !settings.apiKey.trim()
    ) throw new SpeechError("speech.error.geminiKey");
    if (
      settings.endpointType === "vertex-transcribe" &&
      !/^[a-z0-9][a-z0-9_-]*$/i.test(settings.vertexProjectId?.trim() ?? "")
    ) throw new SpeechError("speech.error.project");
    return settings.endpointType === "openai"
      ? "wss://api.openai.com/v1/realtime?intent=transcription"
      : settings.endpointType === "vertex-transcribe"
      ? "wss://aiplatform.googleapis.com"
      : "wss://generativelanguage.googleapis.com";
  }
  const url = transcriptionURL(
    settings.baseUrl,
    settings.endpointType,
    settings.vertexProjectId,
  );
  if (isGeminiSpeech(settings.endpointType)) {
    if (
      settings.endpointType === "gemini-transcribe" && !settings.apiKey.trim()
    ) {
      throw new SpeechError("speech.error.geminiKey");
    }
    const language = settings.language.trim();
    if (
      language && language.toLowerCase() !== "auto" &&
      !/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(language)
    ) {
      throw new SpeechError("speech.error.language");
    }
  } else if (
    settings.endpointType !== "whisper-cpp" && !settings.model.trim()
  ) {
    throw new SpeechError("speech.error.model");
  }
  return url;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function geminiTranscript(result: unknown): string {
  const invalid = () => new SpeechError("speech.error.invalid");
  if (
    !result || typeof result !== "object" || Array.isArray(result) ||
    "error" in result
  ) throw invalid();
  if (
    "promptFeedback" in result && result.promptFeedback &&
    typeof result.promptFeedback === "object" &&
    "blockReason" in result.promptFeedback
  ) {
    throw new SpeechError("speech.error.blocked");
  }
  if (
    !("candidates" in result) || !Array.isArray(result.candidates) ||
    !result.candidates.length
  ) throw invalid();
  const candidate = result.candidates[0];
  if (!candidate || typeof candidate !== "object") throw invalid();
  // Never insert/send a partial transcript (including a partial send command).
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new SpeechError("speech.error.incomplete");
  }
  const parts = candidate.content?.parts;
  if (parts === undefined && candidate.finishReason === "STOP") return "";
  if (!Array.isArray(parts)) throw invalid();
  return parts.map((part: unknown) => {
    if (!part || typeof part !== "object") throw invalid();
    if ("thought" in part && part.thought === true) return "";
    if (!("text" in part) || typeof part.text !== "string") throw invalid();
    return part.text;
  }).join("").trim();
}

export async function transcribeSpeech(
  audio: Blob,
  settings: SpeechSettings,
  transport: (request: ExternalHTTPRequest) => Promise<ExternalHTTPResponse>,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const url = validateSpeechSettings(settings);
  const google = isGeminiSpeech(settings.endpointType);
  const native = settings.endpointType === "whisper-cpp";
  if (!audio.size) throw new SpeechError("speech.error.empty");
  let headers: Record<string, string>;
  let bodyBase64: string;
  if (google) {
    if (audio.size <= 44) throw new SpeechError("speech.error.empty");
    if (audio.size > 44 + 301 * 16000 * 2) {
      throw new SpeechError("speech.error.totalDuration");
    }
    const language = settings.language.trim();
    const languageCodes = !language || language.toLowerCase() === "auto"
      ? []
      : [language === "ja" ? "ja-JP" : language === "en" ? "en-US" : language];
    const body = JSON.stringify({
      contents: [{
        role: "user",
        parts: [{
          inlineData: {
            mimeType: "audio/wav",
            data: bytesToBase64(new Uint8Array(await audio.arrayBuffer())),
          },
        }],
      }],
      generationConfig: { audioTranscriptionConfig: { languageCodes } },
    });
    headers = { "Content-Type": "application/json" };
    if (settings.endpointType === "gemini-transcribe") {
      headers["x-goog-api-key"] = settings.apiKey.trim();
    }
    bodyBase64 = bytesToBase64(new TextEncoder().encode(body));
  } else {
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
    bodyBase64 = bytesToBase64(bytes);
    headers = { "Content-Type": request.headers.get("content-type")! };
    if (settings.apiKey.trim()) {
      headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
    }
  }
  signal.throwIfAborted();
  const response = await transport({
    url,
    method: "POST",
    headers,
    bodyBase64,
  });
  signal.throwIfAborted();
  // Never echo server error bodies, which may contain credentials or recorded text.
  if (response.status < 200 || response.status >= 300) {
    throw new SpeechError(
      response.status === 401 || response.status === 403
        ? google
          ? settings.endpointType === "vertex-transcribe"
            ? "speech.error.vertexAuth"
            : "speech.error.geminiAuth"
          : "speech.error.auth"
        : "speech.error.server",
      `STT HTTP ${response.status}: `,
    );
  }

  let result: unknown;
  try {
    result = JSON.parse(response.body);
  } catch {
    throw new SpeechError("speech.error.json");
  }
  if (google) return geminiTranscript(result);
  if (
    !result || typeof result !== "object" || !("text" in result) ||
    typeof result.text !== "string"
  ) {
    throw new SpeechError("speech.error.text");
  }
  const text = result.text.trim();
  return /^\[BLANK_AUDIO\]$/i.test(text) ? "" : text;
}
