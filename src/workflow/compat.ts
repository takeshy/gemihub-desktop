export function workflowNameFromPath(name: string | undefined, path: string): string {
  if (name?.trim()) return name.trim();
  const basename = path.replaceAll("\\", "/").split("/").pop() || path;
  return basename.replace(/\.workflow\.ya?ml$/i, "").replace(/\.(?:md|ya?ml|workflow)$/i, "") || "workflow";
}

export function sanitizeWorkflowNotePath(path: string): string {
  return path.split("/").map((segment) => segment.replace(/[*"\\<>:|?]/g, "-")).join("/");
}

export function expandMultipartFields(raw: string, expand: (value: string) => string): Record<string, string> {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("form-data contentType requires body to be a valid JSON object"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("form-data contentType requires body to be a valid JSON object");
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [expand(key), expand(String(value))]));
}

function mergeUsage(total: ChatUsage | undefined, next: ChatUsage | undefined): ChatUsage | undefined {
  if (!next) return total;
  return {
    inputTokens: (total?.inputTokens || 0) + (next.inputTokens || 0), outputTokens: (total?.outputTokens || 0) + (next.outputTokens || 0),
    thinkingTokens: (total?.thinkingTokens || 0) + (next.thinkingTokens || 0), totalTokens: (total?.totalTokens || 0) + (next.totalTokens || 0),
    cachedTokens: (total?.cachedTokens || 0) + (next.cachedTokens || 0), toolUseTokens: (total?.toolUseTokens || 0) + (next.toolUseTokens || 0),
  };
}

export async function runWorkflowChatWithAutoApply(request: ChatRequest, call: (request: ChatRequest) => Promise<ChatResult>, apply: (action: PendingFileAction) => Promise<void>, limit = 7): Promise<ChatResult> {
  let result: ChatResult | undefined, usage: ChatUsage | undefined, thinking = "";
  const images: NonNullable<ChatResult["generatedImages"]> = [], tools = new Set<string>();
  for (let iteration = 0; iteration < limit; iteration++) {
    const next = await call(request);
    usage = mergeUsage(usage, next.usage);
    if (next.thinking) thinking += `${thinking ? "\n\n" : ""}${next.thinking}`;
    if (next.generatedImages?.length) images.push(...next.generatedImages);
    for (const tool of next.toolsUsed ?? []) tools.add(tool);
    if (next.cliSessionId) request.cliSessionId = next.cliSessionId;
    result = { ...next, usage, thinking, generatedImages: images, toolsUsed: [...tools] };
    if (!next.pendingAction) return result;
    await apply(next.pendingAction);
    if (next.content.trim()) request.messages.push({ role: "assistant", content: next.content });
    request.messages.push({ role: "user", content: `The proposed ${next.pendingAction.kind} operation for ${next.pendingAction.path} was applied successfully. Continue the original workflow task and provide the final result.` });
  }
  if (result?.pendingAction) throw new Error("Workflow command file action iteration limit exceeded.");
  throw new Error("Workflow command returned no result.");
}
import type { ChatRequest, ChatResult, ChatUsage, PendingFileAction } from "../lib/wailsBackend";
