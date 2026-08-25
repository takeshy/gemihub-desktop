import type { McpAppInfo } from "../lib/wailsBackend";
import type { MCPServerConfig } from "../llm/settings";
import { applyMcpAppCsp, type McpAppResource } from "./appCsp";

export interface McpAppResourceClient {
  readResource: (uri: string) => Promise<McpAppResource | null>;
}

/**
 * Servers announce the app resource either as nested `_meta.ui.resourceUri` or
 * as the flat `_meta["ui/resourceUri"]` key; accept both.
 */
export function mcpAppResourceUri(rawMeta: unknown): string {
  const meta = rawMeta && typeof rawMeta === "object" ? rawMeta as Record<string, unknown> : {};
  const ui = meta.ui && typeof meta.ui === "object" ? meta.ui as Record<string, unknown> : {};
  const uri = typeof ui.resourceUri === "string" ? ui.resourceUri : meta["ui/resourceUri"];
  return typeof uri === "string" && uri.startsWith("ui://") ? uri : "";
}

export async function mcpAppInfoFromResult(client: McpAppResourceClient, result: Record<string, unknown>, title: string, server: MCPServerConfig): Promise<McpAppInfo | undefined> {
  const content = Array.isArray(result.content) ? result.content as Array<{ resource?: McpAppResource }> : [];
  const uri = mcpAppResourceUri(result._meta);
  let resource = content.find((item) => item.resource?.text || item.resource?.blob)?.resource;
  if (!resource && uri) resource = await client.readResource(uri) ?? undefined;
  let html = resource?.text || "";
  if (!html && resource?.blob) { try { html = atob(resource.blob); } catch { throw new Error("MCP App resource could not be decoded."); } }
  if (!html) return undefined;
  html = applyMcpAppCsp(html, resource ?? {});
  return { title, html, toolResult: { content: result.content || [], isError: Boolean(result.isError), structuredContent: result.structuredContent }, serverUrl: server.url, serverHeaders: server.headers, serverConfig: structuredClone(server) };
}
