import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { proposedPendingFileContent } from "./pendingFileAction.ts";

test("pending file replacement previews the complete proposed file", () => {
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

test("pending append and prepend previews match backend newline handling", () => {
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
