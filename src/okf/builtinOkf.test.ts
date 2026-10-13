import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { assert, assertEquals, assertStringIncludes } from "../testing/assert";
import { decodeBuiltinOkfDocuments } from "./builtinOkf.ts";

test("generated built-in OKF gzip asset contains all product help", async () => {
  const compressed = await readFile(
    new URL("../generated/builtin-okf.json.gz", import.meta.url),
  );
  const documents = decodeBuiltinOkfDocuments(compressed);
  assertEquals(documents.length, 25);
  assert(documents.some((document) => document.path === "features/kakeratta.md"));
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
