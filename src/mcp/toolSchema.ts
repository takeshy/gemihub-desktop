import type { McpToolInfo } from "./httpClient";

const cache = new Map<string, { tools: McpToolInfo[]; fetchedAt: number }>();
export const mcpToolsCacheTTL = 60_000;

export function mcpServerCacheKey(server: { id?: string; transport?: string; url?: string; headers?: Record<string, string>; oauth?: boolean; command?: string; args?: string[]; env?: Record<string, string>; framing?: string }): string {
  return JSON.stringify({ transport: server.transport || "http", url: server.url || "", headers: server.headers || {}, oauth: server.oauth || false, credentialId: server.oauth ? server.id || "" : "", command: server.command || "", args: server.args || [], env: server.env || {}, framing: server.framing || "" });
}

export function cachedMcpTools(server: Parameters<typeof mcpServerCacheKey>[0], forceRefresh = false): McpToolInfo[] | null {
  const found = cache.get(mcpServerCacheKey(server));
  return !forceRefresh && found && Date.now() - found.fetchedAt < mcpToolsCacheTTL ? found.tools : null;
}

export function storeMcpTools(server: Parameters<typeof mcpServerCacheKey>[0], tools: McpToolInfo[]): void {
  cache.set(mcpServerCacheKey(server), { tools, fetchedAt: Date.now() });
}

export function clearMcpToolsCache(): void { cache.clear(); }

function schemaType(schema: Record<string, unknown>): string {
  if (typeof schema.type === "string") return schema.type;
  if (Array.isArray(schema.type)) return schema.type.find((value) => typeof value === "string" && value !== "null") as string || "string";
  const variant = [...(Array.isArray(schema.anyOf) ? schema.anyOf : []), ...(Array.isArray(schema.oneOf) ? schema.oneOf : [])].find((value) => value && typeof value === "object" && (value as Record<string, unknown>).type !== "null") as Record<string, unknown> | undefined;
  return variant ? schemaType(variant) : schema.properties ? "object" : "string";
}

export function normalizeMcpPropertySchema(raw: unknown): Record<string, unknown> {
  const schema = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const type = schemaType(schema);
  const result: Record<string, unknown> = { type };
  if (typeof schema.description === "string" && schema.description) result.description = schema.description;
  if (Array.isArray(schema.enum)) result.enum = schema.enum.filter((value): value is string | number | boolean => ["string", "number", "boolean"].includes(typeof value));
  if (type === "array") result.items = normalizeMcpPropertySchema(schema.items || { type: "string" });
  if (type === "object") {
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) ? schema.properties as Record<string, unknown> : {};
    result.properties = Object.fromEntries(Object.entries(properties).map(([name, value]) => [name, normalizeMcpPropertySchema(value)]));
    if (Array.isArray(schema.required)) result.required = schema.required.filter((value): value is string => typeof value === "string");
  }
  return result;
}

export function normalizeMcpInputSchema(raw: unknown): Record<string, unknown> {
  const normalized = normalizeMcpPropertySchema(raw);
  if (normalized.type !== "object") return { type: "object", properties: {} };
  normalized.properties ||= {};
  return normalized;
}
