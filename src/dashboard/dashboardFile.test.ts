import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { deriveSmallLayout, parseDashboard, safeDashboardPath, serializeDashboard } from "./dashboardFile.ts";

Deno.test("GemiHub dashboard YAML preserves unknown keys and widget configs", () => {
  const source = `version: 1\npluginTop: keep\ngrid: { cols: 12, rowHeight: 80, gap: 8 }\nwidgets:\n  - id: one\n    type: plugin-chart\n    pluginWidgetKey: keep-too\n    layout:\n      lg: { x: 1, y: 2, w: 5, h: 4 }\n      sm: { x: 0, y: 0, w: 12, h: 3 }\n    config:\n      query: test\n      future: 42\n`;
  const parsed = parseDashboard(source)!;
  assertEquals(parsed.pluginTop, "keep");
  assertEquals(parsed.widgets[0].layout, { x: 1, y: 2, w: 5, h: 4 });
  assertEquals(parsed.widgets[0].layoutBreakpoints?.sm, { x: 0, y: 0, w: 12, h: 3 });
  parsed.widgets[0].layout.x = 3;
  const serialized = serializeDashboard(parsed);
  assertStringIncludes(serialized, "pluginTop: keep");
  assertStringIncludes(serialized, "pluginWidgetKey: keep-too");
  assertEquals(parseDashboard(serialized)?.widgets[0].config.future, 42);
  assertEquals(parseDashboard(serialized)?.widgets[0].layout.x, 3);
});

Deno.test("dashboard parser accepts legacy flat layouts and derives mobile stacking", () => {
  const parsed = parseDashboard(`grid: { cols: 10, rowHeight: 72, gap: 5 }\nwidgets:\n  - { id: a, type: file, layout: { x: 0, y: 0, w: 5, h: 2 }, config: {} }\n  - { id: b, type: web, layout: { x: 5, y: 0, w: 5, h: 3 }, config: {} }`)!;
  const responsive = deriveSmallLayout(parsed);
  assertEquals(responsive.grid, { cols: 10, rowHeight: 72, gap: 5 });
  assertEquals(responsive.widgets[0].layoutBreakpoints?.sm, { x: 0, y: 0, w: 10, h: 2 });
  assertEquals(responsive.widgets[1].layoutBreakpoints?.sm, { x: 0, y: 2, w: 10, h: 3 });
  assertEquals(safeDashboardPath("home"), "Dashboards/home.dashboard");
  assertEquals(safeDashboardPath("../home"), null);
});
