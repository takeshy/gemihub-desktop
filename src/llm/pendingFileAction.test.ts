import { assertEquals } from "jsr:@std/assert";
import { proposedPendingFileContent } from "./pendingFileAction.ts";

Deno.test("pending file replacement previews the complete proposed file", () => {
  assertEquals(
    proposedPendingFileContent("before", {
      kind: "write",
      path: "workspace://note.md",
      content: "after",
      mode: "replace",
    }),
    "after",
  );
});

Deno.test("pending append and prepend previews match backend newline handling", () => {
  assertEquals(
    proposedPendingFileContent("first", {
      kind: "write",
      path: "workspace://note.md",
      content: "second",
      mode: "append",
    }),
    "first\nsecond",
  );
  assertEquals(
    proposedPendingFileContent("second", {
      kind: "write",
      path: "workspace://note.md",
      content: "first\n",
      mode: "prepend",
    }),
    "first\nsecond",
  );
});
