import { assertEquals } from "jsr:@std/assert";
import { sameFileReference } from "./fileReference.ts";

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
