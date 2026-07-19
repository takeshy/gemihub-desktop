import { isEpubFileName } from "../lib/epub";

export type DocKind =
  | "markdown"
  | "text"
  | "html"
  | "epub"
  | "pdf"
  | "image"
  | "audio"
  | "video"
  | "external"
  | "canvas"
  | "base"
  | "kanban"
  | "workflow";

/** Files returned by the desktop backend as data URLs, never editable text. */
export function isBinaryDocumentFileName(fileName: string): boolean {
  return /\.(avif|bmp|epub|gif|jpe?g|pdf|png|svg|webp|mp3|m4a|wav|ogg|flac|aac|opus|mp4|webm|mov|avi|mkv|xlsx?|xlsm|xlsb|ods|docx?|pptx?|pages|numbers|key|zip|7z|rar|tar|gz)$/i
    .test(fileName);
}

export function docKindFor(fileName: string): DocKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".canvas")) return "canvas";
  if (lower.endsWith(".base")) return "base";
  if (lower.endsWith(".kanban")) return "kanban";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "workflow";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (isEpubFileName(lower)) return "epub";
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(xlsx?|xlsm|xlsb|ods|docx?|pptx?|pages|numbers|key|zip|7z|rar|tar|gz)$/i.test(lower)) return "external";
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(lower)) return "image";
  if (/\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i.test(lower)) return "audio";
  if (/\.(mp4|webm|mov|avi|mkv)$/i.test(lower)) return "video";
  return "text";
}
