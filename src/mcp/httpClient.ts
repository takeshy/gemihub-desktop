import { requireMcpApproval } from "./approval";
import {
  type ChatToolDefinition,
  type ExternalHTTPResponse,
  mcpOAuthAccessToken,
  workflowHTTPRequest,
} from "../lib/wailsBackend";
import {
  cachedMcpTools,
  normalizeMcpInputSchema,
  storeMcpTools,
} from "./toolSchema";
import type { McpAppResource } from "./appCsp";

export interface McpHttpServerConfig {
  id?: string;
  name: string;
  transport: "http";
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
  oauth?: boolean;
  autoApprove?: boolean;
  allowedTools?: string[];
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

function parseMcpResponse(
  body: string,
): {
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string; data?: unknown };
} {
  const payloads = body.startsWith("data:")
    ? body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((
      line,
    ) => line.slice(5).trim()).filter(Boolean)
    : [body.trim()];
  for (const payload of payloads.reverse()) {
    try {
      return JSON.parse(payload) as {
        result?: Record<string, unknown>;
        error?: { message?: string };
      };
    } catch { /* try the preceding event */ }
  }
  throw new Error("MCP server returned an invalid response.");
}

export class McpHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "McpHttpError";
  }
}

export class McpRpcError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(`MCP Error ${code}: ${message}`);
    this.name = "McpRpcError";
  }
}

function responseResult(
  response: ExternalHTTPResponse,
  method: string,
): Record<string, unknown> {
  if (response.status < 200 || response.status >= 300) {
    const detail = response.body.trim().replace(/\s+/g, " ").slice(0, 500);
    throw new McpHttpError(
      `MCP ${method} failed with HTTP ${response.status}${
        detail ? `: ${detail}` : "."
      }`,
      response.status,
    );
  }
  const payload = parseMcpResponse(response.body);
  if (payload.error) {
    throw new McpRpcError(
      payload.error.code ?? -32603,
      payload.error.message || `MCP ${method} failed.`,
      payload.error.data,
    );
  }
  return payload.result ?? {};
}

export const MCP_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-11-25";
const CLIENT_INFO = { name: "gemihub-desktop", version: "1.1.0" } as const;
/**
 * MCP Apps interop: servers only offer HTML app resources to clients that
 * declare they can render them.
 */
export const MCP_APPS_CLIENT_CAPABILITIES = {
  extensions: {
    "io.modelcontextprotocol/ui": {
      mimeTypes: ["text/html;profile=mcp-app"],
    },
  },
} as const;
type ProtocolMode = "unknown" | "modern" | "legacy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldTryLegacyProtocol(error: unknown): boolean {
  return (error instanceof McpHttpError &&
    [400, 404, 405].includes(error.status)) ||
    (error instanceof McpRpcError && [-32601, -32022].includes(error.code));
}

export class McpHttpClient {
  private requestID = 1;
  private protocolMode: ProtocolMode = "unknown";
  private negotiatedVersion = "";
  private sessionID = "";
  private negotiationPromise: Promise<void> | null = null;

  constructor(readonly server: McpHttpServerConfig) {}

  private async baseHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...(this.server.headers || {}),
    };
    if (this.server.oauth) {
      if (!this.server.id) {
        throw new Error(
          `MCP server ${this.server.name} is missing its OAuth credential ID.`,
        );
      }
      headers.Authorization = `Bearer ${await mcpOAuthAccessToken(
        this.server.id,
        this.server.url,
      )}`;
    }
    return headers;
  }

  private async sendRaw(
    method: string,
    params: Record<string, unknown> = {},
    mode: "modern" | "legacy" | "legacy-initialize" = "modern",
  ): Promise<
    { response: ExternalHTTPResponse; result: Record<string, unknown> }
  > {
    if (!/^https?:\/\//i.test(this.server.url)) {
      throw new Error(
        `MCP server ${this.server.name} requires an HTTP or HTTPS URL.`,
      );
    }
    const headers = await this.baseHeaders();
    headers["Mcp-Method"] = method;
    const requestName = params.name ?? params.uri;
    if (typeof requestName === "string") headers["Mcp-Name"] = requestName;
    if (mode === "modern") {
      headers["MCP-Protocol-Version"] = MCP_PROTOCOL_VERSION;
    } else if (mode === "legacy" && this.negotiatedVersion) {
      headers["MCP-Protocol-Version"] = this.negotiatedVersion;
    }
    if (mode !== "modern" && this.sessionID) {
      headers["Mcp-Session-Id"] = this.sessionID;
    }
    const requestParams = mode === "modern"
      ? {
        ...params,
        _meta: {
          ...(isRecord(params._meta) ? params._meta : {}),
          "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
          "io.modelcontextprotocol/clientCapabilities": MCP_APPS_CLIENT_CAPABILITIES,
        },
      }
      : params;
    const response = await workflowHTTPRequest({
      url: this.server.url,
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.requestID++,
        method,
        params: requestParams,
      }),
    });
    const result = responseResult(response, method);
    if (mode !== "modern") {
      this.sessionID = Object.entries(response.headers).find(([key]) =>
        key.toLowerCase() === "mcp-session-id"
      )?.[1] || this.sessionID;
    }
    return { response, result };
  }

  private async sendLegacyNotification(method: string): Promise<void> {
    const headers = await this.baseHeaders();
    headers["Mcp-Method"] = method;
    if (this.negotiatedVersion) {
      headers["MCP-Protocol-Version"] = this.negotiatedVersion;
    }
    if (this.sessionID) headers["Mcp-Session-Id"] = this.sessionID;
    await workflowHTTPRequest({
      url: this.server.url,
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method, params: {} }),
    }).catch(() => undefined);
  }

  private async initializeLegacy(requestedVersion: string): Promise<void> {
    const { result } = await this.sendRaw("initialize", {
      protocolVersion: requestedVersion,
      capabilities: MCP_APPS_CLIENT_CAPABILITIES,
      clientInfo: CLIENT_INFO,
    }, "legacy-initialize");
    this.protocolMode = "legacy";
    this.negotiatedVersion = typeof result.protocolVersion === "string"
      ? result.protocolVersion
      : requestedVersion;
    await this.sendLegacyNotification("notifications/initialized");
  }

  private async negotiateProtocol(): Promise<void> {
    try {
      const { result } = await this.sendRaw("server/discover");
      const supported = Array.isArray(result.supportedVersions)
        ? result.supportedVersions.filter((value): value is string =>
          typeof value === "string"
        )
        : [];
      if (supported.includes(MCP_PROTOCOL_VERSION)) {
        this.protocolMode = "modern";
        this.negotiatedVersion = MCP_PROTOCOL_VERSION;
        return;
      }
      await this.initializeLegacy(
        supported.find((version) => version !== MCP_PROTOCOL_VERSION) ||
          LEGACY_PROTOCOL_VERSION,
      );
    } catch (error) {
      if (!shouldTryLegacyProtocol(error)) throw error;
      await this.initializeLegacy(LEGACY_PROTOCOL_VERSION);
    }
  }

  async initialize(): Promise<void> {
    if (this.protocolMode !== "unknown") return;
    if (!this.negotiationPromise) {
      this.negotiationPromise = this.negotiateProtocol().catch(async error => { await this.close().catch(() => {}); throw error; }).finally(() => {
        this.negotiationPromise = null;
      });
    }
    await this.negotiationPromise;
  }

  async send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    await this.initialize();
    return (await this.sendRaw(
      method,
      params,
      this.protocolMode === "modern" ? "modern" : "legacy",
    )).result;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const tools: McpToolInfo[] = [];
    let cursor = "";
    for (let page = 0; page < 100; page++) {
      const result = await this.send("tools/list", cursor ? { cursor } : {});
      if (Array.isArray(result.tools)) {
        tools.push(
          ...result.tools.filter((tool): tool is McpToolInfo =>
            !!tool && typeof tool === "object" &&
            typeof (tool as McpToolInfo).name === "string"
          ),
        );
      }
      cursor = typeof result.nextCursor === "string" ? result.nextCursor : "";
      if (!cursor) break;
    }
    return tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    skipApproval = false,
  ): Promise<Record<string, unknown>> {
    if (!skipApproval) await requireMcpApproval(this.server, name, args);
    return await this.send("tools/call", { name, arguments: args });
  }

  async readResource(
    uri: string,
  ): Promise<McpAppResource | null> {
    const result = await this.send("resources/read", { uri });
    const contents = Array.isArray(result.contents)
      ? result.contents as McpAppResource[]
      : [];
    return contents[0] ?? null;
  }

  async close(): Promise<void> {
    if (this.protocolMode === "legacy" && this.sessionID) {
      const headers = await this.baseHeaders();
      headers["Mcp-Session-Id"] = this.sessionID;
      if (this.negotiatedVersion) {
        headers["MCP-Protocol-Version"] = this.negotiatedVersion;
      }
      await workflowHTTPRequest({
        url: this.server.url,
        method: "DELETE",
        headers,
      }).catch(() => undefined);
    }
    this.protocolMode = "unknown";
    this.negotiatedVersion = "";
    this.sessionID = "";
  }
}

export function safeMcpName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function discoverMcpHttpTools(
  servers: McpHttpServerConfig[],
  forceRefresh = false,
): Promise<
  {
    bindings: McpToolBinding[];
    clients: Map<string, McpHttpClient>;
    errors: string[];
  }
> {
  const clients = new Map<string, McpHttpClient>();
  const errors: string[] = [];
  const lists = await Promise.all(servers.map(async (server) => {
    const client = new McpHttpClient(server);
    clients.set(server.name, client);
    try {
      const cached = cachedMcpTools(server, forceRefresh);
      const tools = cached ?? await client.listTools();
      if (!cached) storeMcpTools(server, tools);
      return { server, tools };
    } catch (error) {
      await client.close();
      clients.delete(server.name);
      errors.push(
        `${server.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { server, tools: [] };
    }
  }));
  const bindings = lists.flatMap(({ server, tools }) =>
    tools.map((tool) => ({
      name: `mcp_${safeMcpName(server.name)}_${safeMcpName(tool.name)}`,
      description: tool.description ||
        `MCP tool ${tool.name} from ${server.name}`,
      parameters: normalizeMcpInputSchema(tool.inputSchema),
      server,
      remoteName: tool.name,
    }))
  );
  return { bindings, clients, errors };
}
