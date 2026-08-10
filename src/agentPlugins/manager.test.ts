import { assertEquals, assertThrows } from "jsr:@std/assert";
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA, mergeAgentPluginMcpServer, normalizeAgentPluginRepo, parseAgentPluginManifest, parseAgentPluginMcp, parseAgentPluginSkill } from "./manager.ts";

Deno.test("Agent Plugin manifest follows the closed v1 schema failure boundaries", () => {
  const parsed = parseAgentPluginManifest(JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "demo.plugin", unknown: true }));
  assertEquals(parsed.manifest.name, "demo.plugin");
  assertEquals(parsed.warnings.length, 1);
  assertEquals("unknown" in parsed.manifest, false);
  assertThrows(() => parseAgentPluginManifest(JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "Bad" })));
});

Deno.test("Agent Plugin Skills validate optional Agent Skills metadata", () => {
  const valid = parseAgentPluginSkill("skills/review/SKILL.md", "---\nname: review\ndescription: Review files.\ncompatibility: Requires git.\nmetadata:\n  owner: team\nallowed-tools: Bash\nlicense: MIT\n---\nDo it.", "demo");
  assertEquals(valid.name, "review");
  assertThrows(() => parseAgentPluginSkill("skills/review/SKILL.md", "---\nname: review\ndescription: Review files.\nmetadata:\n  retries: 2\n---\n", "demo"));
  assertThrows(() => parseAgentPluginSkill(`skills/${"a".repeat(65)}/SKILL.md`, `---\nname: ${"a".repeat(65)}\ndescription: Too long.\n---\n`, "demo"));
});

Deno.test("Agent Plugin MCP skips invalid entries and expands portable paths", () => {
  const parsed = parseAgentPluginMcp(JSON.stringify({ $schema: AGENT_PLUGIN_MCP_SCHEMA, mcpServers: {
    local: { type: "stdio", command: "./bin/server", args: ["${PLUGIN_DATA}/db"], env: {}, cwd: "./data" },
    noArgs: { type: "stdio", command: "server", cwd: "${PLUGIN_DATA}/state" },
    remote: { type: "streamable-http", url: "https://example.com/mcp" },
    unsafe: { type: "stdio", command: "./../escape", args: [], env: {} },
    absoluteCwd: { type: "stdio", command: "server", cwd: "/etc" },
    relativeCwd: { type: "stdio", command: "server", cwd: "../../.." },
  } }), "demo", "/plugins/demo", "/data/demo");
  assertEquals(parsed.servers.length, 3);
  assertEquals(parsed.servers[0].command, "/plugins/demo/bin/server");
  assertEquals(parsed.servers[0].args, ["/data/demo/db"]);
  assertEquals(parsed.servers[0].cwd, "/plugins/demo/data");
  assertEquals(parsed.servers[0].enabled, false);
  assertEquals(parsed.servers[0].verified, false);
  assertEquals(parsed.servers[1].args, []);
  assertEquals(parsed.servers[1].cwd, "/data/demo/state");
  assertEquals(parsed.warnings.length, 3);
});

Deno.test("Agent Plugin repository normalization rejects path components", () => {
  assertEquals(normalizeAgentPluginRepo("https://github.com/owner/repo.git"), "owner/repo");
  assertEquals(normalizeAgentPluginRepo("../repo"), null);
  assertEquals(normalizeAgentPluginRepo("owner/.."), null);
});

Deno.test("Agent Plugin MCP approval is retained only for an unchanged connection", () => {
  const parsed = parseAgentPluginMcp(JSON.stringify({ $schema: AGENT_PLUGIN_MCP_SCHEMA, mcpServers: { remote: { type: "streamable-http", url: "https://example.com/mcp" } } }), "demo");
  const next = parsed.servers[0];
  const approved = { ...next, enabled: true, verified: true, toolHints: ["search"], oauth: true, oauthClientSecret: "secret" };
  const unchanged = mergeAgentPluginMcpServer(next, approved);
  assertEquals(unchanged.verified, true);
  assertEquals(unchanged.oauthClientSecret, "secret");
  const changed = mergeAgentPluginMcpServer({ ...next, url: "https://other.example.com/mcp" }, approved);
  assertEquals(changed.enabled, false);
  assertEquals(changed.verified, false);
  assertEquals(changed.oauthClientSecret, undefined);
});
