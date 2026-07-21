import { assertEquals } from "jsr:@std/assert";
import { buildUnifiedLineDiff } from "./UnifiedDiff.tsx";

Deno.test("workflow unified diff reports added and removed YAML lines", () => {
  const lines = buildUnifiedLineDiff(
    "name: Old\nnodes:\n  - id: first",
    "name: New\nnodes:\n  - id: first\n  - id: second",
  );
  assertEquals(lines.map((line) => line.type), [
    "removed",
    "added",
    "unchanged",
    "unchanged",
    "added",
  ]);
  assertEquals(lines.at(-1), {
    type: "added",
    content: "  - id: second",
    oldLineNum: null,
    newLineNum: 4,
  });
});
