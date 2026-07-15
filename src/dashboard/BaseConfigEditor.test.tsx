import { assert, assertStringIncludes } from "jsr:@std/assert";
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

