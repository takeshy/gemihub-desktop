import { assertEquals } from "jsr:@std/assert";
import { resolveEpubHref, type SpineLinkTarget } from "./epub.ts";

const spineByPath = new Map<string, SpineLinkTarget>([
  ["OEBPS/chap1.xhtml", { index: 0, path: "OEBPS/chap1.xhtml" }],
  ["OEBPS/chap2.xhtml", { index: 1, path: "OEBPS/chap2.xhtml" }],
]);

const chapter = spineByPath.get("OEBPS/chap1.xhtml")!;

Deno.test("resolveEpubHref keeps same-chapter anchors inside the generated chapter id space", () => {
  assertEquals(resolveEpubHref("#note", chapter, spineByPath), "#epub-c1-note");
});

Deno.test("resolveEpubHref maps cross-chapter anchors to generated document anchors", () => {
  assertEquals(resolveEpubHref("chap2.xhtml#target", chapter, spineByPath), "#epub-c2-target");
});

Deno.test("resolveEpubHref maps cross-chapter links without fragments to chapter top", () => {
  assertEquals(resolveEpubHref("chap2.xhtml", chapter, spineByPath), "#epub-chapter-2");
});

Deno.test("resolveEpubHref disables unresolved relative links instead of sending the reader to top", () => {
  assertEquals(resolveEpubHref("missing.xhtml", chapter, spineByPath), null);
});
