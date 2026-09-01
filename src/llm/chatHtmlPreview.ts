const HTML_FENCE = /^\s*```html\s*\n([\s\S]*?)\n```\s*$/i;

/** Return a complete HTML document only when the whole assistant reply is HTML. */
export function extractChatHtmlDocument(content: string): string | null {
  const fenced = content.match(HTML_FENCE)?.[1]?.trim();
  const candidate = fenced || content.trim();
  if (!candidate) return null;
  if (/^<!doctype\s+html\b/i.test(candidate) || /^<html\b/i.test(candidate)) {
    return candidate;
  }
  return null;
}
