// Memo timeline file format (specs/memo.md §5): frontmatter with `source:`,
// entries separated by `---` lines surrounded by blank lines, appended oldest
// to newest. Modeled after gemihub's TimelineWidget post format, extended with
// generic `key: value` metadata (anchor, quote-prefix, quote-suffix).

export interface MemoEntry {
  id: string;
  createdAt: string;
  pinned: boolean;
  anchor: string | null;
  quotePrefix: string;
  quoteSuffix: string;
  quote: string;
  body: string;
  raw: string;
  index: number;
  parsed: boolean;
}

export interface MemoFileData {
  source: string;
  entries: MemoEntry[];
}

const ISO_DATE_LINE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const META_LINE_RE = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/;
// §5.1: only a `---` line surrounded by blank lines splits entries, which
// keeps horizontal rules / code fences inside bodies intact.
const ENTRY_SEPARATOR_RE = /\n[ \t]*\n---[ \t]*\n[ \t]*\n/;

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

// §5.1: frontmatter must be stripped before splitting, otherwise its `---`
// fences are mistaken for entry separators and `source:` shows up as an entry.
function splitFrontmatter(content: string): { source: string; rest: string } {
  const normalized = normalizeNewlines(content);
  if (!normalized.startsWith("---\n")) return { source: "", rest: normalized };
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { source: "", rest: normalized };
  const closeLineEnd = normalized.indexOf("\n", end + 1);
  const frontmatter = normalized.slice(4, end);
  const rest = closeLineEnd === -1 ? "" : normalized.slice(closeLineEnd + 1);
  const sourceMatch = frontmatter.match(/^source:[ \t]*(.*)$/m);
  return { source: sourceMatch?.[1]?.trim() ?? "", rest };
}

function splitQuoteAndBody(content: string, hasAnchor: boolean): { quote: string; body: string } {
  // §5.2: the leading blockquote is the anchor quote only when an anchor is
  // present; otherwise it is plain body content.
  if (!hasAnchor) return { quote: "", body: content.trim() };
  const lines = content.split("\n");
  let start = 0;
  while (start < lines.length && !lines[start].trim()) start++;
  const quoteLines: string[] = [];
  let cursor = start;
  while (cursor < lines.length && /^>[ \t]?/.test(lines[cursor])) {
    quoteLines.push(lines[cursor].replace(/^>[ \t]?/, ""));
    cursor++;
  }
  if (!quoteLines.length) return { quote: "", body: content.trim() };
  return {
    quote: quoteLines.join("\n").trim(),
    body: lines.slice(cursor).join("\n").trim(),
  };
}

export function parseEntryBlock(raw: string, index: number): MemoEntry {
  const trimmed = raw.trim();
  const fallback: MemoEntry = {
    id: `block-${index}`,
    createdAt: "",
    pinned: false,
    anchor: null,
    quotePrefix: "",
    quoteSuffix: "",
    quote: "",
    body: trimmed,
    raw: trimmed,
    index,
    parsed: false,
  };
  const lines = trimmed.split("\n");
  if (!ISO_DATE_LINE_RE.test(lines[0]?.trim() ?? "")) return fallback;

  const meta = new Map<string, string>();
  let cursor = 1;
  while (cursor < lines.length && lines[cursor].trim()) {
    const match = lines[cursor].match(META_LINE_RE);
    if (!match) break;
    meta.set(match[1].toLowerCase(), match[2].trim());
    cursor++;
  }
  const id = meta.get("id");
  if (!id) return fallback;

  const anchor = meta.get("anchor") ?? null;
  const { quote, body } = splitQuoteAndBody(lines.slice(cursor).join("\n"), anchor !== null);
  return {
    id,
    createdAt: lines[0].trim(),
    pinned: meta.get("pinned")?.toLowerCase() === "true",
    anchor,
    quotePrefix: meta.get("quote-prefix") ?? "",
    quoteSuffix: meta.get("quote-suffix") ?? "",
    quote,
    body,
    raw: trimmed,
    index,
    parsed: true,
  };
}

export function parseMemoFile(content: string): MemoFileData {
  const { source, rest } = splitFrontmatter(content);
  const entries = rest
    .split(ENTRY_SEPARATOR_RE)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => parseEntryBlock(block, index));
  return { source, entries };
}

export interface MemoFileSummary {
  count: number;
  lastText: string;
}

// Memo list preview: entry count plus the newest entry's leading text.
// Entries are appended oldest to newest (§8.1), so the last block is newest —
// e.g. a final "読了" memo shows up as-is in the list.
export function summarizeMemoContent(content: string, maxChars = 10): MemoFileSummary {
  const { entries } = parseMemoFile(content);
  const last = entries[entries.length - 1];
  const collapsed = (last ? last.body || last.quote : "").replace(/\s+/g, " ").trim();
  const chars = Array.from(collapsed);
  const lastText = chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}…` : collapsed;
  return { count: entries.length, lastText };
}

export interface MemoEntryFields {
  createdAt: string;
  id: string;
  pinned?: boolean;
  anchor?: string | null;
  quotePrefix?: string;
  quoteSuffix?: string;
  quote?: string;
  body?: string;
}

// Single-line metadata values (§5.2): collapse whitespace runs, including
// newlines, into single spaces.
export function normalizeMetaValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildEntryBlock(fields: MemoEntryFields): string {
  const lines = [fields.createdAt, `id: ${fields.id}`];
  if (fields.pinned) lines.push("pinned: true");
  if (fields.anchor) lines.push(`anchor: ${fields.anchor}`);
  if (fields.quotePrefix) lines.push(`quote-prefix: ${normalizeMetaValue(fields.quotePrefix)}`);
  if (fields.quoteSuffix) lines.push(`quote-suffix: ${normalizeMetaValue(fields.quoteSuffix)}`);

  const sections = [lines.join("\n")];
  if (fields.quote?.trim()) {
    sections.push(fields.quote.trim().split("\n").map((line) => `> ${line}`).join("\n"));
  }
  if (fields.body?.trim()) sections.push(fields.body.trim());
  return sections.join("\n\n");
}

function entryToBlock(entry: MemoEntry): string {
  if (!entry.parsed) return entry.raw;
  return buildEntryBlock({
    createdAt: entry.createdAt,
    id: entry.id,
    pinned: entry.pinned,
    anchor: entry.anchor,
    quotePrefix: entry.quotePrefix,
    quoteSuffix: entry.quoteSuffix,
    quote: entry.quote,
    body: entry.body,
  });
}

export function serializeMemoFile(source: string, blocks: string[]): string {
  const body = blocks.map((block) => block.trim()).filter(Boolean).join("\n\n---\n\n");
  return `---\nsource: ${source}\n---\n\n${body}${body ? "\n" : ""}`;
}

// §8.1: posting only ever appends; existing content is left untouched.
export function appendEntryBlock(content: string, source: string, block: string): string {
  const current = normalizeNewlines(content).trimEnd();
  if (!current) return serializeMemoFile(source, [block]);
  return `${current}\n\n---\n\n${block.trim()}\n`;
}

// §8.5: same scheme as gemihub's uniquePostId — suffix instead of bumping
// milliseconds, checked against every id already in the file.
export function entryIdFromDate(date: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    "-",
    pad(date.getMilliseconds(), 3),
  ].join("");
}

export function uniqueEntryId(content: string, date: Date): string {
  const base = entryIdFromDate(date);
  const ids = new Set(parseMemoFile(content).entries.map((entry) => entry.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

// Rewrites the file with one entry's body replaced. Returns null if the id
// was not found. Unparsed blocks pass through verbatim (壊さない・落とさない).
export function replaceEntryBody(content: string, entryId: string, nextBody: string): string | null {
  const { source, entries } = parseMemoFile(content);
  let changed = false;
  const blocks = entries.map((entry) => {
    if (entry.id !== entryId) return entryToBlock(entry);
    changed = true;
    if (!entry.parsed) return nextBody.trim();
    return entryToBlock({ ...entry, body: nextBody });
  });
  return changed ? serializeMemoFile(source, blocks) : null;
}

export function setEntryPinned(content: string, entryId: string, pinned: boolean): string | null {
  const { source, entries } = parseMemoFile(content);
  let changed = false;
  const blocks = entries.map((entry) => {
    if (entry.id !== entryId || !entry.parsed) return entryToBlock(entry);
    changed = true;
    return entryToBlock({ ...entry, pinned });
  });
  return changed ? serializeMemoFile(source, blocks) : null;
}

export function deleteEntry(content: string, entryId: string): string | null {
  const { source, entries } = parseMemoFile(content);
  const remaining = entries.filter((entry) => entry.id !== entryId);
  if (remaining.length === entries.length) return null;
  return serializeMemoFile(source, remaining.map(entryToBlock));
}
