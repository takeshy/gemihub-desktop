import { assertStringIncludes } from "jsr:@std/assert";
import { HTML_EXPORT_BASE_MARKER, renderMarkdownToPrintableHTML } from "./printableHtml.tsx";

Deno.test("printable HTML contains GFM, source base marker, and print styles", () => {
  const html = renderMarkdownToPrintableHTML("# 日本語\n\n|A|B|\n|-|-|\n|1|2|\n\n![remote](https://example.com/a.png)", "Report");
  assertStringIncludes(html, HTML_EXPORT_BASE_MARKER);
  assertStringIncludes(html, "<table>");
  assertStringIncludes(html, "https://example.com/a.png");
  assertStringIncludes(html, "@media print");
});

Deno.test("printable HTML converts image wiki embeds", () => {
  const html = renderMarkdownToPrintableHTML("![[images/chart.png]]", "Chart");
  assertStringIncludes(html, 'src="images/chart.png"');
});
