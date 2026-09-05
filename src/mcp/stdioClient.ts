import { requireMcpApproval } from "./approval";
import { mcpStdioClose, mcpStdioRequest, mcpStdioStart, type ChatToolDefinition } from "../lib/wailsBackend";
import type { MCPServerConfig } from "../llm/settings";
import { MCP_APPS_CLIENT_CAPABILITIES, safeMcpName, type McpToolInfo } from "./httpClient";
import { cachedMcpTools, normalizeMcpInputSchema, storeMcpTools } from "./toolSchema";
import type { McpAppResource } from "./appCsp";

export interface McpStdioToolBinding extends ChatToolDefinition {
  server: MCPServerConfig;
  remoteName: string;
}

export class McpStdioClient {
  private sessionID = "";
  constructor(readonly server: MCPServerConfig) {}

  async initialize(): Promise<void> {
    if (this.sessionID) return;
    this.sessionID = await mcpStdioStart({ name: this.server.name, command: this.server.command, args: this.server.args, env: this.server.env, cwd: this.server.cwd, pluginRoot: this.server.pluginRoot, pluginData: this.server.pluginData, framing: this.server.framing });
    try {
      let initialized = false, lastError: unknown;
      for (const protocolVersion of ["2025-03-26", "2024-11-05"]) {
        try { await mcpStdioRequest(this.sessionID, "initialize", { protocolVersion, capabilities: MCP_APPS_CLIENT_CAPABILITIES, clientInfo: { name: "gemihub-desktop", version: "0.1.0" } }); initialized = true; break; }
        catch (error) {
          lastError = error;
          // Retry negotiation only for an explicit protocol error, never a failed process.
          if (!error || typeof error !== "object" || !("code" in error) || ![-32601, -32602, -32022].includes(Number(error.code))) throw error;
        }
      }
      if (!initialized) throw lastError instanceof Error ? lastError : new Error("MCP initialize failed.");
      await mcpStdioRequest(this.sessionID, "notifications/initialized", {});
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    await this.initialize();
    return await mcpStdioRequest(this.sessionID, method, params);
  }

  async listTools(): Promise<McpToolInfo[]> {
    const result = await this.send("tools/list");
    return Array.isArray(result.tools) ? result.tools.filter((tool): tool is McpToolInfo => !!tool && typeof tool === "object" && typeof (tool as McpToolInfo).name === "string") : [];
  }

  async callTool(name: string, args: Record<string, unknown>, skipApproval = false): Promise<Record<string, unknown>> {
    if (!skipApproval) await requireMcpApproval(this.server, name, args);
    return await this.send("tools/call", { name, arguments: args });
  }

  async readResource(uri: string): Promise<McpAppResource | null> {
    const result = await this.send("resources/read", { uri });
    const contents = Array.isArray(result.contents) ? result.contents as McpAppResource[] : [];
    return contents[0] ?? null;
  }

  async close(): Promise<void> {
    if (!this.sessionID) return;
    const id = this.sessionID; this.sessionID = "";
    await mcpStdioClose(id);
  }
}

export async function discoverMcpStdioTools(servers: MCPServerConfig[], forceRefresh = false): Promise<{ bindings: McpStdioToolBinding[]; clients: Map<string, McpStdioClient>; errors: string[] }> {
  const clients = new Map<string, McpStdioClient>();
  const errors: string[] = [];
  const lists = await Promise.all(servers.map(async (server) => {
    const client = new McpStdioClient(server); clients.set(server.name, client);
    try { const cached = cachedMcpTools(server, forceRefresh); const tools = cached ?? await client.listTools(); if (!cached) storeMcpTools(server, tools); return { server, tools }; }
    catch (error) { await client.close(); clients.delete(server.name); errors.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`); return { server, tools: [] }; }
  }));
  return { clients, errors, bindings: lists.flatMap(({ server, tools }) => tools.map((tool) => ({ name: `mcp_${safeMcpName(server.name)}_${safeMcpName(tool.name)}`, description: tool.description || `MCP tool ${tool.name} from ${server.name}`, parameters: normalizeMcpInputSchema(tool.inputSchema), server, remoteName: tool.name }))) };
}
