const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "poster",
  "xlink:href",
]);

function dangerousUrl(value: string): boolean {
  const normalized = value.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  return normalized.startsWith("javascript:") ||
    normalized.startsWith("vbscript:") ||
    normalized.startsWith("data:text/html");
}

/** Remove active content while preserving document markup for same-origin, scriptless previews. */
export function sanitizePreviewDocument(html: string): string {
  // Regex pre-pass also supports non-DOM test/build environments. The iframe
  // itself has no allow-scripts capability; DOM cleanup is defense in depth.
  html = html
    .replace(/<(script|iframe|object|embed|base)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|iframe|object|embed|base)\b[^>]*\/?\s*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "")
    .replace(
      /\s(?:on[a-z0-9_-]+|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      "",
    )
    .replace(
      /\s(href|src|action|formaction|poster|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|data\s*:\s*text\/html)[\s\S]*?\2/gi,
      "",
    );
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, base, meta[http-equiv]")
    .forEach((element) => element.remove());
  doc.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (URL_ATTRIBUTES.has(name) && dangerousUrl(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
