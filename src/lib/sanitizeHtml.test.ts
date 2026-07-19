import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { safeExternalUrl, sanitizePreviewDocument } from "./sanitizeHtml.ts";

Deno.test("preview HTML removes executable content", () => {
  const result = sanitizePreviewDocument(
    `<script>alert(1)</script><img src=x onerror="steal()"><a href=" javascript:alert(1)">x</a><iframe srcdoc="bad"></iframe>`,
  );
  assertEquals(result.includes("<script"), false);
  assertEquals(result.includes("onerror"), false);
  assertEquals(result.includes("javascript:"), false);
  assertEquals(result.includes("<iframe"), false);
  assertStringIncludes(result, "<img src=x>");
});

Deno.test("canvas links accept only HTTP URLs", () => {
  assertEquals(safeExternalUrl("javascript:alert(1)"), null);
  assertEquals(safeExternalUrl("file:///etc/passwd"), null);
  assertEquals(
    safeExternalUrl("https://example.com/path"),
    "https://example.com/path",
  );
});
