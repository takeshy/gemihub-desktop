import type { MemoEntry } from "../lib/memoTimeline";

export function memoChatDraft(memoPath: string, sourcePath: string): string {
  return `Memo file:\n${memoPath}\n\nSource file:\n${sourcePath}`;
}

export function memoEntryChatDraft(
  sourcePath: string,
  entry: MemoEntry,
): string {
  const quotation = entry.quote
    ? [
      "Quote information:",
      entry.anchor ? `Anchor: ${entry.anchor}` : "",
      entry.quotePrefix ? `Before: ${entry.quotePrefix}` : "",
      `Quote:\n${entry.quote}`,
      entry.quoteSuffix ? `After: ${entry.quoteSuffix}` : "",
    ].filter(Boolean).join("\n")
    : "";
  return [
    `Source file:\n${sourcePath}`,
    quotation,
    `Memo content:\n${entry.body}`,
  ].filter(Boolean).join("\n\n");
}
