import { assertEquals } from "jsr:@std/assert";
import { chatLinkFileRef } from "./chatLinks.ts";

Deno.test("chat links convert a Windows Vault path to a Workspace path", () => {
  assertEquals(
    chatLinkFileRef(
      "C:\\Users\\takes\\takeshy\\人材マッチング.canvas",
      "C:\\Users\\takes\\takeshy",
    ),
    { scope: "workspace", path: "人材マッチング.canvas" },
  );
});

Deno.test("chat links keep a relative Vault path Workspace-scoped", () => {
  assertEquals(
    chatLinkFileRef("資料/overview.canvas", "C:\\Vault"),
    { scope: "workspace", path: "資料/overview.canvas" },
  );
});

Deno.test("chat links keep paths outside the Vault absolute", () => {
  assertEquals(
    chatLinkFileRef("C:\\Temp\\outside.pdf", "C:\\Vault"),
    { scope: "absolute", path: "C:/Temp/outside.pdf" },
  );
});

Deno.test("chat links ignore web URLs", () => {
  assertEquals(chatLinkFileRef("https://example.com", "C:\\Vault"), null);
});
