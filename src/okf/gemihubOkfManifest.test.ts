import { assertEquals, assertThrows } from "jsr:@std/assert";
import { compareOkfVersions, isGemihubOkfBundleName, parseGemihubOkfManifest } from "./gemihubOkfManifest.ts";

const hash = "a".repeat(64);

Deno.test("GemiHub OKF manifest validates identity, hashes, and confined Markdown paths", () => {
  const parsed = parseGemihubOkfManifest({
    name: "GemiHub",
    version: "1.2.3",
    publishedAt: "2026-07-14T00:00:00Z",
    bundleUrl: "releases/1.2.3/gemihub-okf.zip",
    sha256: hash,
    files: { "index.md": hash, "features/chat.md": hash },
  });
  assertEquals(parsed.version, "1.2.3");
  assertThrows(() => parseGemihubOkfManifest({ ...parsed, files: { "../escape.md": hash } }), Error, "Invalid GemiHub OKF file path");
  assertThrows(() => parseGemihubOkfManifest({ ...parsed, files: { "script.js": hash } }), Error, "Invalid GemiHub OKF file path");
});

Deno.test("GemiHub OKF version and legacy bundle-name matching follow upstream behavior", () => {
  assertEquals(compareOkfVersions("1.2.0", "1.1.9") > 0, true);
  assertEquals(compareOkfVersions("1.2.0-beta.1", "1.2.0") < 0, true);
  assertEquals(isGemihubOkfBundleName("legacy-gemihub-okf"), true);
});
