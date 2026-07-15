import { assertEquals } from "jsr:@std/assert";
import { computeWorkflowLineDiff, workflowDiffFeedback } from "./diff.ts";

Deno.test("workflow confirmation diff identifies lines and formats AI feedback", () => {
  const lines = computeWorkflowLineDiff("one\ntwo\nthree", "one\nTWO\nthree\nfour");
  assertEquals(lines.map((line) => line.type), ["unchanged", "removed", "added", "unchanged", "added"]);
  const added = lines.findIndex((line) => line.content === "TWO");
  assertEquals(workflowDiffFeedback(lines, { [added]: "Keep the original capitalization" }, "Make it shorter"), 'Make it shorter\n\nLine-specific feedback:\n- new line 2 (added, "TWO"): Keep the original capitalization');
});
