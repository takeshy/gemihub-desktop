import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, ChevronRight, ChevronsRight, Download, Loader2, Plug, Puzzle, RefreshCw, Search, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { chat, listPluginIDs } from "../lib/wailsBackend";
import { ChatPanel } from "../llm/ChatPanel";
import type { ActiveSelection } from "../llm/selection";
import { RAGSearchPanel } from "../llm/RAGSearchPanel";
import type { ChatSettings } from "../llm/settings";
import { WorkflowPanel } from "../workflow/WorkflowPanel";
import { WorkflowAutomationHost } from "../workflow/WorkflowAutomationHost";
import { WorkflowPromptHost } from "../workflow/WorkflowPromptHost";
import { WorkflowMcpAppHost } from "../workflow/McpAppHost";
import { createPluginAPI } from "./api";
import { loadPlugin, readPluginManifest, unloadPlugin } from "./loader";
import type { PluginAPI, PluginConfig, PluginInstance, PluginManifest, PluginSettingsTab, PluginSlashCommand, PluginView } from "./types";
import { SkillWorkflowToolHost } from "../skills/SkillWorkflowToolHost";
import { checkPluginUpdate, installPluginRelease, PLUGIN_HOST_ID, previewPluginRelease, readPluginInstallMetadata, uninstallPluginRelease } from "./manager";

const CONFIG_KEY = "llm-hub:plugins";

function workspaceConfigKey(projectBase: string): string {
  return `${CONFIG_KEY}:${encodeURIComponent(projectBase)}`;
}

function storedConfigs(key: string): PluginConfig[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]") as PluginConfig[]; } catch { return []; }
}

export function PluginHost({ directoryBase, projectBase, language, isDark, aiEnabled, pluginViewRequest, settingsOpen, onCollapse, onOpenPluginView, chatSettings, onChatSettingsChange, activeFile, activeSelection, onOpenChatSettings, onOpenRAGSettings, onOpenDirectoryFile }: { directoryBase: string; projectBase: string; language: string; isDark: boolean; aiEnabled: boolean; pluginViewRequest: number; settingsOpen: boolean; onCollapse: () => void; onOpenPluginView: () => void; chatSettings: ChatSettings; onChatSettingsChange: (settings: ChatSettings) => void; activeFile: { path: string; content: string } | null; activeSelection: ActiveSelection | null; onOpenChatSettings: () => void; onOpenRAGSettings: () => void; onOpenDirectoryFile: (path: string) => void }) {
  const configKey = useMemo(() => workspaceConfigKey(projectBase), [projectBase]);
  const [configs, setConfigs] = useState<PluginConfig[]>(() => storedConfigs(configKey));
  const [manifests, setManifests] = useState<PluginManifest[]>([]);
  const [views, setViews] = useState<PluginView[]>([]);
  const [settingsTabs, setSettingsTabs] = useState<PluginSettingsTab[]>([]);
  const [slashCommands, setSlashCommands] = useState<PluginSlashCommand[]>([]);
  const [activeTab, setActiveTab] = useState("chat");
  const [settingsContainer, setSettingsContainer] = useState<HTMLElement | null>(null);
  const [chatAttachmentRequest, setChatAttachmentRequest] = useState<{ id: number; files: Array<{ path: string; content: string }> }>({ id: 0, files: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [repoInput, setRepoInput] = useState("");
  const [pluginBusy, setPluginBusy] = useState<string | null>(null);
  const [managerMessage, setManagerMessage] = useState("");
  const [pluginRefresh, setPluginRefresh] = useState(0);
  const instancesRef = useRef<PluginInstance[]>([]);
  const apiMapRef = useRef(new Map<string, PluginAPI>());
  const handledPluginViewRequestRef = useRef(0);
  const loadingConfigRef = useRef(false);

  useEffect(() => {
    setSettingsContainer(settingsOpen ? document.getElementById("plugin-settings-manager") : null);
  }, [settingsOpen]);

  useEffect(() => {
    loadingConfigRef.current = true;
    setConfigs(storedConfigs(configKey));
  }, [configKey]);

  useEffect(() => {
    if (loadingConfigRef.current) {
      loadingConfigRef.current = false;
      return;
    }
    localStorage.setItem(configKey, JSON.stringify(configs));
  }, [configKey, configs]);

  useEffect(() => {
    let cancelled = false;
    if (!projectBase) {
      setManifests([]);
      return;
    }
    void (async () => {
      const ids = await listPluginIDs();
      const loaded = await Promise.all(ids.map(async (id) => {
        try { return { manifest: await readPluginManifest(id), install: await readPluginInstallMetadata(id) }; } catch { return null; }
      }));
      if (!cancelled) {
        const valid = loaded.filter((item): item is NonNullable<typeof item> => !!item);
        setManifests(valid.map((item) => item.manifest));
        setConfigs((current) => {
          let next = current.filter((config) => ids.includes(config.id));
          for (const item of valid) {
            if (!item.install) continue;
            const existing = next.find((config) => config.id === item.manifest.id);
            const managed: PluginConfig = {
              id: item.manifest.id, enabled: existing?.enabled ?? true, version: item.manifest.version,
              source: "github", repo: item.install.repo, releaseTag: item.install.releaseTag,
              permissions: item.manifest.permissions,
            };
            next = existing ? next.map((config) => config.id === managed.id ? managed : config) : [...next, managed];
          }
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [pluginRefresh, projectBase]);

  useEffect(() => {
    let cancelled = false;
    const registeredViews: PluginView[] = [];
    const registeredSettings: PluginSettingsTab[] = [];
    const registeredCommands: PluginSlashCommand[] = [];
    const instances: PluginInstance[] = [];
    apiMapRef.current.clear();
    setViews([]);
    setSettingsTabs([]);
    setSlashCommands([]);
    setErrors({});

    const callbacks = {
      onRegisterView: (view: PluginView) => { registeredViews.push(view); if (!cancelled) setViews([...registeredViews]); },
      onRegisterSettingsTab: (tab: PluginSettingsTab) => { registeredSettings.push(tab); if (!cancelled) setSettingsTabs([...registeredSettings]); },
      onRegisterSlashCommand: (command: PluginSlashCommand) => { registeredCommands.push(command); if (!cancelled) setSlashCommands([...registeredCommands]); },
      onLLMChat: async (messages: Array<{ role: string; content: string }>, options?: { model?: string; systemPrompt?: string }) => {
        const result = await chat({ provider: chatSettings.provider, endpoint: chatSettings.endpoint, apiKey: chatSettings.apiKey, model: options?.model || chatSettings.model, vertexProjectId: chatSettings.vertexProjectId, vertexLocation: chatSettings.vertexLocation, systemPrompt: options?.systemPrompt || chatSettings.systemPrompt, messages: messages.filter((item) => item.role === "user" || item.role === "assistant").map((item) => ({ role: item.role as "user" | "assistant", content: item.content })), enableFileTools: false, fileToolMode: "none", cliType: chatSettings.cliType, cliPath: chatSettings.cliPaths[chatSettings.cliType], cliSessionId: "" });
        return result.content;
      },
    };

    void (async () => {
      for (const manifest of manifests) {
        const config = configs.find((item) => item.id === manifest.id);
        if (!config?.enabled) continue;
        try {
          const api = createPluginAPI(manifest.id, language, manifest.permissions, callbacks);
          apiMapRef.current.set(manifest.id, api);
          const loaded = await loadPlugin({ ...config, version: manifest.version, source: "local" }, api);
          if (cancelled) {
            await unloadPlugin(loaded);
            return;
          }
          instances.push(loaded);
        } catch (error) {
          if (!cancelled) setErrors((current) => ({ ...current, [manifest.id]: error instanceof Error ? error.message : String(error) }));
        }
      }
      if (!cancelled) instancesRef.current = instances;
    })();

    return () => {
      cancelled = true;
      const loaded = instancesRef.current;
      instancesRef.current = [];
      for (const plugin of loaded) void unloadPlugin(plugin);
    };
  }, [chatSettings, configs, language, manifests]);

  const sidebarViews = views.filter((view) => view.location === "sidebar");
  const activeView = sidebarViews.find((view) => view.id === activeTab);
  const activeApi = activeView ? apiMapRef.current.get(activeView.pluginId) : null;
  const ActiveViewComponent = activeView?.component;

  useEffect(() => {
    if (pluginViewRequest <= handledPluginViewRequestRef.current) return;
    const target = activeView || sidebarViews[0];
    if (!target) return;
    handledPluginViewRequestRef.current = pluginViewRequest;
    setActiveTab(target.id);
  }, [activeView, pluginViewRequest, sidebarViews]);

  const tabs = useMemo(() => [
    ...(aiEnabled ? [
      { id: "chat", name: "Chat", icon: Bot },
      { id: "rag-search", name: "RAG Search", icon: Search },
      { id: "workflow", name: "Workflow", icon: WorkflowIcon },
    ] : []),
    ...sidebarViews.map((view) => ({ id: view.id, name: view.name, icon: Puzzle })),
  ], [aiEnabled, sidebarViews]);

  useEffect(() => {
    if (!aiEnabled && ["chat", "rag-search", "workflow"].includes(activeTab)) {
      setActiveTab(sidebarViews[0]?.id || "");
    }
  }, [activeTab, aiEnabled, sidebarViews]);

  const togglePlugin = (manifest: PluginManifest) => {
    setConfigs((current) => {
      const existing = current.find((item) => item.id === manifest.id);
      if (existing) return current.map((item) => item.id === manifest.id ? { ...item, enabled: !item.enabled, version: manifest.version } : item);
      return [...current, { id: manifest.id, enabled: true, version: manifest.version, source: "local" }];
    });
  };

  const openPluginView = (pluginId: string) => {
    const view = sidebarViews.find((item) => item.pluginId === pluginId);
    if (!view) return;
    setActiveTab(view.id);
    onOpenPluginView();
  };

  const installFromGitHub = async () => {
    if (!repoInput.trim()) return;
    setPluginBusy("install"); setManagerMessage("");
    try {
      const preview = await previewPluginRelease(repoInput);
      const permissions = preview.manifest.permissions?.join(", ") || "none";
      const patches = (preview.manifest.hostPatches?.[PLUGIN_HOST_ID] || preview.manifest.hostPatches?.["llm-hub-workspace"])?.join(", ") || "none";
      const existing = configs.find((config) => config.id === preview.manifest.id);
      if (existing && (existing.source !== "github" || existing.repo !== preview.repo)) throw new Error(`Plugin id ${preview.manifest.id} is already installed from another source.`);
      if (!window.confirm(`Install ${preview.manifest.name} ${preview.manifest.version}?\nPermissions: ${permissions}\nWorkspace patches: ${patches}`)) return;
      const installed = await installPluginRelease(preview.repo, existing?.id, preview);
      setConfigs((current) => [...current.filter((config) => config.id !== installed.config.id), installed.config]);
      setRepoInput(""); setManagerMessage(`Installed ${preview.manifest.name} ${preview.manifest.version}.`);
      setPluginRefresh((value) => value + 1);
    } catch (error) { setManagerMessage(error instanceof Error ? error.message : String(error)); }
    finally { setPluginBusy(null); }
  };

  const updateFromGitHub = async (config: PluginConfig) => {
    if (!config.repo) return;
    setPluginBusy(config.id); setManagerMessage("");
    try {
      const preview = await checkPluginUpdate(config);
      if (!preview) { setManagerMessage(`${config.id} is up to date.`); return; }
      const oldPermissions = new Set(config.permissions ?? []);
      const added = (preview.manifest.permissions ?? []).filter((permission) => !oldPermissions.has(permission));
      const detail = added.length ? `\nNew permissions: ${added.join(", ")}` : "";
      if (!window.confirm(`Update ${preview.manifest.name} from ${config.version} to ${preview.manifest.version}?${detail}`)) return;
      const installed = await installPluginRelease(config.repo, config.id, preview);
      setConfigs((current) => current.map((item) => item.id === config.id ? { ...installed.config, enabled: item.enabled } : item));
      setManagerMessage(`Updated ${preview.manifest.name} to ${preview.manifest.version}.`);
      setPluginRefresh((value) => value + 1);
    } catch (error) { setManagerMessage(error instanceof Error ? error.message : String(error)); }
    finally { setPluginBusy(null); }
  };

  const uninstallGitHubPlugin = async (config: PluginConfig) => {
    if (!window.confirm(`Uninstall ${config.id} and its cached assets and plugin data?`)) return;
    setPluginBusy(config.id); setManagerMessage("");
    try {
      await uninstallPluginRelease(config.id);
      setConfigs((current) => current.filter((item) => item.id !== config.id));
      setManagerMessage(`Uninstalled ${config.id}.`);
      setPluginRefresh((value) => value + 1);
    } catch (error) { setManagerMessage(error instanceof Error ? error.message : String(error)); }
    finally { setPluginBusy(null); }
  };

  return (
    <>
    {aiEnabled && <>
      <WorkflowPromptHost />
      <WorkflowMcpAppHost />
      <WorkflowAutomationHost directoryBase={projectBase} settings={chatSettings} activeFile={activeFile} onOpenFile={onOpenDirectoryFile} />
      <SkillWorkflowToolHost directoryBase={projectBase} settings={chatSettings} activeFile={activeFile} />
    </>}
    <aside className="plugin-host">
      <header className="plugin-host-tabs">
        <button type="button" onClick={onCollapse} title={aiEnabled ? "Collapse ChatView" : "Collapse Plugin view"}><ChevronsRight size={17} /></button>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)} title={tab.name}><Icon size={17} /></button>;
        })}
      </header>

      <div className="plugin-host-body">
        {aiEnabled && activeTab === "chat" ? (
          <ChatPanel isDark={isDark} directoryBase={directoryBase} projectBase={projectBase} settings={chatSettings} onSettingsChange={onChatSettingsChange} activeFile={activeFile} activeSelection={activeSelection} externalAttachments={chatAttachmentRequest} pluginCommands={slashCommands} onOpenSettings={onOpenChatSettings} onOpenFile={onOpenDirectoryFile} onOpenWorkflow={(path) => { onOpenDirectoryFile(path); setActiveTab("workflow"); }} />
        ) : aiEnabled && activeTab === "rag-search" ? (
          <RAGSearchPanel directoryBase={directoryBase} settings={chatSettings} onSettingsChange={onChatSettingsChange} onOpenSettings={onOpenRAGSettings} onOpenFile={onOpenDirectoryFile} onChatWithResults={(results) => { setChatAttachmentRequest((current) => ({ id: current.id + 1, files: results.map((result, index) => ({ path: `[RAG] ${result.filePath}#chunk-${result.chunkIndex}-${index + 1}`, content: result.text })) })); setActiveTab("chat"); }} />
        ) : aiEnabled && activeTab === "workflow" ? (
          <WorkflowPanel directoryBase={projectBase} settings={chatSettings} activeFile={activeFile} onOpenFile={onOpenDirectoryFile} />
        ) : ActiveViewComponent && activeApi ? (
          <ActiveViewComponent api={activeApi} language={language} />
        ) : (
          <section className="chat-placeholder"><Plug size={24} /><span>Select a plugin view.</span></section>
        )}
      </div>
    </aside>
    {settingsContainer && createPortal(
          <section className="plugin-manager settings-plugin-manager">
            <header><div><strong>Plugins</strong><small>GemiHub-compatible Workspace extensions</small></div></header>
            {!projectBase && <p>Select a Workspace directory to discover `.llm-hub/plugins`.</p>}
            {projectBase && <form className="plugin-install" onSubmit={(event) => { event.preventDefault(); void installFromGitHub(); }}><input value={repoInput} onChange={(event) => setRepoInput(event.target.value)} placeholder="owner/repository or GitHub URL" aria-label="GitHub plugin repository" disabled={!!pluginBusy} /><button type="submit" disabled={!repoInput.trim() || !!pluginBusy}>{pluginBusy === "install" ? <Loader2 className="spin" size={14} /> : <Download size={14} />} Install</button></form>}
            {managerMessage && <p className="plugin-manager-message">{managerMessage}</p>}
            {manifests.map((manifest) => {
              const config = configs.find((item) => item.id === manifest.id);
              const enabled = !!config?.enabled;
              const managed = config?.source === "github";
              const hasView = sidebarViews.some((view) => view.pluginId === manifest.id);
              return (
                <article key={manifest.id}>
                  <button type="button" className="plugin-manager-open" disabled={!enabled || !hasView} onClick={() => openPluginView(manifest.id)}><span><strong>{manifest.name}</strong><small>{manifest.description || manifest.id} · {manifest.version}</small></span>{hasView && <ChevronRight size={16} />}</button>
                  <label className="plugin-toggle"><input type="checkbox" checked={enabled} onChange={() => togglePlugin(manifest)} /><span /></label>
                  {managed && <div className="plugin-manager-actions"><button type="button" title="Check for updates" disabled={!!pluginBusy} onClick={() => void updateFromGitHub(config)}>{pluginBusy === config.id ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}</button><button type="button" title="Uninstall" disabled={!!pluginBusy} onClick={() => void uninstallGitHubPlugin(config)}><Trash2 size={13} /></button></div>}
                  {errors[manifest.id] && <em>{errors[manifest.id]}</em>}
                </article>
              );
            })}
            {settingsTabs.map((tab) => {
              const SettingsComponent = tab.component;
              const api = apiMapRef.current.get(tab.pluginId);
              return api ? <SettingsComponent key={tab.pluginId} api={api} language={language} /> : null;
            })}
          </section>,
          settingsContainer,
        )}
    </>
  );
}
