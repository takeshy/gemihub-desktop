import { assertEquals, assertRejects } from "jsr:@std/assert";
import { requireMcpApproval } from "./approval.ts";
import { defaultChatSettings, loadChatSettings, saveChatSettings, type MCPServerConfig } from "../llm/settings.ts";

Deno.test("MCP approval supports once, remember, revoke, deny and changed connection", async () => {
  const previous = Object.fromEntries(["localStorage", "document", "window"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = new Map<string, string>();
  let choice = "Allow once";
  let prompts = 0;
  class Element {
    textContent = ""; children: Element[] = []; onclick?: () => void;
    append(...elements: Element[]) { this.children.push(...elements); }
    remove() {}
    showModal() { prompts++; this.children.find(child => child.textContent.startsWith(choice))?.onclick?.(); }
  }
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } },
    document: { configurable: true, value: { createElement: () => new Element(), body: new Element() } },
    window: { configurable: true, value: { dispatchEvent: () => true } },
  });
  const server = { id: "demo", name: "Demo", transport: "http", url: "https://example.com/mcp", enabled: true, verified: true, toolHints: ["read"] } as MCPServerConfig;
  try {
    saveChatSettings({ ...defaultChatSettings, mcpServers: [server] });
    await requireMcpApproval(server, "read", {});
    await requireMcpApproval(server, "read", {});
    assertEquals(prompts, 2);
    choice = "Always allow";
    await requireMcpApproval(server, "read", {});
    assertEquals(loadChatSettings().mcpServers[0].allowedTools, ["read"]);
    await requireMcpApproval(server, "read", {});
    assertEquals(prompts, 3);
    const revoked = loadChatSettings(); revoked.mcpServers[0].allowedTools = []; saveChatSettings(revoked);
    choice = "Deny";
    await assertRejects(() => requireMcpApproval(server, "read", {}), Error, "denied");
    const automatic = loadChatSettings(); automatic.mcpServers[0].autoApprove = true; saveChatSettings(automatic);
    await requireMcpApproval(server, "write", {});
    assertEquals(prompts, 4);
    await assertRejects(() => requireMcpApproval({ ...server, url: "https://other.example/mcp" }, "read", {}), Error, "denied");
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
