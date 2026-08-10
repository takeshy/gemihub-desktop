import yaml from "js-yaml";
import { installAgentPlugin, type AgentPluginFile, type AgentPluginInstall, readAgentPluginFiles } from "../lib/wailsBackend";
import type { MCPServerConfig } from "../llm/settings";

export const AGENT_PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
export const AGENT_PLUGIN_MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const PLUGIN_NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SKILL_NAME = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MANIFEST_FIELDS = new Set(["$schema", "name", "version", "description", "author", "homepage", "repository", "license", "keywords", "extensions"]);
const utf8 = new TextDecoder("utf-8", { fatal: true });

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
function decode(value: string): Uint8Array { const raw = atob(value); return Uint8Array.from(raw, (char) => char.charCodeAt(0)); }
function encode(value: Uint8Array): string { let result = ""; for (let offset = 0; offset < value.length; offset += 0x8000) result += String.fromCharCode(...value.subarray(offset, offset + 0x8000)); return btoa(result); }

export interface AgentPluginManifest {
  $schema: string;
  name: string;
  version?: string;
  description?: string;
  author?: { name?: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  extensions?: Record<string, Record<string, unknown>>;
}
export interface AgentPluginSkill { name: string; description: string; path: string; content: string; pluginName: string; references?: string[]; }
export interface AgentPluginPreview { manifest: AgentPluginManifest; repo: string; version: string; sourceType: "release" | "branch"; sourceRef: string; commitSha: string; skills: AgentPluginSkill[]; mcpServers: MCPServerConfig[]; warnings: string[]; files: Record<string, string>; executables: string[]; }

export function parseAgentPluginManifest(text: string): { manifest: AgentPluginManifest; warnings: string[] } {
  let raw: unknown; try { raw = JSON.parse(text); } catch { throw new Error("plugin.json must be valid JSON"); }
  if (!record(raw) || raw.$schema !== AGENT_PLUGIN_SCHEMA || typeof raw.name !== "string" || raw.name.length > 64 || !PLUGIN_NAME.test(raw.name)) throw new Error("plugin.json does not conform to Agent Plugins v1.0.0");
  for (const field of ["version", "description", "homepage", "repository", "license"]) if (raw[field] !== undefined && typeof raw[field] !== "string") throw new Error(`plugin.json: ${field} must be a string`);
  if (raw.keywords !== undefined && (!Array.isArray(raw.keywords) || !raw.keywords.every((item) => typeof item === "string"))) throw new Error("plugin.json: keywords must be strings");
  if (raw.author !== undefined && (!record(raw.author) || Object.keys(raw.author).some((key) => !["name", "email", "url"].includes(key)) || Object.values(raw.author).some((item) => typeof item !== "string"))) throw new Error("plugin.json: invalid author");
  const warnings = Object.keys(raw).filter((key) => !MANIFEST_FIELDS.has(key)).map((key) => `Ignored unknown plugin.json field: ${key}`);
  if (raw.extensions !== undefined && !record(raw.extensions)) warnings.push("Ignored non-object plugin.json extensions field");
  else if (record(raw.extensions) && Object.values(raw.extensions).some((value) => !record(value))) throw new Error("plugin.json: extension values must be objects");
  const author = record(raw.author) ? raw.author as AgentPluginManifest["author"] : undefined;
  const extensions = record(raw.extensions) ? raw.extensions as Record<string, Record<string, unknown>> : undefined;
  return { manifest: {
    $schema: AGENT_PLUGIN_SCHEMA,
    name: raw.name,
    version: raw.version as string | undefined,
    description: raw.description as string | undefined,
    author,
    homepage: raw.homepage as string | undefined,
    repository: raw.repository as string | undefined,
    license: raw.license as string | undefined,
    keywords: raw.keywords as string[] | undefined,
    extensions,
  }, warnings };
}

export function parseAgentPluginSkill(path: string, text: string, pluginName: string): AgentPluginSkill {
  const directory = path.split("/")[1]; const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("missing YAML frontmatter");
  const frontmatter = yaml.load(match[1]);
  if (!record(frontmatter) || frontmatter.name !== directory || typeof frontmatter.name !== "string" || frontmatter.name.length > 64 || !SKILL_NAME.test(frontmatter.name) || typeof frontmatter.description !== "string" || frontmatter.description.length < 1 || frontmatter.description.length > 1024) throw new Error("invalid Agent Skill name or description");
  if (frontmatter.compatibility !== undefined && (typeof frontmatter.compatibility !== "string" || frontmatter.compatibility.length < 1 || frontmatter.compatibility.length > 500)) throw new Error("invalid Agent Skill compatibility");
  if (frontmatter.metadata !== undefined && (!record(frontmatter.metadata) || Object.values(frontmatter.metadata).some((value) => typeof value !== "string"))) throw new Error("invalid Agent Skill metadata");
  if (frontmatter["allowed-tools"] !== undefined && typeof frontmatter["allowed-tools"] !== "string") throw new Error("invalid Agent Skill allowed-tools");
  if (frontmatter.license !== undefined && typeof frontmatter.license !== "string") throw new Error("invalid Agent Skill license");
  return { name: frontmatter.name, description: frontmatter.description, path, content: text, pluginName };
}

function stableID(plugin: string, server: string): string { let hash = 2166136261; for (const char of `${plugin}\0${server}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return `agent_plugin_${plugin}_${server}_${(hash >>> 0).toString(36)}`.replace(/[^a-z0-9_]/g, "_"); }
function expand(value: string, root: string, data: string): string { return value.replaceAll("${PLUGIN_ROOT}", root).replaceAll("${PLUGIN_DATA}", data); }
function safeSuffix(value: string): boolean { return !value.replaceAll("\\", "/").split("/").some((part) => part === ".."); }
function joinPortable(root: string, suffix: string): string { return suffix ? `${root.replace(/[\\/]$/, "")}/${suffix.replace(/^\.\//, "")}` : root; }
function resolvePortableCwd(value: string, root: string, data: string): string | null {
  if (!safeSuffix(value)) return null;
  if (value === "${PLUGIN_ROOT}") return root;
  if (value.startsWith("${PLUGIN_ROOT}/")) return joinPortable(root, value.slice("${PLUGIN_ROOT}/".length));
  if (value === "${PLUGIN_DATA}") return data;
  if (value.startsWith("${PLUGIN_DATA}/")) return joinPortable(data, value.slice("${PLUGIN_DATA}/".length));
  if (value === "." || value === "./") return root;
  if (value.startsWith("./")) return joinPortable(root, value);
  return null;
}

export function parseAgentPluginMcp(text: string, pluginName: string, root = "", data = ""): { servers: MCPServerConfig[]; warnings: string[] } {
  let raw: unknown; try { raw = JSON.parse(text); } catch { throw new Error("mcp.json must be valid JSON"); }
  if (!record(raw) || raw.$schema !== AGENT_PLUGIN_MCP_SCHEMA || !record(raw.mcpServers) || Object.keys(raw).some((key) => key !== "$schema" && key !== "mcpServers")) throw new Error("mcp.json has an invalid v1.0.0 schema");
  const servers: MCPServerConfig[] = [], warnings: string[] = [];
  for (const [serverName, value] of Object.entries(raw.mcpServers)) {
    const skip = (reason: string) => warnings.push(`MCP server ${serverName} was skipped: ${reason}`);
    if (!record(value) || typeof value.type !== "string") { skip("invalid entry"); continue; }
    const common = { id: stableID(pluginName, serverName), name: `${pluginName}.${serverName}`, headers: {}, command: "", args: [], env: {}, framing: "content-length" as const, enabled: false, toolHints: [], verified: false, oauth: false, agentPlugin: { pluginName, serverName } };
    if (value.type === "streamable-http") {
      let validURL = false; if (typeof value.url === "string") try { const parsed = new URL(value.url); const loopback = parsed.hostname === "localhost" || parsed.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(parsed.hostname); validURL = !parsed.username && !parsed.password && !parsed.hash && (parsed.protocol === "https:" || (parsed.protocol === "http:" && loopback)); } catch { /* invalid */ }
      const headerEntries = record(value.headers) ? Object.entries(value.headers) : [];
      const headerKeys = headerEntries.map(([key]) => key);
      const validHeaders = value.headers === undefined || (record(value.headers) && headerEntries.every(([key, item]) => !!key && typeof item === "string") && new Set(headerKeys.map((key) => key.toLowerCase())).size === headerKeys.length);
      if (Object.keys(value).some((key) => !["type", "url", "headers"].includes(key)) || !validURL || !validHeaders) { skip("invalid streamable-http configuration"); continue; }
      servers.push({ ...common, transport: "http", url: value.url as string, headers: (value.headers ?? {}) as Record<string, string> }); continue;
    }
    if (value.type === "sse") { skip("SSE is not supported"); continue; }
    const args = value.args === undefined ? [] : value.args;
    if (value.type !== "stdio" || typeof value.command !== "string" || !value.command || value.command.includes("\\") || !Array.isArray(args) || !args.every((item) => typeof item === "string") || (value.env !== undefined && (!record(value.env) || Object.entries(value.env).some(([key, item]) => !key || key.includes("=") || key.includes("\0") || typeof item !== "string"))) || (value.cwd !== undefined && typeof value.cwd !== "string") || Object.keys(value).some((key) => !["type", "command", "args", "env", "cwd"].includes(key))) { skip("invalid stdio configuration"); continue; }
    if (record(value.env) && ("PLUGIN_ROOT" in value.env || "PLUGIN_DATA" in value.env)) { skip("reserved environment variable"); continue; }
    if (value.command.startsWith("./") && value.command.split("/").includes("..")) { skip("unsafe command path"); continue; }
    const command = value.command.startsWith("./") ? `${root}/${value.command.slice(2)}` : value.command;
    if (value.command.includes("/") && !value.command.startsWith("./")) { skip("unsafe command path"); continue; }
    const cwdRaw = typeof value.cwd === "string" ? value.cwd : "${PLUGIN_ROOT}";
    const cwd = resolvePortableCwd(cwdRaw, root, data);
    if (!cwd) { skip("unsafe cwd"); continue; }
    servers.push({ ...common, transport: "stdio", url: "", command, args: (args as string[]).map((item) => expand(item, root, data)), env: Object.fromEntries(Object.entries((value.env ?? {}) as Record<string, string>).map(([key, item]) => [key, expand(item, root, data)])), cwd, pluginRoot: root, pluginData: data });
  }
  return { servers, warnings };
}

function sameStringRecord(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value], index) => key === rightEntries[index][0] && value === rightEntries[index][1]);
}

/** Preserve user approval only while the MCP connection definition is unchanged. */
export function mergeAgentPluginMcpServer(next: MCPServerConfig, previous?: MCPServerConfig): MCPServerConfig {
  if (!previous) return next;
  const sameConnection = next.transport === previous.transport && (next.transport === "http"
    ? next.url === previous.url && sameStringRecord(next.headers, previous.headers)
    : next.command === previous.command && next.cwd === previous.cwd && next.framing === previous.framing && next.args.length === previous.args.length && next.args.every((value, index) => value === previous.args[index]) && sameStringRecord(next.env, previous.env));
  if (!sameConnection) return next;
  return { ...next, enabled: previous.enabled, verified: previous.verified, toolHints: previous.toolHints, oauth: previous.oauth, oauthClientId: previous.oauthClientId, oauthClientSecret: previous.oauthClientSecret, oauthScopes: previous.oauthScopes };
}

/** Temporarily enable verified MCP servers from an enabled Agent Plugin when
 * one of that package's Skills is active for the current chat turn. */
export function resolveAgentPluginMcpServers(
  servers: MCPServerConfig[],
  activeSkillPaths: string[],
  installs: AgentPluginInstall[],
): MCPServerConfig[] {
  const activePlugins = new Set<string>();
  for (const path of activeSkillPaths) {
    const match = path.replaceAll("\\", "/").match(/^(?:\.llm-hub\/)?agent-plugins\/([^/]+)\/skills\/[^/]+(?:\/SKILL\.md)?$/i);
    if (match) activePlugins.add(match[1]);
  }
  const enabledPlugins = new Set(installs.filter((plugin) => plugin.enabled && activePlugins.has(plugin.name)).map((plugin) => plugin.name));
  return servers.map((server) => server.enabled || !server.verified || !server.agentPlugin || !enabledPlugins.has(server.agentPlugin.pluginName)
    ? server
    : { ...server, enabled: true });
}

async function githubJSON<T>(url: string, optional = false): Promise<T | null> {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000) });
  if (optional && response.status === 404) return null;
  if (response.status === 403 || response.status === 429) throw new Error("GitHub API rate limit exceeded. Try again after the limit resets.");
  if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
  return await response.json() as T;
}
export function normalizeAgentPluginRepo(input: string): string | null { const trimmed = input.trim().replace(/\.git$/, ""); const match = trimmed.match(/^(?:https?:\/\/github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\/?$/); return match?.[1] ?? null; }

async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (cursor < items.length) { const index = cursor++; results[index] = await mapper(items[index]); } }));
  return results;
}

export async function previewAgentPlugin(input: string): Promise<AgentPluginPreview> {
  const repo = normalizeAgentPluginRepo(input); if (!repo) throw new Error("Use owner/repository or a GitHub URL.");
  const [release, repository] = await Promise.all([
    githubJSON<{ tag_name?: string }>(`https://api.github.com/repos/${repo}/releases/latest`, true),
    githubJSON<{ default_branch?: string }>(`https://api.github.com/repos/${repo}`),
  ]);
  const sourceType = release?.tag_name ? "release" as const : "branch" as const, sourceRef = release?.tag_name || repository?.default_branch || "main";
  const commit = await githubJSON<{ sha?: string }>(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(sourceRef)}`); if (!commit?.sha || !/^[0-9a-f]{40}$/i.test(commit.sha)) throw new Error("GitHub did not return a valid commit SHA.");
  const tree = await githubJSON<{ tree?: Array<{ path?: string; type?: string; mode?: string; size?: number }>; truncated?: boolean }>(`https://api.github.com/repos/${repo}/git/trees/${commit.sha}?recursive=1`);
  if (!tree?.tree || tree.truncated) throw new Error("GitHub package tree is missing or truncated.");
  const entries = tree.tree.filter((item) => item.type === "blob" && typeof item.path === "string") as Array<{ path: string; mode?: string; size?: number }>;
  const paths = entries.map((item) => item.path);
  if (entries.length > 1000 || new Set(paths).size !== paths.length || entries.some((item) => item.mode === "120000" || item.path.startsWith("/") || item.path.includes("\\") || item.path.split("/").some((part) => !part || part === "." || part === "..") || (item.size ?? 0) > 10 * 1024 * 1024) || entries.reduce((sum, item) => sum + (item.size ?? 0), 0) > 50 * 1024 * 1024) throw new Error("Package violates Agent Plugin path or size limits.");
  if (!entries.some((item) => item.path === "plugin.json")) throw new Error("plugin.json is required at the repository root.");
  let downloadedBytes = 0;
  const pairs = await mapConcurrent(entries, 10, async (item) => { const path = item.path.split("/").map(encodeURIComponent).join("/"); const response = await fetch(`https://raw.githubusercontent.com/${repo}/${commit.sha}/${path}`, { signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`Failed to download ${item.path}`); const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > 10 * 1024 * 1024) throw new Error(`Package file is too large: ${item.path}`); downloadedBytes += bytes.byteLength; return [item.path, encode(bytes)] as const; });
  if (downloadedBytes > 50 * 1024 * 1024) throw new Error("Agent Plugin package exceeds 50 MiB.");
  const files = Object.fromEntries(pairs), manifestResult = parseAgentPluginManifest(utf8.decode(decode(files["plugin.json"]))), warnings = [...manifestResult.warnings], skills: AgentPluginSkill[] = [];
  for (const [path, content] of Object.entries(files)) if (/^skills\/[^/]+\/SKILL\.md$/.test(path)) try { skills.push(parseAgentPluginSkill(path, utf8.decode(decode(content)), manifestResult.manifest.name)); } catch (error) { warnings.push(`${path} was skipped: ${error instanceof Error ? error.message : String(error)}`); }
  let mcpServers: MCPServerConfig[] = []; if (files["mcp.json"]) try { const parsed = parseAgentPluginMcp(utf8.decode(decode(files["mcp.json"])), manifestResult.manifest.name, "${PLUGIN_ROOT}", "${PLUGIN_DATA}"); mcpServers = parsed.servers; warnings.push(...parsed.warnings); } catch (error) { warnings.push(`MCP disabled: ${error instanceof Error ? error.message : String(error)}`); }
  return { manifest: manifestResult.manifest, repo, version: manifestResult.manifest.version || sourceRef, sourceType, sourceRef, commitSha: commit.sha, skills, mcpServers, warnings, files, executables: entries.filter((item) => item.mode === "100755").map((item) => item.path) };
}

export async function installAgentPluginPreview(preview: AgentPluginPreview, enabled = true): Promise<void> {
  const validSkills = new Set(preview.skills.map((skill) => skill.name)); const files = Object.fromEntries(Object.entries(preview.files).filter(([path]) => { const match = path.match(/^skills\/([^/]+)\//); return !match || validSkills.has(match[1]); }));
  const installedPaths = new Set(Object.keys(files));
  await installAgentPlugin(preview.manifest.name, files, { name: preview.manifest.name, repo: preview.repo, version: preview.version, sourceType: preview.sourceType, sourceRef: preview.sourceRef, commitSha: preview.commitSha, enabled, skillNames: preview.skills.map((skill) => skill.name), executables: preview.executables.filter((path) => installedPaths.has(path)) });
}

const installedCache = new Map<string, Promise<{ skills: AgentPluginSkill[]; mcpServers: MCPServerConfig[]; warnings: string[] }>>();
export function invalidateAgentPluginCache(): void { installedCache.clear(); }
export async function loadInstalledAgentPlugin(name: string, workspaceBase = "", revision = ""): Promise<{ skills: AgentPluginSkill[]; mcpServers: MCPServerConfig[]; warnings: string[] }> {
  const key = `${workspaceBase || revision}\0${name}`, cached = installedCache.get(key); if (cached) return await cached;
  const loading = loadInstalledAgentPluginUncached(name, workspaceBase); installedCache.set(key, loading);
  try { return await loading; } catch (error) { installedCache.delete(key); throw error; }
}
async function loadInstalledAgentPluginUncached(name: string, workspaceBase = ""): Promise<{ skills: AgentPluginSkill[]; mcpServers: MCPServerConfig[]; warnings: string[] }> {
  const files = await readAgentPluginFiles(name), byPath = new Map(files.map((file: AgentPluginFile) => [file.path, file.content])), skills: AgentPluginSkill[] = [], warnings: string[] = [];
  for (const [path, content] of byPath) if (/^skills\/[^/]+\/SKILL\.md$/.test(path)) try {
    const skill = parseAgentPluginSkill(path, utf8.decode(decode(content)), name), prefix = `skills/${skill.name}/references/`;
    skill.references = [...byPath].filter(([candidate]) => candidate.startsWith(prefix)).sort(([left], [right]) => left.localeCompare(right)).flatMap(([candidate, encoded]) => { try { return [`[${candidate.slice(`skills/${skill.name}/`.length)}]\n${utf8.decode(decode(encoded))}`]; } catch { return []; } });
    skills.push(skill);
  } catch (error) { warnings.push(`${path}: ${String(error)}`); }
  let mcpServers: MCPServerConfig[] = []; const mcp = byPath.get("mcp.json"); if (mcp) { const base = workspaceBase.replace(/[\\/]$/, ""); const root = `${base}/.llm-hub/agent-plugins/${name}`; const result = parseAgentPluginMcp(utf8.decode(decode(mcp)), name, root, `${base}/.llm-hub/agent-plugin-data/${name}`); mcpServers = result.servers; warnings.push(...result.warnings); }
  return { skills, mcpServers, warnings };
}
