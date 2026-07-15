import { assertEquals } from "jsr:@std/assert";
import { groundingSourceLabel, groundingSources } from "./grounding.ts";

Deno.test("builds unique grounding sources by file and page", () => {
  const sources = groundingSources([
    { filePath: "Books/guide.pdf", text: "a", score: 0.9, chunkIndex: 0, pageLabel: "p.3" },
    { filePath: "Books/guide.pdf", text: "b", score: 0.8, chunkIndex: 1, pageLabel: "p.3" },
    { filePath: "Books/guide.pdf", text: "c", score: 0.7, chunkIndex: 2, pageLabel: "p.4" },
  ]);
  assertEquals(sources, [
    { path: "Books/guide.pdf", pageLabel: "p.3", score: 0.9 },
    { path: "Books/guide.pdf", pageLabel: "p.4", score: 0.7 },
  ]);
  assertEquals(groundingSourceLabel(sources[0]), "guide.pdf · p.3");
});
