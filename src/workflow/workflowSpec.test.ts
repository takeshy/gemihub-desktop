import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  documentedWorkflowNodeTypes,
  getWorkflowNodeSpec,
  getWorkflowSpecTool,
} from "./workflowSpec.ts";
import { workflowNodeTypes } from "./types.ts";

Deno.test("workflow spec tool returns requested node documentation and configured context", () => {
  assertEquals(getWorkflowSpecTool.name, "get_workflow_spec");
  const result = getWorkflowNodeSpec('["command", "http"]', {
    models: ["gemini-3.5-flash"],
    ragSettings: ["docs"],
    mcpServers: ["browser"],
  });
  assertStringIncludes(result, "- command:");
  assertStringIncludes(result, "- http:");
  assertStringIncludes(result, "gemini-3.5-flash");
  assertEquals(result.includes("- note:"), false);
});

Deno.test("workflow spec documents every executable node type", () => {
  assertEquals(documentedWorkflowNodeTypes(), [...workflowNodeTypes]);
  for (const type of workflowNodeTypes) {
    assertEquals(
      getWorkflowNodeSpec([type]).includes("unknown node type"),
      false,
      type,
    );
  }
});

Deno.test("workflow generation distinguishes caller input from interactive input", () => {
  const spec = getWorkflowNodeSpec();
  assertStringIncludes(spec, "It does not show an input dialog");
  assertStringIncludes(
    spec,
    "acquire every required user value with prompt-value",
  );
});

Deno.test("workflow generation requires an image model for image output", () => {
  assertStringIncludes(
    getWorkflowNodeSpec(["command"]),
    "saveImageTo requires an explicitly selected image-generation model",
  );
});

Deno.test("workflow generation treats infographics as structured text by default", () => {
  const spec = getWorkflowNodeSpec();
  assertStringIncludes(
    spec,
    'Interpret "infographic" as a readable, visually structured Markdown or HTML document by default',
  );
  assertStringIncludes(
    spec,
    "Do not assume it means a bitmap image",
  );
});
