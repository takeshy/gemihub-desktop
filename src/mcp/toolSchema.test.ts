import { assertEquals } from "jsr:@std/assert";
import { cachedMcpTools, clearMcpToolsCache, mcpServerCacheKey, normalizeMcpInputSchema, storeMcpTools } from "./toolSchema.ts";

Deno.test("MCP schemas are recursively normalized for chat providers", () => {
  assertEquals(normalizeMcpInputSchema({ type: "object", properties: { files: { type: "array", items: { type: "object", properties: { path: { type: ["string", "null"], description: "Path" } }, required: ["path"] } }, mode: { type: "string", enum: ["a", "b"] } }, required: ["files"], additionalProperties: false }), {
    type: "object", properties: { files: { type: "array", items: { type: "object", properties: { path: { type: "string", description: "Path" } }, required: ["path"] } }, mode: { type: "string", enum: ["a", "b"] } }, required: ["files"],
  });
  assertEquals(normalizeMcpInputSchema({}), { type: "object", properties: {} });
});

Deno.test("MCP tool discovery cache keys include transport and credentials", () => {
  clearMcpToolsCache();
  const server = { transport: "http", url: "https://example.com/mcp", headers: { Authorization: "Bearer a" } };
  const other = { ...server, headers: { Authorization: "Bearer b" } };
  storeMcpTools(server, [{ name: "search" }]);
  assertEquals(cachedMcpTools(server), [{ name: "search" }]);
  assertEquals(cachedMcpTools(other), null);
  assertEquals(mcpServerCacheKey(server) === mcpServerCacheKey(other), false);
});
