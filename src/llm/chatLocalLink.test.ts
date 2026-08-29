import { assertEquals } from "jsr:@std/assert";
import { chatExternalUrl, chatLocalFileRef } from "./chatLocalLink.ts";

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
  assertEquals(chatLocalFileRef("example.com", "/vault"), null);
});

Deno.test("bare host links get an https target instead of a dead button", () => {
  assertEquals(
    chatExternalUrl("www.example.com/a"),
    "https://www.example.com/a",
  );
  assertEquals(
    chatExternalUrl("example.com/a?q=1"),
    "https://example.com/a?q=1",
  );
  assertEquals(chatExternalUrl("https://example.com/a"), null);
  assertEquals(chatExternalUrl("Notes/a.md"), null);
  assertEquals(chatExternalUrl("main.go"), null);
});

Deno.test("chat links keep dotted folder names and encoded hashes", () => {
  assertEquals(chatLocalFileRef("notes.backup/a.md", "/vault"), {
    scope: "workspace",
    path: "notes.backup/a.md",
  });
  assertEquals(chatLocalFileRef("Notes/a%23b.md", "/vault"), {
    scope: "workspace",
    path: "Notes/a#b.md",
  });
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
  assertEquals(chatLocalFileRef("script.py", "/vault"), {
    scope: "workspace",
    path: "script.py",
  });
});

// Ported from the chatLinks module this one replaced.
Deno.test("chat links convert a Windows Workspace path to a Workspace path", () => {
  assertEquals(
    chatLocalFileRef(
      "C:\\Users\\takes\\takeshy\\人材マッチング.canvas",
      "C:\\Users\\takes\\takeshy",
    ),
    { scope: "workspace", path: "人材マッチング.canvas" },
  );
  assertEquals(
    chatLocalFileRef("資料/overview.canvas", "C:\\Vault"),
    { scope: "workspace", path: "資料/overview.canvas" },
  );
  assertEquals(
    chatLocalFileRef("C:\\Temp\\outside.pdf", "C:\\Vault"),
    { scope: "absolute", path: "C:/Temp/outside.pdf" },
  );
  assertEquals(chatLocalFileRef("https://example.com", "C:\\Vault"), null);
});
