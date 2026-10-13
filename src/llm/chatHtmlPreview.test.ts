import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { extractChatHtmlDocument } from "./chatHtmlPreview.ts";

test("complete fenced HTML replies become chat previews", () => {
  assertEquals(
    extractChatHtmlDocument(
      "```html\n<!doctype html><html><body>Hi</body></html>\n```",
    ),
    "<!doctype html><html><body>Hi</body></html>",
  );
});

test("ordinary HTML examples remain Markdown code", () => {
  assertEquals(extractChatHtmlDocument("Use `<strong>` for emphasis."), null);
  assertEquals(
    extractChatHtmlDocument("```html\n<div>fragment</div>\n```"),
    null,
  );
});
