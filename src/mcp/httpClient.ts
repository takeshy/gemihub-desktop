import { mcpOAuthAccessToken, workflowHTTPRequest, type ChatToolDefinition, type ExternalHTTPResponse } from "../lib/wailsBackend";
import { cachedMcpTools, normalizeMcpInputSchema, storeMcpTools } from "./toolSchema";

export interface McpHttpServerConfig {
  id?: string;
  name: string;
  transport: "http";
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
  oauth?: boolean;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolBinding extends ChatToolDefinition {
  server: McpHttpServerConfig;
  remoteName: string;
}

function parseMcpResponse(body: string): { result?: Record<string, unknown>; error?: { message?: string } } {
  const payloads = body.startsWith("data:") ? body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean) : [body.trim()];
  for (const payload of payloads.reverse()) {
    try { return JSON.parse(payload) as { result?: Record<string, unknown>; error?: { message?: string } }; } catch { /* try the preceding event */ }
  }
  throw new Error("MCP server returned an invalid response.");
}

export class McpHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "McpHttpError"; }
}

function responseResult(response: ExternalHTTPResponse, method: string): Record<string, unknown> {
  if (response.status < 200 || response.status >= 300) throw new McpHttpError(`MCP ${method} failed with HTTP ${response.status}.`, response.status);
  const payload = parseMcpResponse(response.body);
  if (payload.error) throw new Error(payload.error.message || `MCP ${method} failed.`);
  return payload.result ?? {};
}

export class McpHttpClient {
  private requestID = 1;
  private sessionHeaders: Record<string, string> | null = null;

  constructor(readonly server: McpHttpServerConfig) {}

  private async baseHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { Accept: "application/json, text/event-stream", "Content-Type": "application/json", ...(this.server.headers || {}) };
    if (this.server.oauth) {
      if (!this.server.id) throw new Error(`MCP server ${this.server.name} is missing its OAuth credential ID.`);
      headers.Authorization = `Bearer ${await mcpOAuthAccessToken(this.server.id, this.server.url)}`;
    }
    return headers;
  }

  async initialize(): Promise<void> {
    if (this.sessionHeaders) return;
    if (!/^https?:\/\//i.test(this.server.url)) throw new Error(`MCP server ${this.server.name} requires an HTTP or HTTPS URL.`);
    const headers = await this.baseHeaders();
    let response: ExternalHTTPResponse | null = null, lastError: unknown;
    for (const protocolVersion of ["2025-03-26", "2024-11-05"]) {
      try {
        const candidate = await workflowHTTPRequest({ url: this.server.url, method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: this.requestID++, method: "initialize", params: { protocolVersion, capabilities: {}, clientInfo: { name: "gemihub-desktop", version: "0.1.0" } } }) });
        responseResult(candidate, "initialize"); response = candidate; break;
      } catch (error) { lastError = error; }
    }
    if (!response) throw lastError instanceof Error ? lastError : new Error("MCP initialize failed.");
    const session = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "mcp-session-id")?.[1];
    this.sessionHeaders = session ? { ...headers, "Mcp-Session-Id": session } : headers;
    await workflowHTTPRequest({ url: this.server.url, method: "POST", headers: this.sessionHeaders, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) });
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    await this.initialize();
    const response = await workflowHTTPRequest({ url: this.server.url, method: "POST", headers: this.sessionHeaders!, body: JSON.stringify({ jsonrpc: "2.0", id: this.requestID++, method, params }) });
    return responseResult(response, method);
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = await this.send("tools/list");
    return Array.isArray(result.tools) ? result.tools.filter((tool): tool is McpToolInfo => !!tool && typeof tool === "object" && typeof (tool as McpToolInfo).name === "string") : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return await this.send("tools/call", { name, arguments: args });
  }

  async readResource(uri: string): Promise<{ uri?: string; mimeType?: string; text?: string; blob?: string } | null> {
    const result = await this.send("resources/read", { uri });
    const contents = Array.isArray(result.contents) ? result.contents as Array<{ uri?: string; mimeType?: string; text?: string; blob?: string }> : [];
    return contents[0] ?? null;
  }

  async close(): Promise<void> {
    if (!this.sessionHeaders?.["Mcp-Session-Id"]) return;
    await workflowHTTPRequest({ url: this.server.url, method: "DELETE", headers: this.sessionHeaders }).catch(() => undefined);
    this.sessionHeaders = null;
  }
}

export function safeMcpName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

export async function discoverMcpHttpTools(servers: McpHttpServerConfig[], forceRefresh = false): Promise<{ bindings: McpToolBinding[]; clients: Map<string, McpHttpClient>; errors: string[] }> {
  const clients = new Map<string, McpHttpClient>();
  const errors: string[] = [];
  const lists = await Promise.all(servers.map(async (server) => {
    const client = new McpHttpClient(server);
    clients.set(server.name, client);
    try { const cached = cachedMcpTools(server, forceRefresh); const tools = cached ?? await client.listTools(); if (!cached) storeMcpTools(server, tools); return { server, tools }; }
    catch (error) { await client.close(); clients.delete(server.name); errors.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`); return { server, tools: [] }; }
  }));
  const bindings = lists.flatMap(({ server, tools }) => tools.map((tool) => ({
    name: `mcp_${safeMcpName(server.name)}_${safeMcpName(tool.name)}`,
    description: tool.description || `MCP tool ${tool.name} from ${server.name}`,
    parameters: normalizeMcpInputSchema(tool.inputSchema),
    server,
    remoteName: tool.name,
  })));
  return { bindings, clients, errors };
}
