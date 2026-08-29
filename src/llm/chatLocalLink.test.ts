import { assertEquals } from "jsr:@std/assert";
import { chatLocalFileRef } from "./chatLocalLink.ts";

Deno.test("chat links resolve relative and workspace-absolute files", () => {
  assertEquals(chatLocalFileRef("Notes/a.md#part", "/vault"), {
    scope: "workspace",
    path: "Notes/a.md",
  });
  assertEquals(chatLocalFileRef("file:///vault/Notes/a%20b.md", "/vault"), {
    scope: "workspace",
    path: "Notes/a b.md",
  });
});

Deno.test("chat links leave web and bare host links alone", () => {
  assertEquals(chatLocalFileRef("https://example.com/a", "/vault"), null);
  assertEquals(chatLocalFileRef("www.example.com/a", "/vault"), null);
  assertEquals(chatLocalFileRef("example.com/a", "/vault"), null);
});

Deno.test("chat links accept top-level files with arbitrary extensions", () => {
  assertEquals(chatLocalFileRef("App.tsx", "/vault"), {
    scope: "workspace",
    path: "App.tsx",
  });
  assertEquals(chatLocalFileRef("main.go", "/vault"), {
    scope: "workspace",
    path: "main.go",
  });
  assertEquals(chatLocalFileRef("report.docx", "/vault"), {
    scope: "workspace",
    path: "report.docx",
  });
});
