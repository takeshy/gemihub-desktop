import type { McpAppInfo } from "../lib/wailsBackend";
import type { MCPServerConfig } from "../llm/settings";

export interface McpAppResourceClient {
  readResource: (uri: string) => Promise<{ uri?: string; mimeType?: string; text?: string; blob?: string } | null>;
}

export async function mcpAppInfoFromResult(client: McpAppResourceClient, result: Record<string, unknown>, title: string, server: MCPServerConfig): Promise<McpAppInfo | undefined> {
  const content = Array.isArray(result.content) ? result.content as Array<{ resource?: { text?: string; blob?: string } }> : [];
  const meta = result._meta && typeof result._meta === "object" ? result._meta as Record<string, unknown> : {};
  const ui = meta.ui && typeof meta.ui === "object" ? meta.ui as Record<string, unknown> : {};
  const uri = typeof ui.resourceUri === "string" ? ui.resourceUri : "";
  let resource = content.find((item) => item.resource?.text || item.resource?.blob)?.resource;
  if (!resource && uri) resource = await client.readResource(uri) ?? undefined;
  let html = resource?.text || "";
  if (!html && resource?.blob) { try { html = atob(resource.blob); } catch { throw new Error("MCP App resource could not be decoded."); } }
  if (!html) return undefined;
  return { title, html, toolResult: { content: result.content || [], isError: Boolean(result.isError), structuredContent: result.structuredContent }, serverUrl: server.url, serverHeaders: server.headers, serverConfig: structuredClone(server) };
}
