import { RAG_SEARCH_TOOL_NAME } from "./chatRagTool";

interface NoDiscoveryPromptOptions {
  ragRequested: boolean;
  hasRagContext: boolean;
  ragSearchAvailable: boolean;
}

/**
 * Instructions that keep no-discovery mode useful without turning reads into
 * path guessing. The retrieval branch matters: without it the model reads the
 * discovery ban as a ban on rag_search too and gives up instead of searching.
 */
export function buildNoDiscoverySystemPrompt({
  ragRequested,
  hasRagContext,
  ragSearchAvailable,
}: NoDiscoveryPromptOptions): string {
  const common = [
    "No-discovery mode is active for the Workspace.",
    "Workspace search and file listing are unavailable.",
    "Do not guess file paths, probe likely filenames, or use folder listings and other tools as a substitute for discovering files.",
    "Do not infer facts about the user's Workspace or product from the available tool names.",
    "Make factual claims only when supported by the conversation, attached or explicitly referenced content, active knowledge bundles, or retrieved Workspace context.",
  ].join(" ");

  const searchAgain = ragSearchAvailable
    ? ` The ${RAG_SEARCH_TOOL_NAME} tool is the supported way to find more: it queries the RAG index rather than the Workspace, so it is not path guessing and stays available in this mode.`
    : "";

  let sourceGuidance: string;
  if (hasRagContext) {
    sourceGuidance =
      `RAG retrieved relevant Workspace context for this turn. Use it as the primary Workspace source, and read a file only for an exact path explicitly supplied by the user or shown in a retrieved source citation.${searchAgain}`;
  } else if (ragRequested) {
    sourceGuidance =
      `RAG was requested, but it returned no relevant Workspace context. Do not fill the gap with assumptions or guessed file reads.${
        ragSearchAvailable
          ? ` Call ${RAG_SEARCH_TOOL_NAME} with a rephrased, self-contained query before concluding that the Workspace has nothing.`
          : ""
      } Read a file only for an exact path explicitly supplied by the user.`;
  } else {
    sourceGuidance =
      "RAG is not active for this turn. Treat attached content and explicitly referenced files as the available Workspace context, and read a file only for an exact path explicitly supplied by the user.";
  }

  const fallback =
    "If these sources are insufficient, say what information is missing and ask the user to reference or attach the relevant file, or to switch to Workspace: all. Do not present a speculative synthesis as established fact.";
  return `${common} ${sourceGuidance} ${fallback}`;
}
