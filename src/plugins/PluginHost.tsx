import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, ChevronRight, ChevronsRight, Download, Loader2, Plug, Puzzle, RefreshCw, Search, Settings, Trash2, Workflow as WorkflowIcon } from "lucide-react";
import { chat, listPluginIDs } from "../lib/wailsBackend";
import { ChatPanel } from "../llm/ChatPanel";
import type { ActiveSelection } from "../llm/selection";
import { RAGSearchPanel } from "../llm/RAGSearchPanel";
import { configuredModelOptions, selectConfiguredModel, settingsForModel, type ChatSettings } from "../llm/settings";
import { WorkflowPanel } from "../workflow/WorkflowPanel";
import { WorkflowAutomationHost } from "../workflow/WorkflowAutomationHost";
import { WorkflowPromptHost } from "../workflow/WorkflowPromptHost";
import { WorkflowMcpAppHost } from "../workflow/McpAppHost";
import { createPluginAPI } from "./api";
import { loadPlugin, readPluginManifest, unloadPlugin } from "./loader";
import type { PluginAPI, PluginConfig, PluginInstance, PluginLLMChatOptions, PluginManifest, PluginSettingsTab, PluginSlashCommand, PluginView } from "./types";
import { SkillWorkflowToolHost } from "../skills/SkillWorkflowToolHost";
import { checkPluginUpdate, installPluginRelease, PLUGIN_HOST_ID, previewPluginRelease, readPluginInstallMetadata, uninstallPluginRelease } from "./manager";
import { pluginMainViewWidgetType, registerPluginWidget, unregisterPluginWidgets } from "../dashboard/widgetRegistry";
import { normalizeDesktopPluginView, pluginViewForPath } from "./pluginViews";

const CONFIG_KEY = "llm-hub:plugins";
const SELECTED_PLUGIN_KEY = "llm-hub:selected-plugin";

function workspaceConfigKey(projectBase: string): string {
  return `${CONFIG_KEY}:${encodeURIComponent(projectBase)}`;
}

function workspaceSelectedPluginKey(projectBase: string): string {
  return `${SELECTED_PLUGIN_KEY}:${encodeURIComponent(projectBase)}`;
}

function storedConfigs(key: string): PluginConfig[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]") as PluginConfig[]; } catch { return []; }
}

function PluginMainViewWidget({ view, api, language, config }: { view: PluginView; api: PluginAPI; language: string; config: unknown }) {
  const configuredPath = config && typeof config === "object" && !Array.isArray(config) && typeof (config as { filePath?: unknown }).filePath === "string"
    ? (config as { filePath: string }).filePath
    : "";
  const filePath = configuredPath && (!view.extensions?.length || pluginViewForPath([view], configuredPath))
    ? configuredPath
    : "";
  const [fileContent, setFileContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!filePath) { setFileContent(""); return; }
    const reader = filePath.toLowerCase().startsWith("workspace://")
      ? api.files?.read(filePath)
      : api.projectFiles?.read(filePath) ?? api.files?.read(filePath);
    void reader?.then((content) => { if (!cancelled) setFileContent(content); }).catch(() => { if (!cancelled) setFileContent(""); });
    return () => { cancelled = true; };
  }, [api, filePath]);

  const Component = view.component;
  const fileName = filePath.split(/[\\/]/).pop() || undefined;
  return <Component api={api} language={language} fileId={filePath || undefined} filePath={filePath || undefined} fileName={fileName} fileContent={fileContent || undefined} />;
}

export function PluginHost({ directoryBase, projectBase, language, isDark, aiEnabled, pluginViewRequest, chatOpenRequest, settingsOpen, onCollapse, onOpenPluginView, onOpenPluginWidget, onOpenPluginSettings, chatSettings, onChatSettingsChange, activeFile, activeSelection, onOpenChatSettings, onOpenRAGSettings, onOpenDirectoryFile }: { directoryBase: string; projectBase: string; language: string; isDark: boolean; aiEnabled: boolean; pluginViewRequest: number; chatOpenRequest: number; settingsOpen: boolean; onCollapse: () => void; onOpenPluginView: () => void; onOpenPluginWidget: (request: { type: string; config: Record<string, unknown> }) => void; onOpenPluginSettings: () => void; chatSettings: ChatSettings; onChatSettingsChange: (settings: ChatSettings) => void; activeFile: { path: string; content: string } | null; activeSelection: ActiveSelection | null; onOpenChatSettings: () => void; onOpenRAGSettings: () => void; onOpenDirectoryFile: (path: string) => void }) {
  const configKey = useMemo(() => workspaceConfigKey(projectBase), [projectBase]);
  const selectedPluginKey = useMemo(() => workspaceSelectedPluginKey(projectBase), [projectBase]);
  const [configs, setConfigs] = useState<PluginConfig[]>(() => storedConfigs(configKey));
  const [manifests, setManifests] = useState<PluginManifest[]>([]);
  const [views, setViews] = useState<PluginView[]>([]);
  const [settingsTabs, setSettingsTabs] = useState<PluginSettingsTab[]>([]);
  const [slashCommands, setSlashCommands] = useState<PluginSlashCommand[]>([]);
  const [activeTab, setActiveTab] = useState("chat");
  useEffect(() => { if (chatOpenRequest > 0) setActiveTab("chat"); }, [chatOpenRequest]);
  const [selectedPluginId, setSelectedPluginId] = useState(() => localStorage.getItem(selectedPluginKey) || "");
  const [settingsPluginId, setSettingsPluginId] = useState("");
  const [settingsContainer, setSettingsContainer] = useState<HTMLElement | null>(null);
  const [chatAttachmentRequest, setChatAttachmentRequest] = useState<{ id: number; files: Array<{ path: string; content: string; rag?: boolean }> }>({ id: 0, files: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [repoInput, setRepoInput] = useState("");
  const [pluginBusy, setPluginBusy] = useState<string | null>(null);
  const [managerMessage, setManagerMessage] = useState("");
  const [pluginRefresh, setPluginRefresh] = useState(0);
  const instancesRef = useRef<PluginInstance[]>([]);
  const apiMapRef = useRef(new Map<string, PluginAPI>());
  const handledPluginViewRequestRef = useRef(0);
  const handledPluginFileRef = useRef("");
  const loadingConfigRef = useRef(false);
  const loadingSelectedPluginRef = useRef(false);

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
    loadingSelectedPluginRef.current = true;
    setSelectedPluginId(localStorage.getItem(selectedPluginKey) || "");
  }, [selectedPluginKey]);

  useEffect(() => {
    if (loadingSelectedPluginRef.current) {
      loadingSelectedPluginRef.current = false;
      return;
    }
    if (selectedPluginId) localStorage.setItem(selectedPluginKey, selectedPluginId);
    else localStorage.removeItem(selectedPluginKey);
  }, [selectedPluginId, selectedPluginKey]);

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
    unregisterPluginWidgets();
    setViews([]);
    setSettingsTabs([]);
    setSlashCommands([]);
    setErrors({});

    const callbacks = {
      onRegisterView: (view: PluginView) => {
        // Older Desktop host patches represented a companion main view as a
        // second sidebar view. Extensions distinguish it from a real sidebar
        // panel, so normalize it into the Dashboard widget path.
        const registeredView = normalizeDesktopPluginView(view);
        registeredViews.push(registeredView);
        if (registeredView.location === "main") {
          const api = apiMapRef.current.get(registeredView.pluginId);
          if (api) {
            registerPluginWidget(registeredView.pluginId, {
              type: pluginMainViewWidgetType(registeredView.id),
              label: registeredView.name,
              defaultConfig: { filePath: "" },
              defaultSize: { w: 12, h: 7 },
              extensions: registeredView.extensions,
              filePathOf: (config) => config && typeof config === "object" && !Array.isArray(config) && typeof (config as { filePath?: unknown }).filePath === "string"
                ? (config as { filePath: string }).filePath
                : undefined,
              render: (config) => <PluginMainViewWidget view={registeredView} api={api} language={language} config={config} />,
            });
          }
        }
        if (!cancelled) setViews([...registeredViews]);
      },
      onRegisterSettingsTab: (tab: PluginSettingsTab) => { registeredSettings.push(tab); if (!cancelled) setSettingsTabs([...registeredSettings]); },
      onRegisterSlashCommand: (command: PluginSlashCommand) => { registeredCommands.push(command); if (!cancelled) setSlashCommands([...registeredCommands]); },
      onLLMListModels: async () => configuredModelOptions(chatSettings).map((option) => ({
        id: option.key,
        label: option.label,
        provider: option.provider,
        model: option.model || option.cliType || "",
      })),
      onLLMChat: async (
        messages: Array<{ role: string; content: string }>,
        options?: PluginLLMChatOptions,
      ) => {
        const modelId = options?.modelId || "";
        const knownModelId = configuredModelOptions(chatSettings).some((option) => option.key === modelId);
        const selectedSettings = knownModelId
          ? selectConfiguredModel(chatSettings, modelId)
          : options?.model
          ? settingsForModel(chatSettings, options.model)
          : chatSettings;
        const result = await chat({ provider: selectedSettings.provider, endpoint: selectedSettings.endpoint, apiKey: selectedSettings.apiKey, model: selectedSettings.provider === "cli" ? "" : selectedSettings.model, vertexProjectId: selectedSettings.vertexProjectId, vertexLocation: selectedSettings.vertexLocation, systemPrompt: options?.systemPrompt || selectedSettings.systemPrompt, messages: messages.filter((item) => item.role === "user" || item.role === "assistant").map((item) => ({ role: item.role as "user" | "assistant", content: item.content })), enableFileTools: false, fileToolMode: "none", cliType: selectedSettings.cliType, cliPath: selectedSettings.cliPaths[selectedSettings.cliType], cliSessionId: "" });
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
  const mainViews = views.filter((view) => view.location === "main");
  const pluginChoices = useMemo(() => {
    const ids = [...new Set(views.map((view) => view.pluginId))];
    return ids.map((pluginId) => ({
      pluginId,
      name: manifests.find((manifest) => manifest.id === pluginId)?.name
        || views.find((view) => view.pluginId === pluginId && view.location === "sidebar")?.name
        || views.find((view) => view.pluginId === pluginId && view.location === "main")?.name
        || pluginId,
    }));
  }, [manifests, views]);
  const activePluginId = pluginChoices.some((choice) => choice.pluginId === selectedPluginId)
    ? selectedPluginId
    : pluginChoices[0]?.pluginId || "";
  const activeView = sidebarViews.find((view) => view.pluginId === activePluginId);
  const activeApi = activePluginId ? apiMapRef.current.get(activePluginId) : null;
  const ActiveViewComponent = activeView?.component;
  const activePluginMainView = mainViews.find((view) => view.pluginId === activePluginId);
  const activeFileMatchesPlugin = !!activeFile?.path && !!activePluginMainView
    && (!activePluginMainView.extensions?.length || !!pluginViewForPath([activePluginMainView], activeFile.path));

  const activatePlugin = (pluginId: string) => {
    if (!pluginId) return;
    setSelectedPluginId(pluginId);
    setActiveTab("plugins");
    const mainView = mainViews.find((view) => view.pluginId === pluginId);
    if (mainView) {
      const activePath = activeFile?.path || "";
      const matchesActiveFile = !mainView.extensions?.length
        || mainView.extensions.some((extension) => activePath.toLowerCase().endsWith(extension.toLowerCase()));
      // Match GemiHub Web: a companion main view is not activated while the
      // current file has an extension the plugin did not request.
      if (!activePath || matchesActiveFile) {
        onOpenPluginWidget({
          type: pluginMainViewWidgetType(mainView.id),
          config: activePath ? { filePath: activePath } : {},
        });
      }
    }
  };

  useEffect(() => {
    const path = activeFile?.path || "";
    const view = pluginViewForPath(mainViews, path);
    if (!view) {
      handledPluginFileRef.current = "";
      return;
    }
    const requestKey = `${view.id}\n${path}`;
    if (handledPluginFileRef.current === requestKey) return;
    handledPluginFileRef.current = requestKey;
    setSelectedPluginId(view.pluginId);
    setActiveTab("plugins");
    onOpenPluginWidget({
      type: pluginMainViewWidgetType(view.id),
      config: { filePath: path },
    });
  }, [activeFile?.path, mainViews, onOpenPluginWidget]);

  useEffect(() => {
    if (pluginViewRequest <= handledPluginViewRequestRef.current) return;
    const target = activePluginId || pluginChoices[0]?.pluginId;
    if (!target) return;
    handledPluginViewRequestRef.current = pluginViewRequest;
    activatePlugin(target);
  }, [activePluginId, pluginChoices, pluginViewRequest]);

  const tabs = useMemo(() => [
    ...(aiEnabled ? [
      { id: "chat", name: "Chat", icon: Bot },
      { id: "rag-search", name: "RAG Search", icon: Search },
      { id: "workflow", name: "Workflow", icon: WorkflowIcon },
    ] : []),
    ...(pluginChoices.length ? [{ id: "plugins", name: "Plugins", icon: Puzzle }] : []),
  ], [aiEnabled, pluginChoices.length]);

  useEffect(() => {
    if (!aiEnabled && ["chat", "rag-search", "workflow"].includes(activeTab)) {
      setActiveTab(pluginChoices.length ? "plugins" : "");
    }
  }, [activeTab, aiEnabled, pluginChoices.length]);

  const togglePlugin = (manifest: PluginManifest) => {
    setConfigs((current) => {
      const existing = current.find((item) => item.id === manifest.id);
      if (existing) return current.map((item) => item.id === manifest.id ? { ...item, enabled: !item.enabled, version: manifest.version } : item);
      return [...current, { id: manifest.id, enabled: true, version: manifest.version, source: "local" }];
    });
  };

  const openPluginView = (pluginId: string) => {
    if (!pluginChoices.some((choice) => choice.pluginId === pluginId)) return;
    activatePlugin(pluginId);
    onOpenPluginView();
  };

  const openPluginSettings = (pluginId: string) => {
    setSettingsPluginId(pluginId);
    onOpenPluginSettings();
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
          return <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => tab.id === "plugins" ? activatePlugin(activePluginId) : setActiveTab(tab.id)} title={tab.name}><Icon size={17} /></button>;
        })}
      </header>

      <div className="plugin-host-body">
        {aiEnabled && activeTab === "chat" ? (
          <ChatPanel isDark={isDark} directoryBase={directoryBase} projectBase={projectBase} settings={chatSettings} onSettingsChange={onChatSettingsChange} activeFile={activeFile} activeSelection={activeSelection} externalAttachments={chatAttachmentRequest} pluginCommands={slashCommands} onOpenSettings={onOpenChatSettings} onOpenFile={onOpenDirectoryFile} onOpenWorkflow={(path) => { onOpenDirectoryFile(path); setActiveTab("workflow"); }} />
        ) : aiEnabled && activeTab === "rag-search" ? (
          <RAGSearchPanel directoryBase={directoryBase} settings={chatSettings} onSettingsChange={onChatSettingsChange} onOpenSettings={onOpenRAGSettings} onOpenFile={onOpenDirectoryFile} onChatWithResults={(files) => { setChatAttachmentRequest((current) => ({ id: current.id + 1, files })); setActiveTab("chat"); }} />
        ) : aiEnabled && activeTab === "workflow" ? (
          <WorkflowPanel directoryBase={projectBase} settings={chatSettings} activeFile={activeFile} onOpenFile={onOpenDirectoryFile} />
        ) : activeTab === "plugins" && activePluginId ? (
          <section className="plugin-sidebar-view">
            <header>
              <select value={activePluginId} onChange={(event) => activatePlugin(event.target.value)} aria-label="Plugin view">
                {pluginChoices.map((choice) => <option key={choice.pluginId} value={choice.pluginId}>{choice.name}</option>)}
              </select>
              <button type="button" disabled={!settingsTabs.some((tab) => tab.pluginId === activePluginId)} onClick={() => openPluginSettings(activePluginId)} title="Plugin settings"><Settings size={15} /></button>
            </header>
            <div className="plugin-sidebar-view-body">
              {ActiveViewComponent && activeApi
                ? <ActiveViewComponent
                    api={activeApi}
                    language={language}
                    fileId={activeFile?.path}
                    filePath={activeFile?.path}
                    fileName={activeFile?.path.split(/[\\/]/).pop()}
                    fileContent={activeFileMatchesPlugin ? activeFile?.content || undefined : undefined}
                  />
                : <section className="chat-placeholder"><Puzzle size={24} /><span>The plugin view is open in the Dashboard.</span></section>}
            </div>
          </section>
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
              const hasView = pluginChoices.some((choice) => choice.pluginId === manifest.id);
              const settingsTab = settingsTabs.find((tab) => tab.pluginId === manifest.id);
              const SettingsComponent = settingsTab?.component;
              const settingsApi = apiMapRef.current.get(manifest.id);
              return (
                <article key={manifest.id} className={settingsPluginId === manifest.id ? "plugin-manager-selected" : ""}>
                  <button type="button" className="plugin-manager-open" disabled={!enabled || !hasView} onClick={() => openPluginView(manifest.id)}><span><strong>{manifest.name}</strong><small>{manifest.description || manifest.id} · {manifest.version}</small></span>{hasView && <ChevronRight size={16} />}</button>
                  <label className="plugin-toggle"><input type="checkbox" checked={enabled} onChange={() => togglePlugin(manifest)} /><span /></label>
                  {(managed || SettingsComponent) && <div className="plugin-manager-actions">{SettingsComponent && <button type="button" title="Plugin settings" disabled={!enabled} onClick={() => setSettingsPluginId((current) => current === manifest.id ? "" : manifest.id)}><Settings size={13} /></button>}{managed && <><button type="button" title="Check for updates" disabled={!!pluginBusy} onClick={() => void updateFromGitHub(config)}>{pluginBusy === config.id ? <Loader2 className="spin" size={13} /> : <RefreshCw size={13} />}</button><button type="button" title="Uninstall" disabled={!!pluginBusy} onClick={() => void uninstallGitHubPlugin(config)}><Trash2 size={13} /></button></>}</div>}
                  {errors[manifest.id] && <em>{errors[manifest.id]}</em>}
                  {settingsPluginId === manifest.id && SettingsComponent && settingsApi && <div className="plugin-manager-settings"><SettingsComponent api={settingsApi} language={language} /></div>}
                </article>
              );
            })}
          </section>,
          settingsContainer,
        )}
    </>
  );
}
