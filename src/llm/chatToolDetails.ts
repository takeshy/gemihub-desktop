import type { ChatMessage } from "../lib/wailsBackend";
import { RAG_SEARCH_TOOL_NAME } from "./chatRagTool";

export function withToolDetail(
  details: ChatMessage["toolDetails"],
  tool: string,
  detail?: string,
): ChatMessage["toolDetails"] {
  const value = detail?.trim();
  if (!value) return details;
  const previous = details?.[tool] ?? [];
  if (previous.includes(value)) return details;
  return { ...details, [tool]: [...previous, value] };
}

export function toolChipTitle(tool: string, details?: string[]): string {
  return details?.length ? `${tool}\n${details.join("\n")}` : tool;
}

/** Which queries produced this turn's RAG context: the automatic one, then any rag_search. */
export function ragQueryTitle(message: ChatMessage): string | undefined {
  const lines = [
    ...(message.ragQuery ? [`Automatic search: ${message.ragQuery}`] : []),
    ...(message.toolDetails?.[RAG_SEARCH_TOOL_NAME] ?? []).map((query) =>
      `${RAG_SEARCH_TOOL_NAME}: ${query}`
    ),
  ];
  return lines.length ? lines.join("\n") : undefined;
}
