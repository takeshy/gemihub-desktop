import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Code,
  Database,
  FileText,
  LayoutGrid,
  Pencil,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  chat,
  fileInventory,
  listWorkspaceDirectoryFiles,
  listWorkspaceFiles,
  readFile,
  readWorkspaceFile,
  writeFile,
  writeWorkspaceFile,
} from "../lib/wailsBackend";
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
import {
  type KanbanDefinition,
  loadDashboardRows,
  parseKanbanDefinition,
} from "./dashboardData";
import { WidgetDialog } from "./WidgetDialog";
import { BaseConfigEditor } from "./BaseConfigEditor";
import { WorkspaceFolderPicker } from "./WorkspaceFolderPicker";
import { fileRef, isFileRef } from "../lib/fileRef";

function text(config: Record<string, unknown>, key: string): string {
  if ((key === "path" || key === "filePath") && isFileRef(config.file)) {
    return config.file.path;
  }
  return typeof config[key] === "string" ? config[key] as string : "";
}
function number(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return typeof config[key] === "number" ? config[key] as number : fallback;
}

function KanbanDisplayFieldsEditor({ definition, fieldNames, onChange }: {
  definition: KanbanDefinition;
  fieldNames: string[];
  onChange: (next: KanbanDefinition) => void;
}) {
  const fields = (definition.displayFields || []).map((item) =>
    typeof item === "string"
      ? { field: item, label: "", maxLength: undefined }
      : {
        field: item.field || "",
        label: item.label || "",
        maxLength: item.maxLength,
      }
  );
  const commit = (displayFields: typeof fields) =>
    onChange({ ...definition, displayFields });
  return (
    <section className="kanban-settings-columns">
      <strong>Display fields</strong>
      {fields.map((item, index) => (
        <div className="kanban-display-field" key={index}>
          <select
            value={item.field}
            onChange={(event) =>
              commit(fields.map((field, fieldIndex) =>
                fieldIndex === index
                  ? { ...field, field: event.target.value }
                  : field
              ))}
          >
            {item.field && !fieldNames.includes(item.field) && (
              <option>{item.field}</option>
            )}
            {fieldNames.map((field) => <option key={field}>{field}</option>)}
          </select>
          <input
            value={item.label}
            placeholder="Label"
            onChange={(event) =>
              commit(fields.map((field, fieldIndex) =>
                fieldIndex === index
                  ? { ...field, label: event.target.value }
                  : field
              ))}
          />
          {item.field === "file.content" && (
            <input
              type="number"
              min="1"
              value={item.maxLength || ""}
              placeholder="Max chars"
              onChange={(event) =>
                commit(fields.map((field, fieldIndex) =>
                  fieldIndex === index
                    ? {
                      ...field,
                      maxLength: Number(event.target.value) || undefined,
                    }
                    : field
                ))}
            />
          )}
          {item.field !== "file.content" && <span aria-hidden="true" />}
          <button
            type="button"
            title="Move up"
            disabled={index === 0}
            onClick={() => {
              const next = [...fields];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              commit(next);
            }}
          >
            <ChevronUp size={13} />
          </button>
          <button
            type="button"
            title="Move down"
            disabled={index === fields.length - 1}
            onClick={() => {
              const next = [...fields];
              [next[index], next[index + 1]] = [next[index + 1], next[index]];
              commit(next);
            }}
          >
            <ChevronDown size={13} />
          </button>
          <button
            type="button"
            title="Remove field"
            onClick={() =>
              commit(fields.filter((_, fieldIndex) =>
                fieldIndex !== index
              ))}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="kanban-file-add"
        disabled={!fieldNames.length}
        onClick={() => {
          const used = new Set(fields.map((item) => item.field));
          commit([...fields, {
            field: fieldNames.find((field) => !used.has(field)) ||
              fieldNames[0] || "",
            label: "",
            maxLength: undefined,
          }]);
        }}
      >
        <Plus size={13} />Add display field
      </button>
    </section>
  );
}

type KanbanFilter = { property: string; op: string; value?: unknown };
function KanbanFilterEditor({ definition, fieldNames, onChange }: {
  definition: KanbanDefinition;
  fieldNames: string[];
  onChange: (next: KanbanDefinition) => void;
}) {
  const filters = Array.isArray(definition.filter)
    ? definition.filter.filter((item): item is KanbanFilter =>
      Boolean(
        item && typeof item === "object" && typeof item.property === "string",
      )
    )
    : [];
  const commit = (filter: KanbanFilter[]) =>
    onChange({ ...definition, filter });
  return (
    <section className="kanban-settings-columns">
      <strong>Filters</strong>
      {filters.map((filter, index) => (
        <div className="kanban-filter-row" key={index}>
          <select
            value={filter.property}
            onChange={(event) =>
              commit(filters.map((item, itemIndex) =>
                itemIndex === index
                  ? { ...item, property: event.target.value }
                  : item
              ))}
          >
            {filter.property && !fieldNames.includes(filter.property) && (
              <option>{filter.property}</option>
            )}
            {fieldNames.map((field) => <option key={field}>{field}</option>)}
          </select>
          <select
            value={filter.op}
            onChange={(event) =>
              commit(
                filters.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, op: event.target.value }
                    : item
                ),
              )}
          >
            <option value="eq">is</option>
            <option value="neq">is not</option>
            <option value="contains">contains</option>
            <option value="notContains">does not contain</option>
            <option value="gt">greater than</option>
            <option value="lt">less than</option>
            <option value="isEmpty">is empty</option>
            <option value="notEmpty">is not empty</option>
          </select>
          {!filter.op.endsWith("Empty") && (
            <input
              value={String(filter.value ?? "")}
              onChange={(event) =>
                commit(filters.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, value: event.target.value }
                    : item
                ))}
            />
          )}
          <button
            type="button"
            title="Remove filter"
            onClick={() =>
              commit(filters.filter((_, itemIndex) => itemIndex !== index))}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="kanban-file-add"
        disabled={!fieldNames.length}
        onClick={() =>
          commit([...filters, {
            property: fieldNames[0] || "status",
            op: "eq",
            value: "",
          }])}
      >
        <Plus size={13} />Add filter
      </button>
    </section>
  );
}

export function displayFilePath(path: string, filesBase: string): string {
  const value = path.trim();
  if (/^(?:[a-z]:[\\/]|[/\\]{2}|\/)/i.test(value) || !filesBase) return value;
  return value;
}

function SearchableFileSelect({
  value,
  paths,
  placeholder,
  filter,
  displayPath,
  onChange,
}: {
  value: string;
  paths: string[];
  placeholder: string;
  filter?: { test: (path: string) => boolean };
  displayPath: (path: string) => string;
  onChange: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const matching = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return paths.filter((path) =>
      (!filter || filter.test(path)) &&
      (!normalized ||
        `${path} ${displayPath(path)}`.toLowerCase().includes(normalized))
    ).slice(0, 100);
  }, [displayPath, filter, paths, query]);

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

  return (
    <div className="settings-file-picker" ref={rootRef}>
      <button
        type="button"
        className="settings-file-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        title={value ? displayPath(value) : placeholder}
      >
        <FileText size={15} />
        <span>{value ? displayPath(value) : placeholder}</span>
      </button>
      {open && (
        <div className="settings-file-picker-popover">
          <div className="settings-file-picker-search">
            <Search size={14} />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) =>
                    Math.min(index + 1, Math.max(0, matching.length - 1))
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(0, index - 1));
                }
                if (event.key === "Enter" && matching[activeIndex]) {
                  choose(matching[activeIndex]);
                }
              }}
              placeholder="Search by file name or folder…"
            />
          </div>
          <div className="settings-file-picker-results">
            {matching.length > 0
              ? matching.map((path, index) => (
                <button
                  key={path}
                  type="button"
                  className={index === activeIndex || path === value
                    ? "active"
                    : ""}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(path)}
                >
                  <FileText size={13} />
                  <span>{displayPath(path)}</span>
                </button>
              ))
              : <p>No matching files</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export function WidgetSettingsPanel({
  widget,
  chatSettings,
  directoryBase,
  filesBase,
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
  filesBase: string;
  onChange: (config: Record<string, unknown>) => void;
  onTitleChange: (title: string) => void;
  onDelete: () => void;
  onClose: () => void;
  dashboardFileName?: string;
  onTypeChange?: (
    nextType: string,
    nextConfig: Record<string, unknown>,
  ) => void;
}) {
  const definition = dashboardWidgetDefinition(widget.type);
  const PluginConfig = definition?.ConfigEditor ?? definition?.configComponent;
  const workflowCard =
    widget.config.card && typeof widget.config.card === "object" &&
      !Array.isArray(widget.config.card)
      ? widget.config.card as Record<string, unknown>
      : {};
  const [files, setFiles] = useState<string[]>([]);
  const [workspaceFilePaths, setWorkspaceFilePaths] = useState<Set<string>>(
    () => new Set(),
  );
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
  const [workflowAILoading, setWorkflowAILoading] = useState(false);
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
  const [kanbanFolderFields, setKanbanFolderFields] = useState<string[]>([]);
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
    if (widget.type === "kanban") {
      void listWorkspaceDirectoryFiles("Dashboards/Kanbans").then((paths) =>
        setFiles(paths.sort())
      );
      return;
    }
    void Promise.allSettled([listWorkspaceFiles(), fileInventory()]).then(
      ([workspace, external]) => {
        const paths = new Set<string>();
        if (workspace.status === "fulfilled") {
          const workspacePaths = new Set(workspace.value.map((item) => item.path));
          setWorkspaceFilePaths(workspacePaths);
          workspacePaths.forEach((path) => paths.add(path));
        }
        if (external.status === "fulfilled") {
          external.value.forEach((item) =>
            paths.add(displayFilePath(item.path, filesBase))
          );
        }
        setFiles([...paths].sort());
      },
    );
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadWorkflowHistory(directoryBase).then((records) => {
      if (!cancelled) setWorkflowHistory(records);
    });
    return () => {
      cancelled = true;
    };
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
    void readWorkspaceFile(path).then((file) => {
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
    void readWorkspaceFile(path).then((file) => {
      if (!cancelled) {
        setKanbanDefinition(file ? parseKanbanDefinition(file.content) : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [widget.config]);
  useEffect(() => {
    const folder = typeof kanbanDefinition?.folder === "string"
      ? kanbanDefinition.folder
      : "";
    if (!folder) {
      setKanbanFolderFields([]);
      return;
    }
    let cancelled = false;
    void loadDashboardRows(folder, "workspace").then(
      (rows) => {
        if (cancelled) return;
        setKanbanFolderFields([
          ...new Set([
            "file.name",
            "file.path",
            "file.ctime",
            "file.mtime",
            "file.tags",
            "file.content",
            ...rows.flatMap((row) => Object.keys(row.frontmatter)),
          ]),
        ].sort());
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kanbanDefinition?.folder]);
  const set = (key: string, value: unknown) =>
    onChange({ ...widget.config, [key]: value });
  const fileList = useMemo(
    () =>
      files.filter((path) => !path.startsWith(".llm-hub/")),
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
    sourcePaths: string[] = fileList,
  ) => (
    <div className="settings-file-field">
      <span>{labels[key] || key}</span>
      <SearchableFileSelect
        value={key === "path"
          ? text(widget.config, "path") || text(widget.config, "filePath")
          : text(widget.config, key)}
        paths={sourcePaths}
        placeholder={placeholder}
        filter={extension}
        displayPath={(path) => displayFilePath(path, filesBase)}
        onChange={(path) => {
          if (
            key === "path" &&
            (widget.type === "file" || widget.type === "markdown")
          ) {
            const scope = workspaceFilePaths.has(path) ? "workspace" : "absolute";
            onChange({ ...widget.config, file: fileRef(scope, path) });
            return;
          }
          set(key, path);
        }}
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
    await writeWorkspaceFile(path, `# ${stem}\n`);
    setFiles((current) => [...current, path]);
    onChange({ ...widget.config, file: fileRef("workspace", path) });
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
    await writeWorkspaceFile(
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
      await writeWorkspaceFile(
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
        await writeWorkspaceFile(
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
      void writeWorkspaceFile(
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
    if (workflowAILoading) return;
    setActionError("");
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
    setWorkflowAILoading(true);
    try {
      const file = await readWorkspaceFile(path);
      if (!file) {
        setActionError(
          `Cannot read ${path}. Select an existing workflow file and try again.`,
        );
        return;
      }
      setWorkflowAI({
        mode: "modify",
        path,
        name: workflowNameFromFilePath(path),
        markdown: file.content,
      });
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : `Cannot read ${path}`,
      );
    } finally {
      setWorkflowAILoading(false);
    }
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
      ? (await readWorkspaceFile(configuredPath))?.content || ""
      : "views:\n  - type: table\n    name: All\n    order: [file.name]\n";
    setBaseAIBusy(true);
    setActionError("");
    try {
      const result = await chat({
        provider: chatSettings.provider,
        endpoint: chatSettings.endpoint,
        apiKey: chatSettings.apiKey,
        localFramework: chatSettings.localFramework,
        localUsername: chatSettings.localUsername,
        localPassword: chatSettings.localPassword,
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
      await writeWorkspaceFile(path, content);
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
        }${
          widget.type === "file" || widget.type === "markdown"
            ? " file-widget-settings"
            : ""
        }`}
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
          {(widget.type === "file" || widget.type === "markdown") && (
            <div className="file-config-editor">
              {text(widget.config, "path") || text(widget.config, "filePath")
                ? (
                  <>
                    <div className="file-config-current">
                      <FileText size={13} />
                      <span>
                        {displayFilePath(
                          text(widget.config, "path") ||
                            text(widget.config, "filePath"),
                          filesBase,
                        )}
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
                disabled={workflowAILoading}
                onClick={() => void openWorkflowAI()}
              >
                {text(widget.config, "workflow")
                  ? <Pencil size={13} />
                  : <Sparkles size={13} />}
                {workflowAILoading
                  ? "Opening workflow…"
                  : text(widget.config, "workflow")
                  ? "Modify workflow with AI"
                  : "Create workflow with AI"}
              </button>
              {actionError && <small className="error">{actionError}</small>}
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
                            void writeWorkspaceFile(path, content).then(() => {
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
                              onChange={(event) => {
                                onTitleChange(event.target.value);
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  title: event.target.value,
                                });
                              }}
                            />
                          </label>
                          <label>
                            <span>Folder</span>
                            <WorkspaceFolderPicker
                              value={typeof kanbanDefinition.folder === "string"
                                ? kanbanDefinition.folder
                                : ""}
                              onChange={(folder) =>
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  folder,
                                })}
                            />
                          </label>
                          <div className="settings-two-columns">
                            <label>
                              <span>Status property</span>
                              <select
                                value={typeof kanbanDefinition
                                    .statusProperty === "string"
                                  ? kanbanDefinition.statusProperty
                                  : "status"}
                                onChange={(event) =>
                                  updateKanbanDefinition({
                                    ...kanbanDefinition,
                                    statusProperty: event.target.value,
                                  })}
                              >
                                {!kanbanFolderFields.includes("status") && (
                                  <option>status</option>
                                )}
                                {kanbanFolderFields.map((field) => (
                                  <option key={field}>{field}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Title property</span>
                              <select
                                value={typeof kanbanDefinition.titleProperty ===
                                    "string"
                                  ? kanbanDefinition.titleProperty
                                  : "title"}
                                onChange={(event) =>
                                  updateKanbanDefinition({
                                    ...kanbanDefinition,
                                    titleProperty: event.target.value,
                                  })}
                              >
                                {!kanbanFolderFields.includes("title") && (
                                  <option>title</option>
                                )}
                                {kanbanFolderFields.map((field) => (
                                  <option key={field}>{field}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label>
                            <span>Timeline for status history</span>
                            <input
                              value={typeof kanbanDefinition.timelineName ===
                                  "string"
                                ? kanbanDefinition.timelineName
                                : ""}
                              onChange={(event) =>
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  timelineName: event.target.value,
                                })}
                              placeholder="Timeline (leave blank to disable)"
                            />
                            <small>
                              Card moves are appended to the selected Timeline.
                            </small>
                          </label>
                          <section className="kanban-settings-columns">
                            <strong>Columns</strong>
                            {(Array.isArray(kanbanDefinition.columns)
                              ? kanbanDefinition.columns
                              : []).map((item) =>
                                typeof item === "string"
                                  ? { value: item, label: item }
                                  : {
                                    value: item.value || "",
                                    label: item.label || item.value || "",
                                  }
                              ).map((column, index, columns) => (
                                <div
                                  className="kanban-file-column"
                                  key={`${column.value}:${index}`}
                                >
                                  <input
                                    value={column.value}
                                    placeholder="Value"
                                    onChange={(event) =>
                                      updateKanbanDefinition({
                                        ...kanbanDefinition,
                                        columns: columns.map((
                                          current,
                                          itemIndex,
                                        ) =>
                                          itemIndex === index
                                            ? {
                                              ...current,
                                              value: event.target.value,
                                            }
                                            : current
                                        ),
                                      })}
                                  />
                                  <input
                                    value={column.label}
                                    placeholder="Label"
                                    onChange={(event) =>
                                      updateKanbanDefinition({
                                        ...kanbanDefinition,
                                        columns: columns.map((
                                          current,
                                          itemIndex,
                                        ) =>
                                          itemIndex === index
                                            ? {
                                              ...current,
                                              label: event.target.value,
                                            }
                                            : current
                                        ),
                                      })}
                                  />
                                  <button
                                    type="button"
                                    title="Move column up"
                                    disabled={index === 0}
                                    onClick={() => {
                                      const next = [...columns];
                                      [next[index - 1], next[index]] = [
                                        next[index],
                                        next[index - 1],
                                      ];
                                      updateKanbanDefinition({
                                        ...kanbanDefinition,
                                        columns: next,
                                      });
                                    }}
                                  >
                                    <ChevronUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Move column down"
                                    disabled={index === columns.length - 1}
                                    onClick={() => {
                                      const next = [...columns];
                                      [next[index], next[index + 1]] = [
                                        next[index + 1],
                                        next[index],
                                      ];
                                      updateKanbanDefinition({
                                        ...kanbanDefinition,
                                        columns: next,
                                      });
                                    }}
                                  >
                                    <ChevronDown size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Remove column"
                                    onClick={() =>
                                      updateKanbanDefinition({
                                        ...kanbanDefinition,
                                        columns: columns.filter((
                                          _,
                                          itemIndex,
                                        ) => itemIndex !== index),
                                      })}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            <button
                              type="button"
                              className="kanban-file-add"
                              onClick={() => {
                                const columns =
                                  Array.isArray(kanbanDefinition.columns)
                                    ? kanbanDefinition.columns
                                    : [];
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  columns: [...columns, {
                                    value: `column-${columns.length + 1}`,
                                    label: "New column",
                                  }],
                                });
                              }}
                            >
                              <Plus size={13} />Add column
                            </button>
                          </section>
                          <label className="kanban-file-check">
                            <input
                              type="checkbox"
                              checked={kanbanDefinition.showUnspecified ===
                                true}
                              onChange={(event) =>
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  showUnspecified: event.target.checked,
                                })}
                            />
                            <span>Show unmatched cards</span>
                          </label>
                          <KanbanDisplayFieldsEditor
                            definition={kanbanDefinition}
                            fieldNames={kanbanFolderFields}
                            onChange={updateKanbanDefinition}
                          />
                          <KanbanFilterEditor
                            definition={kanbanDefinition}
                            fieldNames={kanbanFolderFields}
                            onChange={updateKanbanDefinition}
                          />
                          <label>
                            <span>Limit</span>
                            <input
                              type="number"
                              min="1"
                              max="500"
                              value={typeof kanbanDefinition.limit === "number"
                                ? kanbanDefinition.limit
                                : 100}
                              onChange={(event) =>
                                updateKanbanDefinition({
                                  ...kanbanDefinition,
                                  limit: Math.max(
                                    1,
                                    Math.min(
                                      500,
                                      Number(event.target.value) || 100,
                                    ),
                                  ),
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
                      fileList,
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
                        fileList,
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
                <input
                  value={text(widget.config, "timelineName") || "Timeline"}
                  onChange={(event) => set("timelineName", event.target.value)}
                />
                <small>
                  Events and posts use Dashboards/Timeline/&lt;name&gt;.
                </small>
              </label>
            </>
          )}
          {PluginConfig && (
            <PluginConfig
              config={widget.config}
              onChange={(next) => {
                if (next && typeof next === "object" && !Array.isArray(next)) {
                  onChange(next as Record<string, unknown>);
                }
              }}
              widgetType={widget.type}
              widgetId={widget.id}
              dashboardFileName={dashboardFileName}
              onTypeChange={onTypeChange}
            />
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
              await readWorkspaceFile(target).catch(() => null)
            ) throw new Error(`A file already exists at ${target}.`);
            const content = workflowAI.mode === "modify"
              ? replaceWorkflowDefinition(workflowAI.markdown, result.block)
              : workflowYamlFromContent(result.block);
            await writeWorkspaceFile(target, content);
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
