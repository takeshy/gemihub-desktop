import { assertEquals, assertMatch } from "jsr:@std/assert";
import { decodeMemoPath, encodeMemoPath, memoFileNameFor, sha256Hex } from "./memoPath.ts";

Deno.test("encodes posix paths per spec example", () => {
  assertEquals(
    memoFileNameFor("/Users/takeshy/books/go_book.pdf"),
    "_sUsers_stakeshy_sbooks_sgo_ubook.pdf.md",
  );
});

Deno.test("encodes windows paths per spec example", () => {
  assertEquals(
    memoFileNameFor("C:\\Users\\takeshy\\doc.md"),
    "C_c_sUsers_stakeshy_sdoc.md.md",
  );
});

Deno.test("round-trips paths containing underscores, slashes, and colons", () => {
  const paths = [
    "/Users/takeshy/books/go_book.pdf",
    "/a_/b",
    "/a/_b",
    "/path/with_many___underscores/file_.md",
    "/日本語/フォルダ/メモ_テスト.md",
    "/opt/data:v2/file.txt",
  ];
  for (const path of paths) {
    assertEquals(decodeMemoPath(encodeMemoPath(path)), path);
  }
});

Deno.test("round-trips windows paths (separators normalize to /)", () => {
  const encoded = encodeMemoPath("C:\\Users\\takeshy\\doc.md");
  assertEquals(decodeMemoPath(encoded), "C:/Users/takeshy/doc.md");
});

Deno.test("does not encode backslash in posix paths", () => {
  const path = "/tmp/back\\slash_file";
  const encoded = encodeMemoPath(path);
  assertEquals(encoded, "_stmp_sback\\slash_ufile");
  assertEquals(decodeMemoPath(encoded), path);
});

Deno.test("prefix-free mapping keeps ambiguous inputs distinct", () => {
  assertEquals(encodeMemoPath("a_/b"), "a_u_sb");
  assertEquals(encodeMemoPath("a/_b"), "a_s_ub");
  assertEquals(decodeMemoPath("a_u_sb"), "a_/b");
  assertEquals(decodeMemoPath("a_s_ub"), "a/_b");
});

Deno.test("rejects invalid escape sequences", () => {
  assertEquals(decodeMemoPath("bad_name"), null);
  assertEquals(decodeMemoPath("trailing_"), null);
});

Deno.test("falls back to truncated name + hash for long paths", () => {
  const longPath = `/books/${"あ".repeat(120)}.pdf`;
  const name = memoFileNameFor(longPath);
  assertMatch(name, /\.[0-9a-f]{8}\.md$/);
  const stem = name.replace(/\.[0-9a-f]{8}\.md$/, "");
  const stemBytes = new TextEncoder().encode(stem).length;
  if (stemBytes > 180) throw new Error(`truncated stem is ${stemBytes} bytes`);
  assertEquals(name.endsWith(`.${sha256Hex(longPath).slice(0, 8)}.md`), true);
  // Deterministic: same path, same name.
  assertEquals(memoFileNameFor(longPath), name);
});

Deno.test("short names do not use the fallback", () => {
  assertEquals(memoFileNameFor("/a/b.md").includes(".md"), true);
  assertEquals(/\.[0-9a-f]{8}\.md$/.test(memoFileNameFor("/a/b.md")), false);
});

Deno.test("sha256 matches known vector", () => {
  assertEquals(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assertEquals(
    sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  // Multi-block input (> 64 bytes) exercises the chunk loop.
  // Reference: crypto.subtle.digest("SHA-256", "a".repeat(200)).
  assertEquals(
    sha256Hex("a".repeat(200)),
    "c2a908d98f5df987ade41b5fce213067efbcc21ef2240212a41e54b5e7c28ae5",
  );
});
