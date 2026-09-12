import { assertEquals } from "jsr:@std/assert";
import { speechEditorCommand } from "./speechEditor.ts";

Deno.test("speech editor leaves standard navigation and selection keys alone", () => {
  for (const key of ["a", "b", "e", "f", "o"]) {
    assertEquals(speechEditorCommand("one\ntwo", 5, 5, key), null);
  }
});

Deno.test("speech editor commands delete selections and line edges", () => {
  assertEquals(speechEditorCommand("abc\ndef", 1, 1, "k"), {
    text: "a\ndef",
    start: 1,
    end: 1,
  });
  assertEquals(
    speechEditorCommand("abc\ndef", 1, 1, "k") &&
      speechEditorCommand("a\ndef", 1, 1, "k")?.text,
    "adef",
  );
  assertEquals(speechEditorCommand("abc\ndef", 5, 7, "u"), {
    text: "abc\nd",
    start: 5,
    end: 5,
  });
});
