import type { ChatToolDefinition, RAGSearchResult } from "../lib/wailsBackend";

export const RAG_SEARCH_TOOL_NAME = "rag_search";
export const MAX_RAG_SEARCHES_PER_TURN = 3;
export const MAX_DYNAMIC_RAG_RESULTS = 3;

export const ragSearchTool: ChatToolDefinition = {
  name: RAG_SEARCH_TOOL_NAME,
  description:
    "Search the selected RAG index with a focused semantic query. Use this when the automatically retrieved context is missing, too broad, or suggests a better follow-up query. Searches only the configured RAG index; it does not scan the Workspace directly.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Focused semantic search query. Rephrase or narrow the user's request instead of repeating it unchanged.",
      },
    },
    required: ["query"],
  },
};

/**
 * The automatic search reuses the user's message verbatim, which is a poor query
 * for follow-ups and pronoun-heavy requests, so the model is told to re-query
 * rather than answer from whatever the first retrieval happened to return.
 */
export function ragSearchSystemPrompt(hasAutomaticContext: boolean): string {
  const opening = hasAutomaticContext
    ? `The automatic search that produced the retrieved context used the user's message verbatim as the query. That is a weak query for a follow-up question, for a pronoun-heavy request, or when the answer needs a term the user did not write, so that context is a starting point rather than a complete retrieval. Whenever it looks off-topic, thin, or answers a broader question than the one asked, call ${RAG_SEARCH_TOOL_NAME} with a self-contained, rephrased query instead of answering from it.`
    : `No automatic RAG context was retrieved for this turn. Call ${RAG_SEARCH_TOOL_NAME} with a self-contained, focused query before answering from memory or telling the user that nothing was found.`;
  return `The selected RAG index is available through the ${RAG_SEARCH_TOOL_NAME} tool. ${opening} At most ${MAX_RAG_SEARCHES_PER_TURN} RAG searches are allowed per turn including the automatic search; each additional search returns at most ${MAX_DYNAMIC_RAG_RESULTS} chunks.`;
}

export function formatRagSearchToolResult(
  query: string,
  results: RAGSearchResult[],
  remainingSearches: number,
): string {
  return JSON.stringify({
    query,
    results: results.map((result) => ({
      filePath: result.filePath,
      ...(result.pageLabel ? { pageLabel: result.pageLabel } : {}),
      score: result.score,
      text: result.text,
    })),
    remainingSearches,
  });
}

export function mergeRagSources(
  existing: Array<{ path: string; pageLabel?: string; score?: number }>,
  results: RAGSearchResult[],
): Array<{ path: string; pageLabel?: string; score?: number }> {
  const merged = [...existing];
  const seen = new Set(
    merged.map((source) => `${source.path}|${source.pageLabel ?? ""}`),
  );
  for (const result of results) {
    const key = `${result.filePath}|${result.pageLabel ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      path: result.filePath,
      ...(result.pageLabel ? { pageLabel: result.pageLabel } : {}),
      score: result.score,
    });
  }
  return merged;
}
