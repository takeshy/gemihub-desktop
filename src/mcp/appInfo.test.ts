import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { mcpAppInfoFromResult } from "./appInfo.ts";
import type { MCPServerConfig } from "../llm/settings.ts";

const server: MCPServerConfig = { id: "one", name: "Apps", transport: "http", url: "https://example.com/mcp", headers: { Authorization: "Bearer test" }, command: "", args: [], env: {}, framing: "content-length", enabled: true, toolHints: [], verified: true, oauth: false };

Deno.test("MCP Apps metadata loads ui resources and remains reopenable", async () => {
  const app = await mcpAppInfoFromResult({ readResource: (uri) => Promise.resolve({ uri, mimeType: "text/html", text: "<main>App</main>", _meta: { ui: { csp: { resourceDomains: ["https://unpkg.com"] } } } }) }, { content: [{ type: "text", text: "done" }], _meta: { ui: { resourceUri: "ui://result/app.html" } } }, "render", server);
  assertStringIncludes(app?.html ?? "", "Content-Security-Policy");
  assertStringIncludes(app?.html ?? "", "https://unpkg.com");
  assertStringIncludes(app?.html ?? "", "<main>App</main>");
  assertEquals(app?.serverUrl, server.url);
  assertEquals(app?.serverConfig?.transport, "http");
  assertEquals((app?.toolResult.content as Array<{ text?: string }>)[0].text, "done");
});
