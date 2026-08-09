import { assertEquals } from "jsr:@std/assert";
import { discoverMcpHttpTools, MCP_PROTOCOL_VERSION, McpHttpClient, McpHttpError, type McpHttpServerConfig } from "./httpClient.ts";

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

Deno.test("MCP HTTP negotiates the 2026 stateless transport and paginates tools", async () => {
  const original = (globalThis as unknown as { window?: unknown }).window;
  const requests: Array<
    {
      method: string;
      headers: Record<string, string>;
      body: Record<string, unknown>;
    }
  > = [];
  (globalThis as unknown as { window: unknown }).window = {
    go: {
      main: {
        App: {
          WorkflowHTTPRequest: (
            request: {
              method: string;
              headers: Record<string, string>;
              body: string;
            },
          ) => {
            const body = JSON.parse(request.body) as {
              method: string;
              params: Record<string, unknown>;
            };
            requests.push({
              method: request.method,
              headers: request.headers,
              body,
            });
            const result = body.method === "server/discover"
              ? { supportedVersions: [MCP_PROTOCOL_VERSION] }
              : body.params.cursor
              ? { tools: [{ name: "second" }] }
              : { tools: [{ name: "first" }], nextCursor: "page-2" };
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
              bodyBase64: "",
            });
          },
        },
      },
    },
  };
  try {
    const client = new McpHttpClient({
      name: "Modern",
      transport: "http",
      url: "https://example.com/mcp",
      enabled: true,
    });
    assertEquals((await client.listTools()).map((tool) => tool.name), [
      "first",
      "second",
    ]);
    assertEquals(
      requests.map((request) => (request.body as { method: string }).method),
      ["server/discover", "tools/list", "tools/list"],
    );
    assertEquals(
      requests[1].headers["MCP-Protocol-Version"],
      MCP_PROTOCOL_VERSION,
    );
    assertEquals(requests[1].headers["Mcp-Method"], "tools/list");
    assertEquals(
      (requests[1].body.params as { _meta: Record<string, unknown> })
        ._meta["io.modelcontextprotocol/protocolVersion"],
      MCP_PROTOCOL_VERSION,
    );
    assertEquals(
      requests.some((request) => "Mcp-Session-Id" in request.headers),
      false,
    );
  } finally {
    if (original === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else (globalThis as unknown as { window: unknown }).window = original;
  }
});

Deno.test("MCP HTTP falls back to a negotiated legacy session", async () => {
  const original = (globalThis as unknown as { window?: unknown }).window;
  const requests: Array<
    {
      method: string;
      headers: Record<string, string>;
      body?: Record<string, unknown>;
    }
  > = [];
  (globalThis as unknown as { window: unknown }).window = {
    go: {
      main: {
        App: {
          WorkflowHTTPRequest: (
            request: {
              method: string;
              headers: Record<string, string>;
              body?: string;
            },
          ) => {
            const body = request.body
              ? JSON.parse(request.body) as { method: string }
              : undefined;
            requests.push({
              method: request.method,
              headers: request.headers,
              body,
            });
            if (body?.method === "server/discover") {
              return Promise.resolve({
                status: 200,
                headers: {},
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  error: { code: -32601, message: "missing" },
                }),
                bodyBase64: "",
              });
            }
            if (body?.method === "initialize") {
              return Promise.resolve({
                status: 200,
                headers: { "mcp-session-id": "legacy-session" },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 2,
                  result: {
                    protocolVersion: "2025-11-25",
                    capabilities: {},
                    serverInfo: { name: "legacy", version: "1" },
                  },
                }),
                bodyBase64: "",
              });
            }
            if (body?.method === "tools/list") {
              return Promise.resolve({
                status: 200,
                headers: {},
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 3,
                  result: { tools: [] },
                }),
                bodyBase64: "",
              });
            }
            return Promise.resolve({
              status: 202,
              headers: {},
              body: "",
              bodyBase64: "",
            });
          },
        },
      },
    },
  };
  try {
    const client = new McpHttpClient({
      name: "Legacy",
      transport: "http",
      url: "https://example.com/mcp",
      enabled: true,
    });
    await client.listTools();
    const list = requests.find((request) =>
      request.body?.method === "tools/list"
    );
    assertEquals(list?.headers["Mcp-Session-Id"], "legacy-session");
    assertEquals(list?.headers["MCP-Protocol-Version"], "2025-11-25");
    assertEquals(
      requests.some((request) =>
        request.body?.method === "notifications/initialized"
      ),
      true,
    );
  } finally {
    if (original === undefined) {
      delete (globalThis as unknown as { window?: unknown }).window;
    } else (globalThis as unknown as { window: unknown }).window = original;
  }
});
