// Quote-string anchoring (specs/memo.md §6): finds a quote inside rendered
// DOM content with whitespace-normalized matching, and paints matches via the
// CSS Custom Highlight API so React re-renders are not disturbed.

export interface TextIndex {
  text: string;
  nodes: Text[];
  // Parallel arrays: for each character of `text`, which node and offset it
  // came from.
  nodeIndexes: number[];
  offsets: number[];
}

// §6: collapse whitespace runs (including newlines) into single spaces on
// both sides of the comparison — rendered DOM text never matches the raw
// document byte-for-byte.
export function normalizeAnchorText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function shouldSkip(node: Node): boolean {
  const element = node.parentElement;
  if (!element) return false;
  const tag = element.tagName;
  return tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA";
}

// Builds a normalized text index over a container: whitespace runs collapse
// to one space while each kept character remembers its source Text node.
export function buildTextIndex(root: Node): TextIndex {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const nodeIndexes: number[] = [];
  const offsets: number[] = [];
  let text = "";
  let pendingSpace = false;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (shouldSkip(node)) continue;
    const textNode = node as Text;
    const value = textNode.data;
    if (!value) continue;
    const nodeIndex = nodes.push(textNode) - 1;
    for (let i = 0; i < value.length; i++) {
      if (/\s/.test(value[i])) {
        pendingSpace = text.length > 0;
        continue;
      }
      if (pendingSpace) {
        text += " ";
        // Attribute the joining space to the upcoming character's node.
        nodeIndexes.push(nodeIndex);
        offsets.push(i);
        pendingSpace = false;
      }
      text += value[i];
      nodeIndexes.push(nodeIndex);
      offsets.push(i);
    }
  }
  return { text, nodes, nodeIndexes, offsets };
}

function rangeFromIndex(index: TextIndex, start: number, end: number): Range | null {
  if (start < 0 || end <= start || end > index.text.length) return null;
  const startNode = index.nodes[index.nodeIndexes[start]];
  const endNode = index.nodes[index.nodeIndexes[end - 1]];
  if (!startNode || !endNode) return null;
  const doc = startNode.ownerDocument;
  if (!doc) return null;
  const range = doc.createRange();
  range.setStart(startNode, index.offsets[start]);
  range.setEnd(endNode, index.offsets[end - 1] + 1);
  return range;
}

export interface QuoteMatch {
  range: Range;
  start: number;
  end: number;
}

// §6.3: find the quote; disambiguate multiple matches with prefix/suffix,
// otherwise take the first.
export function findQuoteMatch(
  index: TextIndex,
  quote: string,
  quotePrefix = "",
  quoteSuffix = "",
): QuoteMatch | null {
  const needle = normalizeAnchorText(quote);
  if (!needle) return null;

  const starts: number[] = [];
  for (let at = index.text.indexOf(needle); at !== -1; at = index.text.indexOf(needle, at + 1)) {
    starts.push(at);
  }
  if (!starts.length) return null;

  let candidates = starts;
  if (candidates.length > 1 && quotePrefix) {
    const prefix = normalizeAnchorText(quotePrefix);
    const narrowed = candidates.filter((at) => index.text.slice(Math.max(0, at - prefix.length - 1), at).includes(prefix));
    if (narrowed.length) candidates = narrowed;
  }
  if (candidates.length > 1 && quoteSuffix) {
    const suffix = normalizeAnchorText(quoteSuffix);
    const narrowed = candidates.filter((at) => index.text.slice(at + needle.length, at + needle.length + suffix.length + 1).includes(suffix));
    if (narrowed.length) candidates = narrowed;
  }

  const start = candidates[0];
  const range = rangeFromIndex(index, start, start + needle.length);
  return range ? { range, start, end: start + needle.length } : null;
}

export interface SelectionContext {
  prefix: string;
  suffix: string;
}

const CONTEXT_CHARS = 30;

// §7.2: ~30 normalized chars before/after a selection, for disambiguation.
export function selectionContextFor(index: TextIndex, selectedText: string, range: Range): SelectionContext {
  const needle = normalizeAnchorText(selectedText);
  if (!needle) return { prefix: "", suffix: "" };
  // Locate the selection inside the index by comparing range start positions.
  let best: number | null = null;
  for (let at = index.text.indexOf(needle); at !== -1; at = index.text.indexOf(needle, at + 1)) {
    const candidate = rangeFromIndex(index, at, at + needle.length);
    if (!candidate) continue;
    if (
      candidate.compareBoundaryPoints(Range.START_TO_START, range) <= 0 &&
      candidate.compareBoundaryPoints(Range.END_TO_END, range) >= 0
    ) {
      best = at;
      break;
    }
    if (best === null) best = at;
  }
  if (best === null) return { prefix: "", suffix: "" };
  return {
    prefix: index.text.slice(Math.max(0, best - CONTEXT_CHARS), best).trim(),
    suffix: index.text.slice(best + needle.length, best + needle.length + CONTEXT_CHARS).trim(),
  };
}

interface HighlightWindow extends Window {
  Highlight?: new (...ranges: Range[]) => unknown;
  CSS?: typeof CSS;
}

export function highlightApiAvailable(win: Window): boolean {
  const w = win as HighlightWindow;
  return typeof w.Highlight === "function" && !!w.CSS && "highlights" in w.CSS;
}

// Registers ranges under a named CSS custom highlight in the given window.
// (Registries are per-document, so iframe content needs its own window.)
export function setHighlight(win: Window, name: string, ranges: Range[]): void {
  const w = win as HighlightWindow;
  if (!highlightApiAvailable(win)) return;
  const registry = (w.CSS as unknown as { highlights: Map<string, unknown> }).highlights;
  if (!ranges.length) {
    registry.delete(name);
    return;
  }
  registry.set(name, new w.Highlight!(...ranges));
}

export function clearHighlight(win: Window, name: string): void {
  setHighlight(win, name, []);
}

// The custom-highlight registry is per document, so widgets showing different
// files in the same window must not overwrite each other. Each widget
// contributes its ranges here and the union is registered per window.
const memoContributions = new Map<string, Map<Window, Range[]>>();

function recomputeMemoHighlight(win: Window): void {
  const union: Range[] = [];
  memoContributions.forEach((byWindow) => {
    const ranges = byWindow.get(win);
    if (ranges) union.push(...ranges);
  });
  setHighlight(win, "mdwys-memo", union);
}

export function setMemoHighlights(contributorId: string, win: Window, ranges: Range[]): void {
  let byWindow = memoContributions.get(contributorId);
  if (!byWindow) {
    byWindow = new Map();
    memoContributions.set(contributorId, byWindow);
  }
  byWindow.set(win, ranges);
  recomputeMemoHighlight(win);
}

export function clearMemoHighlights(contributorId: string): void {
  const byWindow = memoContributions.get(contributorId);
  if (!byWindow) return;
  memoContributions.delete(contributorId);
  byWindow.forEach((_ranges, win) => {
    try {
      recomputeMemoHighlight(win);
    } catch {
      // The window may already be gone (closed iframe).
    }
  });
}

// §7.3: Use a background-only highlight. PDF text layers sit on top of a
// rendered canvas, so changing the text color creates doubled glyphs.
export const MEMO_HIGHLIGHT_CSS = `
::highlight(mdwys-memo) {
  background-color: rgb(217 119 6 / 0.28);
}
:root.dark ::highlight(mdwys-memo) {
  background-color: rgb(251 191 36 / 0.28);
}
::highlight(mdwys-memo-flash) {
  background-color: rgb(217 119 6 / 0.58);
}
.textLayer::highlight(mdwys-memo),
.textLayer *::highlight(mdwys-memo) {
  background-color: rgb(217 119 6 / 0.32);
}
.textLayer::highlight(mdwys-memo-flash),
.textLayer *::highlight(mdwys-memo-flash) {
  background-color: rgb(217 119 6 / 0.65);
}
`;

export function ensureHighlightStyles(doc: Document): void {
  const id = "mdwys-memo-highlight-styles";
  if (doc.getElementById(id)) return;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = MEMO_HIGHLIGHT_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}
