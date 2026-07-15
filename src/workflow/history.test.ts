import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { truncateWorkflowHistoryData } from "./history.ts";

Deno.test("workflow history truncates large text and binary recursively", () => {
  const text = "prefix " + "x".repeat(2000) + " suffix";
  const binary = "A".repeat(2000);
  const result = truncateWorkflowHistoryData({ text, nested: [binary] }) as { text: string; nested: string[] };
  assertStringIncludes(result.text, "[truncated");
  assertEquals(result.nested[0], "[Binary data: 2000 chars]");
});
