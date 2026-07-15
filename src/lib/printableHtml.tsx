import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

export const HTML_EXPORT_BASE_MARKER = "__LLM_HUB_SOURCE_BASE__";

function escapeHTML(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function printableMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[\[([^\]|]+\.(?:avif|bmp|gif|jpe?g|png|svg|webp))(?:\|[^\]]+)?\]\]/gi, "![$1]($1)")
    .replace(/(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label?: string) => `[${label || target}](${target})`);
}

export function renderMarkdownToPrintableHTML(markdown: string, title: string): string {
  const body = renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
      {printableMarkdown(markdown)}
    </ReactMarkdown>,
  );
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${HTML_EXPORT_BASE_MARKER}">
  <title>${escapeHTML(title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { max-width: 980px; margin: 0 auto; padding: 32px 42px 72px; color: #172033; background: #fff; font: 16px/1.72 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif; overflow-wrap: anywhere; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.35em 0 .55em; break-after: avoid-page; }
    h1 { padding-bottom: .25em; border-bottom: 1px solid #d9dee8; font-size: 2em; }
    h2 { padding-bottom: .2em; border-bottom: 1px solid #e5e7eb; font-size: 1.55em; }
    h3 { font-size: 1.28em; }
    p, ul, ol, blockquote, pre, table { margin: .8em 0; }
    a { color: #0969da; text-decoration: underline; text-underline-offset: 2px; }
    img, svg { max-width: 100%; height: auto; break-inside: avoid-page; }
    blockquote { margin-left: 0; padding: .15em 1em; border-left: 4px solid #9ca3af; color: #4b5563; }
    code { padding: .12em .32em; border-radius: 4px; background: #f0f3f7; font: .9em/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { overflow: auto; padding: 14px 16px; border: 1px solid #d9dee8; border-radius: 7px; background: #f6f8fa; white-space: pre-wrap; break-inside: avoid-page; }
    pre code { padding: 0; background: transparent; }
    table { width: 100%; border-collapse: collapse; break-inside: auto; }
    tr { break-inside: avoid-page; }
    th, td { padding: .45em .65em; border: 1px solid #cfd6df; text-align: left; vertical-align: top; }
    th { background: #f0f3f7; }
    hr { margin: 1.6em 0; border: 0; border-top: 1px solid #cfd6df; }
    input[type="checkbox"] { margin-right: .45em; }
    @media print {
      :root { color-scheme: light; }
      body { max-width: none; padding: 0; color: #111827; }
      a { color: inherit; text-decoration-color: #9ca3af; }
      pre { white-space: pre-wrap; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}
