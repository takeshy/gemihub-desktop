import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { decodeBuiltinOkfDocuments } from "./builtinOkf.ts";

Deno.test("generated built-in OKF gzip asset contains all product help", async () => {
  const compressed = await Deno.readFile(
    new URL("../generated/builtin-okf.json.gz", import.meta.url),
  );
  const documents = decodeBuiltinOkfDocuments(compressed);
  assertEquals(documents.length, 24);
  const index = documents.find((document) => document.path === "index.md");
  assert(index);
  assertStringIncludes(index.body, "重要なファイルは履歴に加えて別媒体にもバックアップしてください");
  assertEquals(documents.some((document) => document.path === "index.md"), true);
  const chat = documents.find((document) =>
    document.path === "features/ai-chat.md"
  );
  assertEquals(chat?.type, "Product Feature");
  assertStringIncludes(chat?.description ?? "", "AI");
});
