import { assertStringIncludes } from "jsr:@std/assert";
import { workflowCodeBlockToMermaid } from "./codeBlock.ts";

Deno.test("hub-workflow code blocks render as workflow Mermaid", () => {
  const chart = workflowCodeBlockToMermaid("nodes:\n  - id: start\n    type: variable\n    name: topic\n    value: test\n    next: done\n  - id: done\n    type: set\n    name: result\n    value: '{{topic}}'");
  assertStringIncludes(chart, "flowchart TD");
  assertStringIncludes(chart, "n_start");
  assertStringIncludes(chart, "n_done");
});
