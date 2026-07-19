import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { renderToStaticMarkup } from "react-dom/server";
import { BaseConfigEditor } from "./BaseConfigEditor.tsx";

Deno.test("Base settings use the GemiHub view editor layout", () => {
  const html = renderToStaticMarkup(
    <BaseConfigEditor
      content={`formulas:\n  excerpt: description.slice(0, 50)\nviews:\n  - type: table\n    name: Table\n    filters:\n      and:\n        - file.inFolder("cooking")\n        - image != null\n    order:\n      - file.name\n      - formula.excerpt\n    sort:\n      - property: file.mtime\n        direction: DESC\n    limit: 50\n`}
      viewName="Table"
      onChange={() => undefined}
    />,
  );

  for (const label of ["View type", "Columns", "Filter", "Sort", "Limit", "Raw base YAML"]) {
    assertStringIncludes(html, label);
  }
  assertStringIncludes(html, "file.name");
  assertStringIncludes(html, "formula.excerpt");
  assertStringIncludes(html, "In folder");
  assert(!html.includes("Custom summaries"));
});

Deno.test("Base date filters use a date picker and readable comparisons", () => {
  const html = renderToStaticMarkup(
    <BaseConfigEditor
      content={`views:\n  - type: table\n    name: Recent creations\n    filters: 'file.ctime >= date("2026-07-01")'\n`}
      viewName="Recent creations"
      onChange={() => undefined}
    />,
  );

  assertStringIncludes(html, "is on or after");
  assertStringIncludes(html, 'type="date"');
  assertStringIncludes(html, 'value="2026-07-01"');
});

Deno.test("Base date equality compares the calendar day instead of the timestamp", () => {
  let changed = "";
  const html = renderToStaticMarkup(
    <BaseConfigEditor
      content={`views:\n  - type: table\n    name: Same day\n    filters: 'file.ctime.date() == date("2026-07-19")'\n`}
      viewName="Same day"
      onChange={(content) => { changed = content; }}
    />,
  );

  assertStringIncludes(html, 'type="date"');
  assertStringIncludes(html, 'value="2026-07-19"');
  assertEquals(changed, "");
});
