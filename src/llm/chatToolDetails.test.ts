import { assertEquals } from "jsr:@std/assert";
import {
  ragQueryTitle,
  toolChipTitle,
  withToolDetail,
} from "./chatToolDetails.ts";

Deno.test("tool details accumulate per tool without duplicates", () => {
  let details = withToolDetail(undefined, "rag_search", "first query");
  details = withToolDetail(details, "rag_search", "second query");
  details = withToolDetail(details, "rag_search", "second query");
  details = withToolDetail(details, "read_file", "Notes/a.md");
  assertEquals(details, {
    rag_search: ["first query", "second query"],
    read_file: ["Notes/a.md"],
  });
  assertEquals(withToolDetail(details, "list_files", ""), details);
  assertEquals(withToolDetail(details, "list_files", undefined), details);
});

Deno.test("tool chips name the call in their tooltip", () => {
  assertEquals(toolChipTitle("list_files"), "list_files");
  assertEquals(
    toolChipTitle("search_files", ["needle", "other"]),
    "search_files\nneedle\nother",
  );
});

Deno.test("the RAG badge lists the automatic query and every rag_search", () => {
  assertEquals(
    ragQueryTitle({
      role: "assistant",
      content: "",
      ragQuery: "what did I decide?",
      toolDetails: { rag_search: ["retention policy decision"] },
    }),
    "Automatic search: what did I decide?\nrag_search: retention policy decision",
  );
  assertEquals(ragQueryTitle({ role: "assistant", content: "" }), undefined);
});
