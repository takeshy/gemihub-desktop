import { useEffect, useState } from "react";
import { Check, Download, Loader2, Power, PowerOff, RefreshCw, Trash2, X } from "lucide-react";
import { listAgentPlugins, setAgentPluginEnabled, uninstallAgentPlugin, type AgentPluginInstall } from "../lib/wailsBackend";
import { installAgentPluginPreview, invalidateAgentPluginCache, loadInstalledAgentPlugin, mergeAgentPluginMcpServer, previewAgentPlugin, type AgentPluginPreview } from "./manager";
import { McpHttpClient } from "../mcp/httpClient";
import { McpStdioClient } from "../mcp/stdioClient";
import type { MCPServerConfig } from "../llm/settings";

export function AgentPluginsSection({ workspaceBase, mcpServers, onChanged, onMcpServersTested }: { workspaceBase: string; mcpServers: MCPServerConfig[]; onChanged: () => void; onMcpServersTested: (pluginName: string, servers: MCPServerConfig[]) => void }) {
  const [plugins, setPlugins] = useState<AgentPluginInstall[]>([]), [repo, setRepo] = useState(""), [preview, setPreview] = useState<AgentPluginPreview | null>(null), [updateTarget, setUpdateTarget] = useState<AgentPluginInstall | null>(null), [busy, setBusy] = useState(""), [message, setMessage] = useState("");
  const changed = () => { invalidateAgentPluginCache(); onChanged(); };
  const reload = async () => setPlugins(await listAgentPlugins());
  useEffect(() => { if (workspaceBase) void reload(); else setPlugins([]); }, [workspaceBase]);
  const inspect = async (input = repo) => { setBusy("preview"); setMessage(""); setUpdateTarget(null); try { setPreview(await previewAgentPlugin(input)); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(""); } };
  const install = async () => { if (!preview) return; setBusy("install"); setMessage(""); try {
    if (updateTarget && (preview.manifest.name !== updateTarget.name || preview.repo !== updateTarget.repo)) throw new Error(`Update package does not match installed Agent Plugin ${updateTarget.name}.`);
    await installAgentPluginPreview(preview, updateTarget?.enabled ?? true);
    invalidateAgentPluginCache();
    const installed = await loadInstalledAgentPlugin(preview.manifest.name, workspaceBase, preview.commitSha);
    const previous = new Map(mcpServers.filter((server) => server.agentPlugin?.pluginName === preview.manifest.name).map((server) => [server.agentPlugin!.serverName, server]));
    const tested: MCPServerConfig[] = [];
    const results: string[] = [];
    for (const discovered of installed.mcpServers) {
      const server = mergeAgentPluginMcpServer(discovered, previous.get(discovered.agentPlugin!.serverName));
      setMessage(`Installed ${preview.manifest.name}. Testing ${server.name}…`);
      const client = server.transport === "stdio" ? new McpStdioClient(server) : new McpHttpClient({ ...server, transport: "http" });
      try {
        const tools = await client.listTools();
        tested.push({ ...server, enabled: false, verified: true, toolHints: tools.map((tool) => tool.name) });
        results.push(`${server.name}: connected (${tools.length} tools)`);
      } catch (error) {
        tested.push({ ...server, enabled: false, verified: false, toolHints: [] });
        results.push(`${server.name}: failed (${error instanceof Error ? error.message : String(error)})`);
      } finally { await client.close().catch(() => undefined); }
    }
    onMcpServersTested(preview.manifest.name, tested);
    setPreview(null); setUpdateTarget(null); setRepo("");
    const summary = tested.length ? ` MCP test: ${tested.filter((server) => server.verified).length}/${tested.length} connected. ${results.join(" · ")}` : "";
    setMessage(`Installed ${preview.manifest.name}.${summary} ${[...preview.warnings, ...installed.warnings].join(" ")}`.trim());
    await reload(); changed();
  } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(""); } };
  const toggle = async (plugin: AgentPluginInstall) => { setBusy(plugin.name); try { await setAgentPluginEnabled(plugin.name, !plugin.enabled); await reload(); changed(); } catch (error) { setMessage(String(error)); } finally { setBusy(""); } };
  const remove = async (plugin: AgentPluginInstall) => { if (!window.confirm(`Uninstall ${plugin.name}? Package-managed Skills and MCP servers will be removed.`)) return; setBusy(plugin.name); try { await uninstallAgentPlugin(plugin.name); await reload(); changed(); } catch (error) { setMessage(String(error)); } finally { setBusy(""); } };
  const update = async (plugin: AgentPluginInstall) => { setBusy(plugin.name); setMessage(""); try { const next = await previewAgentPlugin(plugin.repo); if (next.manifest.name !== plugin.name) throw new Error(`Update manifest name mismatch: expected ${plugin.name}, got ${next.manifest.name}.`); if (next.commitSha === plugin.commitSha) { setMessage(`${plugin.name} is up to date.`); return; } setUpdateTarget(plugin); setPreview(next); setMessage(`Update available: ${next.version} (${next.commitSha.slice(0, 7)}). Review and install below.`); } catch (error) { setMessage(String(error)); } finally { setBusy(""); } };
  return <section className="agent-plugin-manager">
    <header><div><strong>Agent Plugins</strong><small>Portable Agent Skills and MCP servers · v1.0.0</small></div></header>
    <form className="plugin-install" onSubmit={(event) => { event.preventDefault(); void inspect(); }}><input value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="owner/repository or GitHub URL" aria-label="Agent Plugin repository" disabled={!!busy} /><button disabled={!repo.trim() || !!busy}>{busy === "preview" ? <Loader2 className="spin" size={14} /> : <Download size={14} />} Preview</button></form>
    {message && <p className="plugin-manager-message">{message}</p>}
    {preview && <article className="agent-plugin-preview"><button type="button" className="agent-plugin-preview-close" onClick={() => { setPreview(null); setUpdateTarget(null); }}><X size={14} /></button><strong>{preview.manifest.name} · {preview.version}</strong><small>{preview.sourceType}: {preview.sourceRef} · {preview.commitSha.slice(0, 7)}</small><p>{preview.manifest.description}</p><small>Skills: {preview.skills.map((item) => item.name).join(", ") || "none"}</small><strong className="agent-plugin-component-title">MCP servers (tested during install; left disabled)</strong>{preview.mcpServers.length ? preview.mcpServers.map((server) => <code key={server.id}>{server.transport === "stdio" ? `${server.name}: ${server.command} ${server.args.join(" ")}` : `${server.name}: ${server.url}`}</code>) : <small>none</small>}{preview.warnings.map((warning) => <small key={warning} className="agent-plugin-warning">{warning}</small>)}<button type="button" onClick={() => void install()} disabled={!!busy}>{busy === "install" ? <Loader2 className="spin" size={14} /> : <Check size={14} />} {preview.mcpServers.length ? "Test MCP and install" : "Install pinned package"}</button></article>}
    {plugins.map((plugin) => <article key={plugin.name}><span><strong>{plugin.name}</strong><small>{plugin.version} · {plugin.repo} · {plugin.commitSha.slice(0, 7)}</small><small>{plugin.skillNames.length} Skill(s)</small></span><div className="plugin-manager-actions"><button type="button" title={plugin.enabled ? "Disable" : "Enable"} onClick={() => void toggle(plugin)} disabled={!!busy}>{plugin.enabled ? <Power size={13} /> : <PowerOff size={13} />}</button><button type="button" title="Check for updates" onClick={() => void update(plugin)} disabled={!!busy}>{busy === plugin.name ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}</button><button type="button" title="Uninstall" onClick={() => void remove(plugin)} disabled={!!busy}><Trash2 size={13} /></button></div></article>)}
  </section>;
}
