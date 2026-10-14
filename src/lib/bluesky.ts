import { localHrefToPathCandidates, pathDirName, wikiEmbedPathCandidates } from "./wikiLinks";

/** A frozen, explicit publication selection. No new replies enter an open dialog. */
export interface BlueskyEntry { id: string; content: string; createdAt: string; replyTo: string; authorName: string; speaker: string; sourcePath: string }
export interface BlueskyImage { data: string; mime: string; alt: string }
export interface BlueskyPost { images?: BlueskyImage[]; id: string; text: string; createdAt: string; parent: string }
export interface BlueskyConnection { connected: boolean; handle?: string; did?: string }
export interface BlueskyAdapter {
  /** Read the first existing Workspace image among the path candidates. */
  image(candidates: string[], alt: string): Promise<BlueskyImage>;
  status(): Promise<BlueskyConnection>;
  connect(handle: string): Promise<void>;
  cancelConnect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(posts: BlueskyPost[], did: string): Promise<{ urls: string[] }>;
}
/** A Workspace image referenced by a Timeline post. */
export interface BlueskyImageRef { candidates: string[]; alt: string }
export type BlueskyImageLoader = (ref: BlueskyImageRef, entry: BlueskyEntry) => Promise<BlueskyImage>;
/** Entries published as pictures of their rendered Markdown. `render` returns the pages, or null to fall back to text. */
export interface BlueskySnapshots { ids: Set<string>; render: (entry: BlueskyEntry) => Promise<BlueskyImage[] | null> }

/** Fired on window when the Bluesky setting or connection changes. */
export const BLUESKY_CHANGED_EVENT = "gemihub:bluesky-changed";

// Bluesky's limit is 300 graphemes. The server validates with a different
// segmenter than the browser, so chunks keep a margin.
const MAX_GRAPHEMES = 290;
const MAX_BYTES = 3000;
const ATTACHABLE_IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const URL_RE = /https?:\/\/[^\s<>()]+/g;
const encoder = new TextEncoder();
const utf8Length = (text: string) => encoder.encode(text).length;
const segments = (text: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), value => value.segment);
const graphemeCount = (text: string) => segments(text).length;
const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
const unique = (paths: string[]) => paths.filter((path, index) => path && paths.indexOf(path) === index);
const targetName = (target: string) => {
  const clean = target.split("|")[0].split("#")[0].trim();
  return clean.split("/").pop()!.replace(/\.(md|markdown)$/i, "");
};

/** Apply `transform` to the text between URLs so inline markup rules never rewrite a link. */
function outsideUrls(text: string, transform: (part: string) => string): string {
  let result = "", last = 0;
  for (const match of text.matchAll(URL_RE)) {
    result += transform(text.slice(last, match.index!)) + match[0];
    last = match.index! + match[0].length;
  }
  return result + transform(text.slice(last));
}

/**
 * Turn Timeline Markdown into public plain text: Workspace images become
 * attachments, links and embeds keep their readable text, and Timeline-only
 * markup (calendar markers, callouts, @ai, emphasis) is removed.
 */
export function blueskyContent(content: string, sourcePath: string): { text: string; images: BlueskyImageRef[] } {
  const baseDir = pathDirName(sourcePath);
  const images: BlueskyImageRef[] = [];
  let text = content.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
  // One pass keeps attachments in their written order.
  text = text.replace(/!\[\[([^\]\n]+)\]\]|!\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g, (_match, wiki: string | undefined, alt = "", href = "") => {
    if (wiki) {
      const [path, label = ""] = wiki.split("|");
      const clean = path.split("#")[0].trim();
      if (!ATTACHABLE_IMAGE.test(clean)) return targetName(wiki);
      images.push({ candidates: unique([...wikiEmbedPathCandidates(baseDir, path.trim()), clean.replace(/^\/+/, "")]), alt: label.trim() });
      return "";
    }
    if (/^https?:\/\//i.test(href)) return alt ? `${alt} ${href}` : href;
    const clean = decode(href.split(/[?#]/)[0]);
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || !ATTACHABLE_IMAGE.test(clean)) return alt || targetName(clean);
    images.push({ candidates: unique([...wikiEmbedPathCandidates(baseDir, clean), ...localHrefToPathCandidates(baseDir, href)]), alt });
    return "";
  });
  text = text
    .replace(/\[\[([^\]\n]+)\]\]/g, (_match, target: string) => target.split("|")[1]?.trim() || targetName(target))
    .replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g, (_match, label: string, href: string) =>
      /^https?:\/\//i.test(href) && label !== href ? `${label} ${href}` : label)
    .replace(/^>\s?\[![^\]]+\][+-]?\s*/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^```.*$/gm, "");
  text = outsideUrls(text, part => part
    .replace(/(\*\*|__|~~|==)(?=\S)([^\n]*?\S)\1/g, "$2")
    .replace(/`([^`\n]+)`/g, "$1"));
  text = text
    .replace(/(^|\s)@ai\b[ \t]?/gi, "$1")
    .replace(/(\S)[ \t]{2,}/g, "$1 ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
  return { text: text.trim(), images };
}

// Markup that plain text cannot carry: code, tables, callouts (other than
// Timeline calendar markers), math and diagrams.
const SNAPSHOT_MARKUP = [
  /^\s*(```|~~~)/m,
  /^\s*\|?\s*:?-{3,}:?\s*\|/m,
  /^>\s?\[!(?!calendar\])[^\]\n]+\]/im,
  /^\s*\$\$/m,
];

/** Whether an entry reads better as a picture of its rendered Markdown. */
export function blueskyPrefersImage(content: string): boolean {
  return SNAPSHOT_MARKUP.some(pattern => pattern.test(content));
}

/** The text of a picture post: only the links, which the picture cannot make clickable. */
export function blueskyImageCaption(content: string, sourcePath: string): string {
  const { text } = blueskyContent(content, sourcePath);
  let caption = "";
  for (const url of new Set(Array.from(text.matchAll(URL_RE), match => match[0]))) {
    const next = caption ? `${caption}\n${url}` : url;
    if (graphemeCount(next) > MAX_GRAPHEMES || utf8Length(next) > MAX_BYTES) break;
    caption = next;
  }
  return caption;
}

/** Split into Bluesky-sized chunks, preferring whitespace and never cutting a URL when avoidable. */
export function splitBlueskyText(text: string): string[] {
  const parts = segments(text);
  const starts: number[] = [];
  let length = 0;
  for (const part of parts) { starts.push(length); length += part.length; }
  const urls = [...text.matchAll(URL_RE)].map(match => [match.index!, match.index! + match[0].length]);
  const chunks: string[] = [];
  let offset = 0;
  while (offset < parts.length) {
    while (offset < parts.length && /^\s+$/.test(parts[offset])) offset++;
    if (offset >= parts.length) break;
    let end = offset, bytes = 0;
    while (end < parts.length && end - offset < MAX_GRAPHEMES) {
      const size = utf8Length(parts[end]);
      if (bytes + size > MAX_BYTES) break;
      bytes += size; end++;
    }
    if (end === offset) throw new Error("A character exceeds Bluesky's byte limit");
    if (end < parts.length) {
      let cut = end;
      for (let index = end - 1; index > offset + (end - offset) / 2; index--) {
        if (/^\s+$/.test(parts[index])) { cut = index + 1; break; }
      }
      const url = urls.find(([from, to]) => from < starts[cut] && starts[cut] < to);
      if (url) {
        const urlStart = starts.findIndex(start => start >= url[0]);
        if (urlStart > offset) cut = urlStart;
      }
      end = cut;
    }
    const chunk = parts.slice(offset, end).join("").trimEnd();
    if (chunk) chunks.push(chunk);
    offset = end;
  }
  return chunks;
}

/** The posts to publish for the selection, parents first, each entry as text or as pictures. */
export async function buildBlueskyPosts(
  entries: BlueskyEntry[],
  selected: Set<string>,
  image: BlueskyImageLoader,
  snapshots?: BlueskySnapshots,
): Promise<BlueskyPost[]> {
  const chosen = entries.filter(entry => selected.has(entry.id));
  if (!chosen.length) throw new Error("Select at least one post");
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("Resolve duplicate Timeline IDs before publishing");
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const selectedParent = (entry: BlueskyEntry) => {
    let parent = entry.replyTo;
    const visited = new Set([entry.id]);
    while (parent) {
      if (visited.has(parent)) throw new Error("Invalid reply chain");
      visited.add(parent);
      if (selected.has(parent)) return parent;
      parent = byId.get(parent)?.replyTo || "";
    }
    return "";
  };
  const pending = [...chosen];
  const posts: BlueskyPost[] = [];
  const last = new Map<string, string>();
  while (pending.length) {
    const index = pending.findIndex(entry => !selectedParent(entry) || last.has(selectedParent(entry)));
    if (index < 0) throw new Error("Invalid reply chain");
    const entry = pending.splice(index, 1)[0];
    const author = entry.speaker !== "user" && entry.authorName ? `${entry.authorName}:\n` : "";
    let parent = last.get(selectedParent(entry)) ?? "";
    const pages = snapshots?.ids.has(entry.id) ? await snapshots.render(entry) : null;
    if (pages?.length) {
      // Four pictures per post; further pages continue the thread.
      const text = `${author}${blueskyImageCaption(entry.content, entry.sourcePath)}`.trim();
      for (let part = 0; part * 4 < pages.length; part++) {
        const id = `${entry.sourcePath}#${entry.id}:${part}`;
        posts.push({ images: pages.slice(part * 4, part * 4 + 4), id, text: part === 0 ? splitBlueskyText(text)[0] ?? "" : "", createdAt: entry.createdAt, parent });
        parent = id;
      }
      last.set(entry.id, parent);
      continue;
    }
    const content = blueskyContent(entry.content, entry.sourcePath);
    if (content.images.length > 4) throw new Error("Bluesky allows at most four images per post");
    const images: BlueskyImage[] = [];
    for (const ref of content.images) images.push(await image(ref, entry));
    const text = `${author}${content.text}`.trim();
    if (!text && !images.length) throw new Error("Empty posts cannot be published");
    const chunks = splitBlueskyText(text);
    if (!chunks.length) chunks.push("");
    chunks.forEach((chunk, part) => {
      const id = `${entry.sourcePath}#${entry.id}:${part}`;
      posts.push({ ...(part === 0 && images.length ? { images } : {}), id, text: chunk, createdAt: entry.createdAt, parent });
      parent = id;
    });
    last.set(entry.id, parent);
  }
  if (posts.length > 100) throw new Error("Select at most 100 Bluesky posts");
  return posts;
}

/** Convert workspace image bytes to the pixels that are published. */
export async function prepareBlueskyImage(data: string, mime: string, alt: string): Promise<BlueskyImage> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mime)) throw new Error("Use PNG, JPEG, WebP or GIF images for Bluesky");
  const response = await fetch(`data:${mime};base64,${data}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Cannot prepare the image");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let encoded = "";
    for (const quality of [0.9, 0.75, 0.55, 0.35]) { encoded = canvas.toDataURL("image/jpeg", quality).split(",")[1]; if (encoded.length <= 1_333_332) return { data: encoded, mime: "image/jpeg", alt: alt.slice(0, 2000) }; }
    throw new Error("This image is too large for Bluesky");
  } finally { bitmap.close(); }
}
