import { assertEquals } from "jsr:@std/assert";
import { extractWorkflowText, workflowCachePath } from "./workflowRunner.ts";

Deno.test("workflow widget output prefers configured variable then result", () => {
  const variables = { result: "default", report: "configured", _date: "2026-01-01" };
  assertEquals(extractWorkflowText(variables, "report"), "configured");
  assertEquals(extractWorkflowText(variables), "default");
});

Deno.test("workflow widget output ignores system variables", () => {
  assertEquals(extractWorkflowText({ _date: "2026-01-01", answer: 42 }), "42");
  assertEquals(extractWorkflowText({ _date: "2026-01-01" }), null);
});

Deno.test("workflow widget cache is a synced dashboard sidecar", () => {
  assertEquals(workflowCachePath("Dashboards/home.dashboard"), "Dashboards/Data/Dashboards_2Fhome.dashboard.json");
});
