import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildNoDiscoverySystemPrompt } from "./chatNoDiscoveryPrompt.ts";

Deno.test("no-discovery mode points at rag_search instead of giving up", () => {
  const withContext = buildNoDiscoverySystemPrompt({
    ragRequested: true,
    hasRagContext: true,
    ragSearchAvailable: true,
  });
  assertStringIncludes(withContext, "primary Workspace source");
  assertStringIncludes(withContext, "rag_search");

  const emptyRetrieval = buildNoDiscoverySystemPrompt({
    ragRequested: true,
    hasRagContext: false,
    ragSearchAvailable: true,
  });
  assertStringIncludes(
    emptyRetrieval,
    "returned no relevant Workspace context",
  );
  assertStringIncludes(
    emptyRetrieval,
    "Call rag_search with a rephrased, self-contained query",
  );
});

Deno.test("no-discovery mode never advertises a tool the turn lacks", () => {
  const noRag = buildNoDiscoverySystemPrompt({
    ragRequested: false,
    hasRagContext: false,
    ragSearchAvailable: false,
  });
  assertEquals(noRag.includes("rag_search"), false);
  assertStringIncludes(noRag, "RAG is not active for this turn");
  assertStringIncludes(noRag, "switch to Workspace: all");

  const ragWithoutTool = buildNoDiscoverySystemPrompt({
    ragRequested: true,
    hasRagContext: false,
    ragSearchAvailable: false,
  });
  assertEquals(ragWithoutTool.includes("rag_search"), false);
});
