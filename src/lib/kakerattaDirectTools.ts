import { McpHttpClient, safeMcpName } from "../mcp/httpClient";
import type { MCPServerConfig } from "../llm/settings";

export interface DirectToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

function textOf(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content)
    ? result.content as { type?: string; text?: string }[]
    : [];
  return content.filter((item) => item.type === "text").map((item) =>
    item.text ?? ""
  ).join("\n");
}

/**
 * Direct requests use only explicitly selected HTTP servers and only tools
 * that are already approved (Always approve, or listed in allowedTools).
 * No approval dialog is ever shown for a background request.
 */
export async function getDirectTools(
  servers: MCPServerConfig[],
  selectedIds: string[],
) {
  const selected = new Set(selectedIds);
  const chosen = servers.filter((server) =>
    server.enabled && server.transport === "http" && selected.has(server.id)
  );
  const clients = new Map<string, McpHttpClient>();
  const routes = new Map<string, { client: McpHttpClient; remote: string }>();
  const definitions: DirectToolDefinition[] = [];
  for (const server of chosen) {
    const client = new McpHttpClient({
      id: server.id,
      name: server.name,
      transport: "http",
      url: server.url,
      headers: server.headers,
      enabled: true,
      oauth: server.oauth,
    });
    try {
      const tools = await client.listTools();
      clients.set(server.id, client);
      for (const tool of tools) {
        if (!server.autoApprove && !server.allowedTools?.includes(tool.name)) {
          continue;
        }
        const name = `mcp_${safeMcpName(server.name)}_${safeMcpName(tool.name)}`;
        routes.set(name, { client, remote: tool.name });
        definitions.push({
          name,
          description: tool.description ?? "",
          parameters: tool.inputSchema ?? { type: "object" },
        });
      }
    } catch {
      await client.close().catch(() => undefined);
    }
  }
  return {
    definitions,
    async execute(
      name: string,
      args: Record<string, unknown>,
      signal: AbortSignal,
    ): Promise<unknown> {
      const route = routes.get(name);
      if (!route) {
        return {
          error: "This tool was not selected and approved for direct requests",
        };
      }
      signal.throwIfAborted();
      const result = await route.client.callTool(route.remote, args, true);
      return result.isError === true
        ? { error: textOf(result) || "Tool execution failed" }
        : textOf(result) || result;
    },
    async close() {
      await Promise.all(
        [...clients.values()].map((client) =>
          client.close().catch(() => undefined)
        ),
      );
    },
  };
}
