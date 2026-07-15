import { assertEquals } from "jsr:@std/assert";
import { formatActiveSelection } from "./selection.ts";

Deno.test("formats a source selection with its local path and offsets", () => {
  assertEquals(
    formatActiveSelection({ path: "Notes/example.md", text: "selected", start: 10, end: 18 }),
    "[file: Notes/example.md, start: 10, end: 18]\nselected",
  );
});

Deno.test("omits offsets when the DOM selection cannot map to source", () => {
  assertEquals(
    formatActiveSelection({ path: "Books/example.epub", text: "selected", start: -1, end: -1 }),
    "[file: Books/example.epub]\nselected",
  );
});
