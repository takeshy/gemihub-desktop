import { assertStringIncludes } from "jsr:@std/assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownPreview } from "./MarkdownPreview.tsx";

Deno.test("MarkdownPreview preserves Windows file links for local handling", () => {
  const html = renderToStaticMarkup(
    React.createElement(MarkdownPreview, {
      content: "[Canvas](C:\\Users\\takes\\Vault\\overview.canvas)",
      isDark: false,
      onLinkClick: () => undefined,
    }),
  );

  assertStringIncludes(html, 'class="markdown-link-button"');
  assertStringIncludes(html, ">Canvas</button>");
});

Deno.test("MarkdownPreview preserves the generated Japanese Canvas link", () => {
  const name = "人材マッチング業界におけるAI活用の最新動向（2026年）.canvas";
  const html = renderToStaticMarkup(
    React.createElement(MarkdownPreview, {
      content: `[${name}](C:\\Users\\takes\\takeshy\\${name})`,
      isDark: false,
      onLinkClick: () => undefined,
    }),
  );

  assertStringIncludes(html, 'class="markdown-link-button"');
  assertStringIncludes(html, `${name}</button>`);
});
