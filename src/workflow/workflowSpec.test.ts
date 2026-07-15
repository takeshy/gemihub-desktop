import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { documentedWorkflowNodeTypes, getWorkflowNodeSpec, getWorkflowSpecTool } from "./workflowSpec.ts";
import { workflowNodeTypes } from "./types.ts";

Deno.test("workflow spec tool returns requested node documentation and configured context", () => {
  assertEquals(getWorkflowSpecTool.name, "get_workflow_spec");
  const result = getWorkflowNodeSpec('["command", "http"]', { models: ["gemini-3.5-flash"], ragSettings: ["docs"], mcpServers: ["browser"] });
  assertStringIncludes(result, "- command:");
  assertStringIncludes(result, "- http:");
  assertStringIncludes(result, "gemini-3.5-flash");
  assertEquals(result.includes("- note:"), false);
});

Deno.test("workflow spec documents every executable node type", () => {
  assertEquals(documentedWorkflowNodeTypes(), [...workflowNodeTypes]);
  for (const type of workflowNodeTypes) assertEquals(getWorkflowNodeSpec([type]).includes("unknown node type"), false, type);
});
