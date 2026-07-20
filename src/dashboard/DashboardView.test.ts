import { assertEquals } from "jsr:@std/assert";
import { sameFileReference } from "./fileReference.ts";

Deno.test("memo source matching recognizes open file widget paths", () => {
  assertEquals(
    sameFileReference("workspace://Notes/example.md", "Notes/example.md"),
    true,
  );
  assertEquals(
    sameFileReference("files://C:\\Notes\\example.md", "c:/notes/example.md"),
    true,
  );
  assertEquals(
    sameFileReference(
      "workspace://Notes/example.md",
      "files://Notes/example.md",
    ),
    false,
  );
});
