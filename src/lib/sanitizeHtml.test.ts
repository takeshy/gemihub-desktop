import { test } from "vitest";
import { assertEquals, assertStringIncludes } from "../testing/assert";
import { safeExternalUrl, sanitizePreviewDocument } from "./sanitizeHtml.ts";

test("preview HTML removes executable content", () => {
  const result = sanitizePreviewDocument(
    `<script>alert(1)</script><img src=x onerror="steal()"><a href=" javascript:alert(1)">x</a><iframe srcdoc="bad"></iframe>`,
  );
  assertEquals(result.includes("<script"), false);
  assertEquals(result.includes("onerror"), false);
  assertEquals(result.includes("javascript:"), false);
  assertEquals(result.includes("<iframe"), false);
  assertStringIncludes(result, "<img src=x>");
});

test("canvas links accept only HTTP URLs", () => {
  assertEquals(safeExternalUrl("javascript:alert(1)"), null);
  assertEquals(safeExternalUrl("file:///etc/passwd"), null);
  assertEquals(
    safeExternalUrl("https://example.com/path"),
    "https://example.com/path",
  );
});
