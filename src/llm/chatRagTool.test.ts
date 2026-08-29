import {
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert";
import {
  formatRagSearchToolResult,
  mergeRagSources,
} from "./chatRagTool.ts";

Deno.test("dynamic RAG results include chunk text and remaining budget", () => {
  const value = formatRagSearchToolResult("focused", [{
    filePath: "Notes/a.md",
    text: "answer",
    score: 0.9,
    chunkIndex: 0,
  }], 1);
  assertStringIncludes(value, '"text":"answer"');
  assertStringIncludes(value, '"remainingSearches":1');
});

Deno.test("RAG source merging removes duplicate citations", () => {
  assertEquals(
    mergeRagSources([{ path: "a.md", score: 0.8 }], [{
      filePath: "a.md",
      text: "same file",
      score: 0.9,
      chunkIndex: 1,
    }, {
      filePath: "b.pdf",
      pageLabel: "Page 2",
      text: "new file",
      score: 0.7,
      chunkIndex: 0,
    }]),
    [{ path: "a.md", score: 0.8 }, {
      path: "b.pdf",
      pageLabel: "Page 2",
      score: 0.7,
    }],
  );
});
