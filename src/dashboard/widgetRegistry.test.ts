import { assertEquals } from "jsr:@std/assert";
import { dashboardWidgetDefinition, dashboardWidgetFilePath, isDashboardWidgetConfigured, registerDashboardWidget } from "./widgetRegistry.ts";

Deno.test("dashboard plugin widgets register and resolve file-backed paths", () => {
  registerDashboardWidget({ type: "test:chart", label: "Chart", description: "test", defaultConfig: {}, defaultSize: { w: 4, h: 3 }, filePathKey: "source" });
  assertEquals(dashboardWidgetDefinition("test:chart")?.label, "Chart");
  assertEquals(dashboardWidgetFilePath({ id: "one", type: "test:chart", title: "Chart", layout: { x: 0, y: 0, w: 4, h: 3 }, config: { source: "data/report.md" } }), "data/report.md");
});

Deno.test("new selectable widgets are configured only after their primary selection", () => {
  const widget = (type: string, config: Record<string, unknown>) => ({ id: "one", type, title: "", layout: { x: 0, y: 0, w: 4, h: 3 }, config });
  assertEquals(isDashboardWidgetConfigured(widget("timeline", { name: "" })), false);
  assertEquals(isDashboardWidgetConfigured(widget("timeline", { name: "Journal" })), true);
  assertEquals(isDashboardWidgetConfigured(widget("workflow", { workflow: "" })), false);
  assertEquals(isDashboardWidgetConfigured(widget("web", { url: "https://example.com" })), true);
  assertEquals(isDashboardWidgetConfigured(widget("kanban", { kanban: "" })), false);
  assertEquals(isDashboardWidgetConfigured(widget("kanban", { kanban: "Dashboards/Kanbans/work.kanban" })), true);
  assertEquals(isDashboardWidgetConfigured(widget("kanban", { folder: "Work", title: "Tasks" })), true);
  assertEquals(isDashboardWidgetConfigured(widget("memo-list", {})), true);
});
