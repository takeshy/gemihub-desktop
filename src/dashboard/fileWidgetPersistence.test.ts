import { assertEquals } from "jsr:@std/assert";
import { shouldPersistFileWidgetText } from "./fileWidgetPersistence.ts";

Deno.test("file widgets never text-save binary previews", () => {
  const pdf = "data:application/pdf;base64,JVBERi0xLjQ=";
  assertEquals(shouldPersistFileWidgetText("document.pdf", "", pdf), false);
  assertEquals(
    shouldPersistFileWidgetText("book.epub", "", "<html>preview</html>"),
    false,
  );
  assertEquals(shouldPersistFileWidgetText("image.png", "", pdf), false);
});

Deno.test("file widgets save only changed text content", () => {
  assertEquals(shouldPersistFileWidgetText("note.md", "before", "after"), true);
  assertEquals(shouldPersistFileWidgetText("note.md", "same", "same"), false);
  assertEquals(
    shouldPersistFileWidgetText("note.md", "before", undefined),
    false,
  );
});
