import { assertEquals } from "jsr:@std/assert";
import { shouldSyncWysiwygValue } from "./WysiwygEditor.tsx";

Deno.test("startup Markdown hydration updates an already focused empty editor", () => {
  assertEquals(shouldSyncWysiwygValue(true, "", "# Loaded"), true);
});

Deno.test("focused WYSIWYG content remains authoritative during stale rerenders", () => {
  assertEquals(shouldSyncWysiwygValue(true, "draft", "stale"), false);
  assertEquals(shouldSyncWysiwygValue(false, "draft", "external"), true);
});
