import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  buildWorkflowGenerationSpec,
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

Deno.test("workflow generation spec includes runtime names and correctness examples", () => {
  const spec = buildWorkflowGenerationSpec({
    models: ["configured-model"],
    ragSettings: ["docs"],
    mcpServers: ["Browser"],
  });
  assertStringIncludes(spec, "source: responseBody");
  assertStringIncludes(spec, 'const text = "{{value:json}}"');
  assertStringIncludes(spec, "throwOnError: false");
  assertStringIncludes(spec, "Build the smallest connected workflow");
  assertStringIncludes(spec, "ragSetting: __websearch__");
  assertStringIncludes(spec, "http: reserved for APIs, webhooks");
  assertStringIncludes(spec, "Keep the YAML as concise and simple as possible");
  assertStringIncludes(spec, "configured-model");
  assertStringIncludes(spec, "Configured RAG settings: docs");
  assertStringIncludes(spec, "Enabled MCP servers");
});
