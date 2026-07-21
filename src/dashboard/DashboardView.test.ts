import { assertEquals } from "jsr:@std/assert";
import { sameFileReference, shouldApplyFileResult } from "./fileReference.ts";

Deno.test("memo source matching recognizes open file widget paths", () => {
  assertEquals(
    sameFileReference("Notes/example.md", "Notes/example.md"),
    true,
  );
  assertEquals(
    sameFileReference("C:\\Notes\\example.md", "c:/notes/example.md"),
    true,
  );
  assertEquals(
    sameFileReference(
      "Notes/example.md",
      "Other/Notes/example.md",
    ),
    false,
  );
});

Deno.test("stale file restoration does not replace a newly opened file", () => {
  assertEquals(
    shouldApplyFileResult("C:\\Notes\\new.md", "C:\\Notes\\old.md"),
    false,
  );
  assertEquals(
    shouldApplyFileResult("C:\\Notes\\old.md", "c:/notes/old.md"),
    true,
  );
  assertEquals(shouldApplyFileResult("C:\\Notes\\new.md"), true);
});
