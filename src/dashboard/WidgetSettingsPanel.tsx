import { useEffect, useMemo, useRef, useState } from "react";
import {
  Code,
  Database,
  FileText,
  LayoutGrid,
  Pencil,
  PenLine,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { chat, fileInventory, readFile, writeFile } from "../lib/wailsBackend";
import yaml from "js-yaml";
import type { DashboardWidget } from "./types";
import { dashboardWidgetDefinition } from "./widgetRegistry";
import { isWorkflowFilePath } from "../workflow/parser";
import {
  canonicalWorkflowPath,
  replaceWorkflowDefinition,
  workflowNameFromFilePath,
  workflowYamlFromContent,
} from "../workflow/parser";
import { AIWorkflowBuilderModal } from "../workflow/AIWorkflowBuilderModal";
import { loadWorkflowHistory } from "../workflow/history";
import type { ChatSettings } from "../llm/settings";
import type { WorkflowRun } from "../workflow/types";
import { compileBase } from "../bases/index";
import { type KanbanDefinition, parseKanbanDefinition } from "./dashboardData";
import { WidgetDialog } from "./WidgetDialog";
import { BaseConfigEditor } from "./BaseConfigEditor";

function text(config: Record<string, unknown>, key: string): string {
  return typeof config[key] === "string" ? config[key] as string : "";
}
function number(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return typeof config[key] === "number" ? config[key] as number : fallback;
}

function SearchableFileSelect({
  value,
  paths,
  placeholder,
  filter,
  onChange,
}: {
  value: string;
  paths: string[];
  placeholder: string;
  filter?: { test: (path: string) => boolean };
  onChange: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const matching = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return paths.filter((path) => (!filter || filter.test(path)) &&
      (!normalized || path.toLowerCase().includes(normalized))).slice(0, 100);
  }, [filter, paths, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  const choose = (path: string) => {
    onChange(path);
    setOpen(false);
    setQuery("");
  };

  return <div className="settings-file-picker" ref={rootRef}>
    <button type="button" className="settings-file-picker-trigger" onClick={() => setOpen((current) => !current)} title={value || placeholder}>
      <FileText size={15} /><span>{value || placeholder}</span>
    </button>
    {open && <div className="settings-file-picker-popover">
      <div className="settings-file-picker-search"><Search size={14} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, Math.max(0, matching.length - 1))); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
        if (event.key === "Enter" && matching[activeIndex]) choose(matching[activeIndex]);
      }} placeholder="Search by file name or folder…" /></div>
      <div className="settings-file-picker-results">
        {matching.length > 0 ? matching.map((path, index) => <button key={path} type="button" className={index === activeIndex || path === value ? "active" : ""} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(path)}><FileText size={13} /><span>{path}</span></button>) : <p>No matching files</p>}
      </div>
    </div>}
  </div>;
}

export function WidgetSettingsPanel({
  widget,
  chatSettings,
  directoryBase,
  onChange,
  onTitleChange,
  onDelete,
  onClose,
  dashboardFileName,
  onTypeChange,
}: {
  widget: DashboardWidget;
  chatSettings: ChatSettings;
  directoryBase: string;
  onChange: (config: Record<string, unknown>) => void;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
  onClose: () => void;
  dashboardFileName?: string;
  onTypeChange?: (nextType: string, nextConfig: Record<string, unknown>) => void;
}) {
  const definition = dashboardWidgetDefinition(widget.type);
  const PluginConfig = definition?.ConfigEditor ?? definition?.configComponent;
  const workflowCard =
    widget.config.card && typeof widget.config.card === "object" &&
      !Array.isArray(widget.config.card)
      ? widget.config.card as Record<string, unknown>
      : {};
  const [files, setFiles] = useState<string[]>([]);
  const [json, setJSON] = useState(() =>
    JSON.stringify(widget.config, null, 2)
  );
  const [jsonError, setJSONError] = useState("");
  const [actionError, setActionError] = useState("");
  const [workflowAI, setWorkflowAI] = useState<
    | {
      mode: "create" | "modify";
      path: string;
      name: string;
      markdown: string;
    }
    | null
  >(null);
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowRun[]>([]);
  const [baseAIOpen, setBaseAIOpen] = useState(false),
    [baseAIInstruction, setBaseAIInstruction] = useState(""),
    [baseAIBusy, setBaseAIBusy] = useState(false),
    [newBaseName, setNewBaseName] = useState(""),
    [baseEditorContent, setBaseEditorContent] = useState(""),
    [baseSaving, setBaseSaving] = useState(false),
    [baseLoadError, setBaseLoadError] = useState("");
  const [fileSourceMode, setFileSourceMode] = useState<"import" | "create">(
      "import",
    ),
    [newFileName, setNewFileName] = useState("");
  const [kanbanName, setKanbanName] = useState(""),
    [kanbanDefinition, setKanbanDefinition] = useState<KanbanDefinition | null>(
      null,
    ),
    [kanbanSaving, setKanbanSaving] = useState(false);
  const kanbanSaveTimerRef = useRef(0);
  const pendingKanbanDefinitionRef = useRef<KanbanDefinition | null>(null);
  const baseSaveTimerRef = useRef(0);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  useEffect(() => {
    void fileInventory().then((items) =>
      setFiles(items.map((item) => item.path))
    );
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadWorkflowHistory(directoryBase).then((records) => { if (!cancelled) setWorkflowHistory(records); });
    return () => { cancelled = true; };
  }, [directoryBase]);
  useEffect(() => setJSON(JSON.stringify(widget.config, null, 2)), [
    widget.id,
    widget.config,
  ]);
  useEffect(() => {
    const path = text(widget.config, "base");
    if (!path) {
      setBaseEditorContent("");
      setBaseLoadError("");
      return;
    }
    let cancelled = false;
    void readFile(path).then((file) => {
      if (cancelled) return;
      if (file) {
        setBaseEditorContent(file.content);
        setBaseLoadError("");
      } else setBaseLoadError(`Cannot read ${path}`);
    });
    return () => {
      cancelled = true;
    };
  }, [widget.id, text(widget.config, "base")]);
  useEffect(() => {
    const path = text(widget.config, "kanban");
    if (!path) {
      setKanbanDefinition(null);
      return;
    }
    let cancelled = false;
    void readFile(path).then((file) => {
      if (!cancelled) {
        setKanbanDefinition(file ? parseKanbanDefinition(file.content) : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [widget.config]);
  const set = (key: string, value: unknown) =>
    onChange({ ...widget.config, [key]: value });
  const fileList = useMemo(
    () => files.filter((path) => !path.startsWith(".llm-hub/")),
    [files],
  );
  const labels: Record<string, string> = {
    path: "File",
    workflow: "Workflow",
    outputVariable: "Output variable",
    url: "URL",
    base: "Base file",
    view: "View",
    kanban: "Kanban file",
    folder: "Folder",
    statusProperty: "Status property",
    titleProperty: "Title property",
    name: "Timeline name",
  };
  const fileInput = (
    key: string,
    placeholder: string,
    extension?: { test: (path: string) => boolean },
  ) => (
    <label>
      <span>{labels[key] || key}</span>
      <input
        list={`dashboard-files-${widget.id}-${key}`}
        value={key === "path"
          ? text(widget.config, "path") || text(widget.config, "filePath")
          : text(widget.config, key)}
        placeholder={placeholder}
        onChange={(event) => set(key, event.target.value)}
      />
      <datalist id={`dashboard-files-${widget.id}-${key}`}>
        {fileList.filter((path) => !extension || extension.test(path)).map((
          path,
        ) => <option key={path} value={path} />)}
      </datalist>
    </label>
  );
  const fileSelect = (
    key: string,
    placeholder: string,
    extension?: { test: (path: string) => boolean },
  ) => (
    <div className="settings-file-field">
      <span>{labels[key] || key}</span>
      <SearchableFileSelect
        value={key === "path"
          ? text(widget.config, "path") || text(widget.config, "filePath")
          : text(widget.config, key)}
        paths={fileList}
        placeholder={placeholder}
        filter={extension}
        onChange={(path) => set(key, path)}
      />
    </div>
  );
  const createMarkdownFile = async () => {
    const stem =
      (newFileName.trim() || "New Note").replace(/\.md$/i, "").replace(
        /[\\/:*?"<>|]/g,
        "",
      ).trim() || "New Note";
    let path = `${stem}.md`, suffix = 2;
    while (files.includes(path)) path = `${stem} ${suffix++}.md`;
    await writeFile(path, `# ${stem}\n`);
    setFiles((current) => [...current, path]);
    onChange({ ...widget.config, path });
    setNewFileName("");
    window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  };
  const createBaseFile = async () => {
    const stem =
      (newBaseName.trim() || widget.title || "Base").replace(/\.base$/i, "")
        .replace(/[\\/:*?"<>|#^[\]]/g, "").trim() || "Base";
    let path = `Dashboards/Bases/${stem}.base`, suffix = 2;
    while (files.includes(path)) {
      path = `Dashboards/Bases/${stem} ${suffix++}.base`;
    }
    await writeFile(
      path,
      yaml.dump({
        views: [{
          type: "table",
          name: "Table",
          order: ["file.name", "file.mtime"],
          sort: [{ property: "file.mtime", direction: "DESC" }],
          limit: 50,
        }],
      }, { lineWidth: -1, noRefs: true }),
    );
    setFiles((current) => [...current, path]);
    onChange({ ...widget.config, base: path, view: "Table" });
    setNewBaseName("");
    window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  };
  const saveKanbanFile = async () => {
    const title = (kanbanName || text(widget.config, "title") || widget.title ||
      `kanban-${widget.id.slice(0, 8)}`).replace(/[\\/:*?"<>|#^[\]]/g, "")
      .trim() || `kanban-${widget.id.slice(0, 8)}`;
    let path = `Dashboards/Kanbans/${title}.kanban`, suffix = 2;
    while (files.includes(path)) {
      path = `Dashboards/Kanbans/${title}-${suffix++}.kanban`;
    }
    const { kanban: _kanban, cardOrder, ...board } = widget.config;
    try {
      await writeFile(
        path,
        yaml.dump({ version: 1, ...board, title }, {
          lineWidth: -1,
          noRefs: true,
        }),
      );
      onChange({
        kanban: path,
        ...(Array.isArray(cardOrder) ? { cardOrder } : {}),
      });
      setFiles((current) => [...current, path]);
      setActionError("");
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  const updateKanbanDefinition = (next: KanbanDefinition) => {
    setKanbanDefinition(next);
    pendingKanbanDefinitionRef.current = next;
    window.clearTimeout(kanbanSaveTimerRef.current);
    kanbanSaveTimerRef.current = window.setTimeout(async () => {
      const path = text(widget.config, "kanban"),
        pending = pendingKanbanDefinitionRef.current;
      pendingKanbanDefinitionRef.current = null;
      if (!path || !pending) return;
      setKanbanSaving(true);
      try {
        await writeFile(
          path,
          yaml.dump({ version: 1, ...pending }, {
            lineWidth: -1,
            noRefs: true,
          }),
        );
        setActionError("");
        window.dispatchEvent(
          new CustomEvent("llm-hub:dashboard-data-changed", {
            detail: { path },
          }),
        );
      } catch (caught) {
        setActionError(
          caught instanceof Error ? caught.message : String(caught),
        );
      } finally {
        setKanbanSaving(false);
      }
    }, 600);
  };
  useEffect(() => () => {
    window.clearTimeout(kanbanSaveTimerRef.current);
    const path = text(widget.config, "kanban"),
      pending = pendingKanbanDefinitionRef.current;
    pendingKanbanDefinitionRef.current = null;
    if (path && pending) {
      void writeFile(
        path,
        yaml.dump({ version: 1, ...pending }, { lineWidth: -1, noRefs: true }),
      ).then(() =>
        window.dispatchEvent(
          new CustomEvent("llm-hub:dashboard-data-changed", {
            detail: { path },
          }),
        )
      );
    }
  }, [widget.config]);
  const openWorkflowAI = async () => {
    const path = text(widget.config, "workflow");
    if (!path) {
      setWorkflowAI({
        mode: "create",
        path: "",
        name: widget.title || "Dashboard Workflow",
        markdown: "",
      });
      return;
    }
    const file = await readFile(path);
    if (!file) {
      setActionError(`Cannot read ${path}`);
      return;
    }
    setWorkflowAI({
      mode: "modify",
      path,
      name: workflowNameFromFilePath(path),
      markdown: file.content,
    });
  };
  const buildBaseWithAI = async () => {
    if (!baseAIInstruction.trim()) return;
    const configuredPath = text(widget.config, "base");
    const safeName =
      (widget.title || "base").replace(/[\\/:*?"<>|#^[\]]/g, "").trim() ||
      "base";
    let path = configuredPath || `Dashboards/Bases/${safeName}.base`;
    if (!configuredPath) {
      let suffix = 2;
      while (files.includes(path)) {
        path = `Dashboards/Bases/${safeName} ${suffix++}.base`;
      }
    }
    const current = configuredPath
      ? (await readFile(configuredPath))?.content || ""
      : "views:\n  - type: table\n    name: All\n    order: [file.name]\n";
    setBaseAIBusy(true);
    setActionError("");
    try {
      const result = await chat({
        provider: chatSettings.provider,
        endpoint: chatSettings.endpoint,
        apiKey: chatSettings.apiKey,
        model: chatSettings.model,
        vertexProjectId: chatSettings.vertexProjectId,
        vertexLocation: chatSettings.vertexLocation,
        systemPrompt:
          "Create or modify a Bases YAML document. Preserve useful existing sections and unknown keys. Return only YAML without Markdown fences.",
        messages: [{
          role: "user",
          content:
            `Request:\n${baseAIInstruction}\n\nCurrent .base YAML:\n${current}`,
        }],
        enableFileTools: false,
        fileToolMode: "none",
        cliType: chatSettings.cliType,
        cliPath: chatSettings.cliPaths[chatSettings.cliType],
        cliSessionId: "",
        enableThinking: true,
      });
      const content = result.content.replace(/^```(?:yaml)?\s*/i, "").replace(
        /\s*```\s*$/i,
        "",
      ).trim() + "\n";
      const compiled = compileBase(content);
      const compileError = compiled.diagnostics.find((item) =>
        item.severity === "error"
      );
      if (compileError) {
        throw new Error("AI returned an invalid .base YAML document.");
      }
      await writeFile(path, content);
      onChange({ ...widget.config, base: path });
      setFiles((currentFiles) => [...new Set([...currentFiles, path])]);
      setBaseAIOpen(false);
      setBaseAIInstruction("");
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBaseAIBusy(false);
    }
  };
  return (
    <div
      className="dashboard-settings-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className={`dashboard-widget-settings${
          widget.type === "base" ? " base-widget-settings" : ""
        }${widget.type === "file" || widget.type === "markdown" ? " file-widget-settings" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="widget-settings-heading">
              {widget.type === "base" && <Database size={16} />}
              <strong>{definition?.label || `Unknown (${widget.type})`}</strong>
            </span>
            {widget.type !== "base" && (
              <small>Changes are applied automatically</small>
            )}
          </div>
          <button type="button" onClick={onClose}>
            <X size={17} />
          </button>
        </header>
        <div className="dashboard-widget-settings-body">
          {widget.type === "base" && (
            <p className="gemihub-base-auto">
              Changes are applied automatically.
            </p>
          )}
          {widget.type === "kanban" && (
            <label>
              <span>Widget title</span>
              <input
                value={widget.title}
                onChange={(event) => onTitleChange(event.target.value)}
              />
            </label>
          )}
          {(widget.type === "file" || widget.type === "markdown") && (
            <div className="file-config-editor">
              {text(widget.config, "path") || text(widget.config, "filePath")
                ? (
                  <>
                    <div className="file-config-current">
                      <FileText size={13} />
                      <span>
                        {text(widget.config, "path") ||
                          text(widget.config, "filePath")}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...widget.config,
                            path: "",
                            filePath: "",
                          })}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {fileSelect(
                      "path",
                      "notes/example.md",
                      /\.(?:md|markdown|txt|html?|pdf|epub|png|jpe?g|gif|webp|svg)$/i,
                    )}
                  </>
                )
                : (
                  <>
                    <div className="file-source-switch">
                      <button
                        type="button"
                        className={fileSourceMode === "import" ? "active" : ""}
                        onClick={() => setFileSourceMode("import")}
                      >
                        Import
                      </button>
                      <button
                        type="button"
                        className={fileSourceMode === "create" ? "active" : ""}
                        onClick={() => setFileSourceMode("create")}
                      >
                        Create
                      </button>
                    </div>
                    {fileSourceMode === "import"
                      ? fileSelect(
                        "path",
                        "Select a file",
                        /\.(?:md|markdown|txt|html?|pdf|epub|png|jpe?g|gif|webp|svg)$/i,
                      )
                      : (
                        <label>
                          <span>Create a Markdown file</span>
                          <div className="file-create-row">
                            <input
                              value={newFileName}
                              onChange={(event) =>
                                setNewFileName(event.target.value)}
                              placeholder="New Note"
                            />
                            <button
                              type="button"
                              onClick={() => void createMarkdownFile()}
                            >
                              Create
                            </button>
                          </div>
                        </label>
                      )}
                  </>
                )}
              <label className="check">
                <span>Show header</span>
                <input
                  type="checkbox"
                  checked={widget.config.showHeader !== false}
                  onChange={(event) => set("showHeader", event.target.checked)}
                />
              </label>
              <label className="check">
                <span>Show Markdown properties</span>
                <input
                  type="checkbox"
                  checked={widget.config.showProperties !== false}
                  onChange={(event) =>
                    set("showProperties", event.target.checked)}
                />
              </label>
            </div>
          )}
          {widget.type === "workflow" && (
            <>
              {fileInput("workflow", "workflows/example.workflow.yaml", {
                test: isWorkflowFilePath,
              })}
              <button
                type="button"
                className="widget-settings-ai"
                onClick={() => void openWorkflowAI()}
              >
                {text(widget.config, "workflow")
                  ? <Pencil size={13} />
                  : <Sparkles size={13} />}
                {text(widget.config, "workflow")
                  ? "Modify workflow with AI"
                  : "Create workflow with AI"}
              </button>
              {fileInput("outputVariable", "result")}
              <label>
                <span>Output format</span>
                <select
                  value={text(widget.config, "output") || "table"}
                  onChange={(event) => set("output", event.target.value)}
                >
                  <option value="markdown">Markdown</option>
                  <option value="table">Table</option>
                  <option value="card">Cards</option>
                  <option value="html">HTML</option>
                </select>
              </label>
              {(text(widget.config, "output") || "table") === "card" && (
                <div className="workflow-card-mapping">
                  <strong>Card field mapping</strong>
                  {["title", "subtitle", "image", "body"].map((key) => (
                    <label key={key}>
                      <span>{key[0].toUpperCase() + key.slice(1)}</span>
                      <input
                        value={typeof workflowCard[key] === "string"
                          ? workflowCard[key] as string
                          : ""}
                        onChange={(event) =>
                          set("card", {
                            ...workflowCard,
                            [key]: event.target.value,
                          })}
                        placeholder={`${key} field`}
                      />
                    </label>
                  ))}
                  <label>
                    <span>Badges (comma-separated fields)</span>
                    <input
                      value={Array.isArray(workflowCard.badges)
                        ? workflowCard.badges.join(", ")
                        : ""}
                      onChange={(event) =>
                        set("card", {
                          ...workflowCard,
                          badges: event.target.value.split(",").map((value) =>
                            value.trim()
                          ).filter(Boolean),
                        })}
                    />
                  </label>
                </div>
              )}
              {(text(widget.config, "output") || "table") === "table" && (
                <label>
                  <span>
                    Table columns (one per line; blank detects automatically)
                  </span>
                  <textarea
                    rows={6}
                    value={Array.isArray(widget.config.columns)
                      ? widget.config.columns.join("\n")
                      : ""}
                    onChange={(event) =>
                      set(
                        "columns",
                        event.target.value.split(/\r?\n/).map((value) =>
                          value.trim()
                        ).filter(Boolean),
                      )}
                  />
                </label>
              )}
              {((text(widget.config, "output") || "table") === "table" ||
                (text(widget.config, "output") || "table") === "card") && (
                <div className="settings-two-columns">
                  <label>
                    <span>Configured sort</span>
                    <input
                      value={text(widget.config, "sort")}
                      onChange={(event) => set("sort", event.target.value)}
                      placeholder="field or -field"
                    />
                  </label>
                  <label>
                    <span>Row limit</span>
                    <input
                      type="number"
                      min="1"
                      max="5000"
                      value={number(widget.config, "limit", 500)}
                      onChange={(event) =>
                        set(
                          "limit",
                          Math.max(1, Number(event.target.value) || 500),
                        )}
                    />
                  </label>
                </div>
              )}
              <label>
                <span>Refresh interval (minutes)</span>
                <input
                  type="number"
                  min="0"
                  value={number(widget.config, "refreshInterval", 0)}
                  onChange={(event) =>
                    set("refreshInterval", Number(event.target.value))}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={widget.config.showHeader !== false}
                  onChange={(event) => set("showHeader", event.target.checked)}
                />Show header
              </label>
            </>
          )}
          {widget.type === "web" && (
            <>
              {fileInput("url", "https://example.com")}
              {text(widget.config, "url") &&
                !/^https?:\/\/[^\s]+$/i.test(text(widget.config, "url")) && (
                <small className="error">
                  Enter a valid HTTP or HTTPS URL.
                </small>
              )}
              <label className="check">
                <span>Show header</span>
                <input
                  type="checkbox"
                  checked={widget.config.showHeader !== false}
                  onChange={(event) => set("showHeader", event.target.checked)}
                />
              </label>
            </>
          )}
          {widget.type === "base" && (
            <div className="base-config-editor">
              {text(widget.config, "base")
                ? (
                  <>
                    <div className="gemihub-base-header">
                      <span>
                        <FileText size={14} />
                        {text(widget.config, "base")}
                      </span>
                      <small>{baseSaving ? "Saving..." : "Saved"}</small>
                      <button
                        type="button"
                        className="widget-settings-ai"
                        onClick={() => setBaseAIOpen(true)}
                      >
                        <Sparkles size={13} />Edit with AI
                      </button>
                    </div>
                    {baseLoadError && (
                      <small className="error">{baseLoadError}</small>
                    )}
                    {baseEditorContent && (
                      <BaseConfigEditor
                        content={baseEditorContent}
                        viewName={text(widget.config, "view")}
                        onChange={(content) => {
                          const path = text(widget.config, "base");
                          setBaseEditorContent(content);
                          if (!path) return;
                          setBaseSaving(true);
                          window.clearTimeout(baseSaveTimerRef.current);
                          baseSaveTimerRef.current = window.setTimeout(() => {
                            void writeFile(path, content).then(() => {
                              setBaseLoadError("");
                              window.dispatchEvent(
                                new CustomEvent(
                                  "llm-hub:dashboard-data-changed",
                                  { detail: { path } },
                                ),
                              );
                            }).catch((caught) =>
                              setBaseLoadError(
                                caught instanceof Error
                                  ? caught.message
                                  : String(caught),
                              )
                            ).finally(() => setBaseSaving(false));
                          }, 300);
                        }}
                      />
                    )}
                  </>
                )
                : (
                  <>
                    <label>
                      <span>Create a new Base</span>
                      <div className="file-create-row">
                        <input
                          value={newBaseName}
                          onChange={(event) =>
                            setNewBaseName(event.target.value)}
                          placeholder="Base name"
                        />
                        <button
                          type="button"
                          onClick={() => void createBaseFile()}
                        >
                          <Plus size={13} />Create
                        </button>
                      </div>
                    </label>
                    {files.some((path) => /\.base$/i.test(path)) &&
                      fileSelect(
                        "base",
                        "Import an existing .base",
                        /\.base$/i,
                      )}
                  </>
                )}
            </div>
          )}
          {widget.type === "kanban" && (
            <div className="kanban-config-editor">
              {text(widget.config, "kanban")
                ? (
                  <>
                    <div className="kanban-config-current">
                      <LayoutGrid size={14} />
                      <span>{text(widget.config, "kanban")}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onChange({ ...widget.config, kanban: "" })}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {!kanbanDefinition
                      ? (
                        <small className="error">
                          The Kanban file could not be loaded.
                        </small>
                      )
                      : (
                        <>
                          <label>
                            <span>Board title</span>
                            <input
                              value={typeof kanbanDefinition.title === "string"
                                ? kanbanDefinition.title
                                : ""}
                              onChange={(event) =>
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  title: event.target.value,
                                })}
                            />
                          </label>
                          <label>
                            <span>Folder</span>
                            <input
                              value={typeof kanbanDefinition.folder === "string"
                                ? kanbanDefinition.folder
                                : ""}
                              onChange={(event) =>
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  folder: event.target.value,
                                })}
                              placeholder="Tasks"
                            />
                          </label>
                          <div className="settings-two-columns">
                            <label>
                              <span>Status property</span>
                              <input
                                value={typeof kanbanDefinition
                                    .statusProperty === "string"
                                  ? kanbanDefinition.statusProperty
                                  : "status"}
                                onChange={(event) =>
                                  updateKanbanDefinition({
                                    ...kanbanDefinition,
                                    statusProperty: event.target.value,
                                  })}
                              />
                            </label>
                            <label>
                              <span>Title property</span>
                              <input
                                value={typeof kanbanDefinition.titleProperty ===
                                    "string"
                                  ? kanbanDefinition.titleProperty
                                  : "title"}
                                onChange={(event) =>
                                  updateKanbanDefinition({
                                    ...kanbanDefinition,
                                    titleProperty: event.target.value,
                                  })}
                              />
                            </label>
                          </div>
                          <label>
                            <span>Timeline for status history</span>
                            <input
                              value={typeof kanbanDefinition.timelineName === "string" ? kanbanDefinition.timelineName : ""}
                              onChange={(event) => updateKanbanDefinition({ ...kanbanDefinition, timelineName: event.target.value })}
                              placeholder="Timeline (leave blank to disable)"
                            />
                            <small>Card moves are appended to the selected Timeline.</small>
                          </label>
                          <label>
                            <span>Columns (`value: Label`, one per line)</span>
                            <textarea
                              rows={7}
                              value={(Array.isArray(kanbanDefinition.columns)
                                ? kanbanDefinition.columns
                                : []).map((item) =>
                                  typeof item === "string"
                                    ? `${item}: ${item}`
                                    : `${item.value || ""}: ${
                                      item.label || item.value || ""
                                    }`
                                ).join("\n")}
                              onChange={(event) =>
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  columns: event.target.value.split(/\r?\n/)
                                    .filter(Boolean).map((line) => {
                                      const [value, ...label] = line.split(":");
                                      return {
                                        value: value.trim(),
                                        label: label.join(":").trim() ||
                                          value.trim(),
                                      };
                                    }),
                                })}
                            />
                          </label>
                          <small className="kanban-save-status">
                            {kanbanSaving
                              ? "Saving…"
                              : "Changes are saved automatically"}
                          </small>
                        </>
                      )}
                    {fileSelect(
                      "kanban",
                      "Choose another .kanban",
                      /\.kanban$/i,
                    )}
                  </>
                )
                : (
                  <>
                    <label>
                      <span>Create a new Kanban</span>
                      <div className="file-create-row">
                        <input
                          value={kanbanName}
                          onChange={(event) =>
                            setKanbanName(event.target.value)}
                          placeholder="Board title"
                        />
                        <button
                          type="button"
                          onClick={() => void saveKanbanFile()}
                        >
                          <Plus size={13} />Create
                        </button>
                      </div>
                    </label>
                    {files.some((path) => /\.kanban$/i.test(path)) &&
                      fileSelect(
                        "kanban",
                        "Import an existing .kanban",
                        /\.kanban$/i,
                      )}
                  </>
                )}
              {actionError && <small className="error">{actionError}</small>}
            </div>
          )}
          {widget.type === "timeline" && (
            <>
              {fileInput("name", "Timeline")}
              <small>
                Posts are stored under Dashboards/Timeline/&lt;name&gt;.
              </small>
              <label>
                <span>Latest posts</span>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={number(widget.config, "latestCount", 20)}
                  onChange={(event) =>
                    set("latestCount", Number(event.target.value))}
                />
              </label>
              <label>
                <span>Composer mode</span>
                <div className="timeline-mode-switch">
                  <button
                    type="button"
                    className={(text(widget.config, "composerMode") ||
                        "raw") === "raw"
                      ? "active"
                      : ""}
                    onClick={() => set("composerMode", "raw")}
                  >
                    <Code size={12} />Raw
                  </button>
                  <button
                    type="button"
                    className={text(widget.config, "composerMode") === "wysiwyg"
                      ? "active"
                      : ""}
                    onClick={() => set("composerMode", "wysiwyg")}
                  >
                    <PenLine size={12} />WYSIWYG
                  </button>
                </div>
              </label>
              <div className="settings-two-columns">
                <label>
                  <span>Collapse after lines</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={number(widget.config, "collapseLineLimit", 8)}
                    onChange={(event) =>
                      set("collapseLineLimit", Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>Collapse after characters</span>
                  <input
                    type="number"
                    min="80"
                    max="5000"
                    value={number(widget.config, "collapseCharLimit", 520)}
                    onChange={(event) =>
                      set("collapseCharLimit", Number(event.target.value))}
                  />
                </label>
              </div>
            </>
          )}
          {widget.type === "calendar" && (
            <>
              <label>
                <span>Timeline name</span>
                <input value={text(widget.config, "timelineName") || "Timeline"} onChange={(event) => set("timelineName", event.target.value)} />
                <small>Events and posts use Dashboards/Timeline/&lt;name&gt;.</small>
              </label>
            </>
          )}
          {widget.type === "secret-manager" && fileInput("folder", "Secrets")}
          {PluginConfig && (
            <PluginConfig config={widget.config} onChange={(next) => {
              if (next && typeof next === "object" && !Array.isArray(next)) onChange(next as Record<string, unknown>);
            }} widgetType={widget.type} widgetId={widget.id} dashboardFileName={dashboardFileName} onTypeChange={onTypeChange} />
          )}
          {!definition && (
            <label>
              <span>Unknown widget config (JSON)</span>
              <textarea
                rows={16}
                value={json}
                onChange={(event) => {
                  setJSON(event.target.value);
                  try {
                    const value = JSON.parse(event.target.value) as Record<
                      string,
                      unknown
                    >;
                    onChange(value);
                    setJSONError("");
                  } catch {
                    setJSONError("Invalid JSON");
                  }
                }}
              />
              {jsonError && <small className="error">{jsonError}</small>}
            </label>
          )}
        </div>
        <footer>
          <button type="button" className="danger" onClick={onDelete}>
            <X size={14} />Delete Widget
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </aside>
      {workflowAI && (
        <AIWorkflowBuilderModal
          mode={workflowAI.mode}
          currentMarkdown={workflowAI.markdown}
          currentPath={workflowAI.path}
          currentName={workflowAI.name}
          settings={chatSettings}
          history={workflowHistory}
          additionalInstructions="This workflow runs unattended in a dashboard widget. Store one displayable result in the configured output variable."
          onClose={() => setWorkflowAI(null)}
          onApply={async (result) => {
            const target = workflowAI.mode === "create"
              ? canonicalWorkflowPath(result.path)
              : workflowAI.path;
            if (
              workflowAI.mode === "create" &&
              await readFile(target).catch(() => null)
            ) throw new Error(`A file already exists at ${target}.`);
            const content = workflowAI.mode === "modify"
              ? replaceWorkflowDefinition(workflowAI.markdown, result.block)
              : workflowYamlFromContent(result.block);
            await writeFile(target, content);
            onChange({ ...widget.config, workflow: target });
            setFiles((current) => [...new Set([...current, target])]);
            setWorkflowAI(null);
            window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
          }}
        />
      )}
      {baseAIOpen && (
        <WidgetDialog
          title="Edit base with AI"
          onClose={() => setBaseAIOpen(false)}
        >
          <div className="base-ai-dialog">
            <label>
              Describe the Base view or change<textarea
                autoFocus
                rows={9}
                value={baseAIInstruction}
                onChange={(event) => setBaseAIInstruction(event.target.value)}
                placeholder="Show Workspace notes as cards grouped by status…"
              />
            </label>
            {actionError && (
              <p className="dashboard-widget-error">{actionError}</p>
            )}
            <footer>
              <button type="button" onClick={() => setBaseAIOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={baseAIBusy || !baseAIInstruction.trim()}
                onClick={() => void buildBaseWithAI()}
              >
                {baseAIBusy ? "Generating…" : "Apply"}
              </button>
            </footer>
          </div>
        </WidgetDialog>
      )}
    </div>
  );
}
