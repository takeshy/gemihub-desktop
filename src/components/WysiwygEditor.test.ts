import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { shouldSyncWysiwygValue } from "./WysiwygEditor.tsx";

test("startup Markdown hydration updates an already focused empty editor", () => {
  assertEquals(shouldSyncWysiwygValue(true, "", "# Loaded"), true);
});

test("focused WYSIWYG content remains authoritative during stale rerenders", () => {
  assertEquals(shouldSyncWysiwygValue(true, "draft", "stale"), false);
  assertEquals(shouldSyncWysiwygValue(false, "draft", "external"), true);
});
