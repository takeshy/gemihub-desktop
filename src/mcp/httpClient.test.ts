import { assertEquals } from "jsr:@std/assert";
import { discoverMcpHttpTools, McpHttpClient, McpHttpError, type McpHttpServerConfig } from "./httpClient.ts";

Deno.test("MCP HTTP server config remains JSON serializable", () => {
  const config: McpHttpServerConfig = { name: "Local Tools", transport: "http", url: "http://127.0.0.1:3000/mcp", headers: { Authorization: "Bearer token" }, enabled: true };
  assertEquals(JSON.parse(JSON.stringify(config)), config);
});

Deno.test("MCP discovery isolates unavailable servers", async () => {
  const result = await discoverMcpHttpTools([
    { name: "one", transport: "http", url: "https://one.invalid/mcp", enabled: true },
    { name: "two", transport: "http", url: "https://two.invalid/mcp", enabled: true },
  ], true);
  assertEquals(result.bindings, []);
  assertEquals(result.clients.size, 0);
  assertEquals(result.errors.length, 2);
});

Deno.test("MCP HTTP errors retain the status needed for OAuth discovery", async () => {
  const original = (globalThis as unknown as { window?: unknown }).window;
  (globalThis as unknown as { window: unknown }).window = { go: { main: { App: { WorkflowHTTPRequest: () => Promise.resolve({ status: 401, headers: { "www-authenticate": "Bearer" }, body: "", bodyBase64: "" }) } } } };
  try {
    const client = new McpHttpClient({ name: "OAuth", transport: "http", url: "https://example.com/mcp", enabled: true });
    let caught: unknown;
    try { await client.listTools(); } catch (error) { caught = error; }
    if (!(caught instanceof McpHttpError) || caught.status !== 401) throw new Error(`expected an MCP 401 error, got ${String(caught)}`);
  } finally {
    if (original === undefined) delete (globalThis as unknown as { window?: unknown }).window;
    else (globalThis as unknown as { window: unknown }).window = original;
  }
});
