import {
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Code2,
  Columns2,
  Command,
  Database,
  Eye,
  FileText,
  FolderOpen,
  Home,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  Library,
  LockKeyhole,
  MessageSquare,
  Moon,
  NotebookText,
  Pencil,
  Plug,
  Plus,
  Redo2,
  Rows2,
  Search,
  Server,
  Settings,
  Sun,
  Terminal,
  Undo2,
  Workflow,
  X,
} from "lucide-react";
import packageJson from "../package.json";
import { MemoListModal } from "./components/MemoListModal";
import { OkfSettingsCard } from "./okf/OkfSettingsCard";
import { FileTree } from "./components/FileTree";
import { PluginHost } from "./plugins/PluginHost";
import { DashboardView } from "./dashboard/DashboardView";
import { DashboardToolbar } from "./dashboard/DashboardToolbar";
import {
  KanbanDashboardWidget,
  SecretManagerDashboardWidget,
  TimelineDashboardWidget,
} from "./dashboard/DashboardWidgets";
import { CalendarDashboardWidget } from "./dashboard/CalendarDashboardWidget";
import {
  DASHBOARD_STORAGE_KEY,
  type DashboardData,
  defaultDashboard,
} from "./dashboard/types";
import {
  createDashboard,
  listDashboardFiles,
  loadDashboard,
  parseDashboard,
  removeDashboard,
  renameDashboard,
  saveDashboard,
  serializeDashboard,
} from "./dashboard/dashboardFile";
import type { DashboardFileEntry } from "./dashboard/types";
import { I18nProvider, useI18n } from "./i18n/context";
import {
  type LanguageSetting,
  resolveLanguage,
  t,
  type TranslationStrings,
} from "./i18n/translations";
import {
  connectMCPOAuth,
  connectVertexOAuth,
  deleteRAGIndex,
  type DirectoryFileEntry,
  disconnectMCPOAuth,
  disconnectVertexOAuth,
  type DiscordBotRequest,
  type DiscordStatus,
  getDirectoryBase,
  getDiscordStatus,
  getRAGStatus,
  getVertexOAuthStatus,
  getWorkspaceState,
  listWorkspaceFiles,
  onRAGSyncProgress,
  openDeveloperTools,
  readWorkspaceFile,
  renameRAGIndex,
  selectDirectoryBase,
  selectExternalEditor,
  selectVertexOAuthClient,
  selectWorkspaceDirectory,
  setDirectoryBase,
  setWorkspaceDirectory,
  startDiscordBot,
  startupFilePaths,
  stopDiscordBot,
  syncRAG,
  verifyDiscordToken,
  type WorkspaceState,
  writeWorkspaceFile,
} from "./lib/wailsBackend";
import { type FileRef, fileRef, fileRefFromBackendPath } from "./lib/fileRef";
import {
  parseRecentDirectories,
  updateRecentDirectories,
} from "./lib/recentDirectories";
import { selectCLIPath, verifyCLI } from "./lib/wailsBackend";
import {
  chatModelChoices,
  type ChatProvider,
  type ChatSettings,
  cliNames,
  type CLIType,
  configuredChatProviders,
  defaultRAGSetting,
  loadChatSettings,
  resolveRAGSetting,
  saveChatSettings,
  switchChatProvider,
} from "./llm/settings";
import type { ActiveSelection } from "./llm/selection";
import { ModelProviderManager } from "./llm/ModelProviderManager";
import { McpHttpClient, McpHttpError } from "./mcp/httpClient";
import { McpStdioClient } from "./mcp/stdioClient";
import { getWorkflowSpecTool } from "./workflow/workflowSpec";
import {
  buildSkillSystemPrompt,
  collectSkillWorkflows,
  discoverWorkspaceSkills,
  loadActiveSkillContents,
} from "./skills/skills";
import { AgentSkillsSettings } from "./skills/AgentSkillsSettings";
import { APP_NAME } from "./appIdentity";
import { isBinaryDocumentFileName } from "./dashboard/documentKind";
import {
  configureOrUnlockHistoryEncryption,
  historyEncryptionConfigured,
  historyEncryptionPreferences,
  migrateWorkflowHistoryStorage,
  setHistoryEncryptionPreferences,
} from "./lib/historyEncryption";
import { THIRD_PARTY_NOTICES } from "./thirdPartyNotices";

type Translate = (key: keyof TranslationStrings) => string;

export type MarkdownMode = "preview" | "wysiwyg" | "raw";
export type EqualizeLayoutDirection = "vertical" | "horizontal";

type CheckpointReason =
  | "initial"
  | "idle"
  | "blur"
  | "manual"
  | "restore"
  | "reload";
type DiffViewMode = "unified" | "split";

interface HistoryCheckpoint {
  id: string;
  timestamp: Date;
  reason: CheckpointReason;
  fileName: string;
  content: string;
  dashboard: DashboardData;
}

interface DiffLine {
  type: "unchanged" | "added" | "removed";
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

interface SplitDiffRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

interface DiffTarget {
  label: string;
  before: string;
  after: string;
}

const STORAGE_KEY = "gemihub-desktop:document";
const NAME_KEY = "gemihub-desktop:fileName";
const EXTERNAL_EDITOR_KEY = "gemihub-desktop:externalEditorPath";
const MEMO_SYNC_TIMELINE_KEY = "gemihub-desktop:memoSyncTimeline";
const ENCRYPTION_DIRECTORY_KEY = "gemihub-desktop:encryptionDirectory";
const MEMO_SYNC_TIMELINE_DEFAULT_MIGRATION_KEY =
  "gemihub-desktop:memoSyncTimelineDefaultV1";
const AI_ENABLED_KEY = "llm-hub:aiEnabled";
const LANGUAGE_KEY = "gemihub-desktop:language";
const LAST_OPENED_DIRECTORY_KEY = "llm-hub:lastOpenedDirectory";
const RECENT_DIRECTORIES_KEY = "llm-hub:recentDirectories";
const FILE_TREE_WIDTH_KEY = "llm-hub:fileTreeWidth";
const CHAT_VIEW_WIDTH_KEY = "llm-hub:chatViewWidth";
const DEFAULT_FILE_TREE_WIDTH = 250;
const DEFAULT_CHAT_VIEW_WIDTH = 360;

function readStoredWidth(key: string, fallback: number): number {
  const value = Number(readStored(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

const initialMarkdown = `# GemiHub Desktop

Bring DirectoryBase files, LLM chat, dashboards, and plugins together in one desktop workspace.

> [!note] Preview
> GFM, tables, task lists, code highlight, callouts, and Mermaid diagrams are supported.

## Modes

- Preview
- WYSIWYG
- Raw

\`\`\`mermaid
flowchart LR
  Raw --> Preview
  Raw --> WYSIWYG
  WYSIWYG --> Preview
\`\`\`
`;

function readStored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function parentFilesystemPath(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index > 0 ? path.slice(0, index) : "";
}

function pathIsInside(path: string, base: string): boolean {
  const normalize = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase();
  const candidate = normalize(path);
  const root = normalize(base);
  return !!candidate && !!root &&
    (candidate === root || candidate.startsWith(`${root}/`));
}

function CommaSeparatedInput({ value, onChange }: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const serialized = value.join(", ");
  const [draft, setDraft] = useState(serialized);
  useEffect(() => setDraft(serialized), [serialized]);
  const commit = () => {
    const next = draft.split(",").map((item) => item.trim()).filter(Boolean);
    onChange(next);
    setDraft(next.join(", "));
  };
  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function LineSeparatedTextarea({ value, onChange }: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const serialized = value.join("\n");
  const [draft, setDraft] = useState(serialized);
  useEffect(() => setDraft(serialized), [serialized]);
  const commit = () => {
    const next = draft.split(/\r?\n/).map((item) => item.trim()).filter(
      Boolean,
    );
    onChange(next);
    setDraft(next.join("\n"));
  };
  return (
    <textarea
      rows={3}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
}

function readDashboard(): DashboardData {
  try {
    const stored = localStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (!stored) return defaultDashboard();
    return parseDashboard(stored) ?? defaultDashboard();
  } catch {
    return defaultDashboard();
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const body = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function persistenceContent(fileName: string, content: string): string {
  return isBinaryDocumentFileName(fileName) ? "" : content;
}

function persistenceDashboard(dashboard: DashboardData): DashboardData {
  return {
    ...dashboard,
    widgets: dashboard.widgets.map((widget) => {
      if (widget.type === "file" || widget.type === "markdown") {
        const config = { ...widget.config };
        const path = typeof config.filePath === "string" && config.filePath
          ? config.filePath
          : typeof config.path === "string"
          ? config.path
          : "";
        if (path) config.path = path;
        delete config.filePath;
        delete config.fileName;
        delete config.content;
        return { ...widget, config };
      }
      const fileName = typeof widget.config.fileName === "string"
        ? widget.config.fileName
        : "";
      const content = typeof widget.config.content === "string"
        ? widget.config.content
        : "";
      if (
        !fileName || !content ||
        persistenceContent(fileName, content) === content
      ) return widget;

      return {
        ...widget,
        config: {
          ...widget.config,
          content: "",
        },
      };
    }),
  };
}

// History needs text contents for a useful diff, while normal Dashboard
// persistence intentionally omits File widget contents. Keep only text here;
// binary data URLs remain excluded.
function historyDashboard(dashboard: DashboardData): DashboardData {
  const persisted = persistenceDashboard(dashboard);
  return {
    ...persisted,
    widgets: persisted.widgets.map((widget, index) => {
      const source = dashboard.widgets[index];
      if (!source || (widget.type !== "file" && widget.type !== "markdown")) {
        return widget;
      }
      const fileName = typeof source.config.fileName === "string"
        ? source.config.fileName
        : "";
      const content = typeof source.config.content === "string"
        ? source.config.content
        : "";
      if (!fileName || isBinaryDocumentFileName(fileName)) return widget;
      return {
        ...widget,
        config: { ...widget.config, fileName, content },
      };
    }),
  };
}

function persistLocalState(
  fileName: string,
  content: string,
  dashboard?: DashboardData,
) {
  try {
    localStorage.setItem(STORAGE_KEY, persistenceContent(fileName, content));
    localStorage.setItem(NAME_KEY, fileName);
    if (dashboard) {
      localStorage.setItem(
        DASHBOARD_STORAGE_KEY,
        JSON.stringify(persistenceDashboard(dashboard)),
      );
    }
  } catch (error) {
    console.warn("Could not persist current document.", error);
  }
}

function downloadFile(fileName: string, content: string) {
  const dataBlob = content.startsWith("data:") ? dataUrlToBlob(content) : null;
  const blob = dataBlob ??
    new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "document.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

function checkpointHash(
  fileName: string,
  content: string,
  dashboard: DashboardData,
): string {
  const snapshot = historyDashboard(dashboard);
  return JSON.stringify({
    fileName,
    content: persistenceContent(fileName, content),
    documents: snapshot.widgets.flatMap((widget) => {
      const widgetContent = dashboardWidgetContent(widget);
      if (widgetContent === null) return [];
      return [{
        id: widget.id,
        fileName: typeof widget.config.fileName === "string"
          ? widget.config.fileName
          : "",
        path: typeof widget.config.path === "string" ? widget.config.path : "",
        content: widgetContent,
      }];
    }),
  });
}

function reasonLabel(tr: Translate, reason: CheckpointReason): string {
  switch (reason) {
    case "initial":
      return tr("history.reason.initial");
    case "idle":
      return tr("history.reason.idle");
    case "blur":
      return tr("history.reason.blur");
    case "manual":
      return tr("history.reason.manual");
    case "restore":
      return tr("history.reason.restore");
    case "reload":
      return tr("history.reason.reload");
  }
}

function changedSummary(
  tr: Translate,
  current: HistoryCheckpoint,
  previous?: HistoryCheckpoint,
): string {
  if (!previous) return tr("history.changed.initial");
  const changes: string[] = [];
  if (current.fileName !== previous.fileName) {
    changes.push(tr("history.changed.fileName"));
  }
  if (current.content !== previous.content) {
    changes.push(tr("history.changed.document"));
  }
  if (
    JSON.stringify(current.dashboard) !== JSON.stringify(previous.dashboard)
  ) changes.push(tr("history.changed.dashboard"));
  return changes.length ? changes.join(", ") : tr("history.changed.none");
}

function uniqueCheckpoints(items: HistoryCheckpoint[]): HistoryCheckpoint[] {
  const result: HistoryCheckpoint[] = [];
  let previousHash = "";
  for (const item of items) {
    const hash = checkpointHash(item.fileName, item.content, item.dashboard);
    if (hash === previousHash) continue;
    const previous = result.at(-1);
    if (
      previous && previous.fileName === item.fileName &&
      checkpointDiffTargets(previous, item).length === 0
    ) {
      // Keep the latest restorable Dashboard baseline, but do not show
      // layout/config-only checkpoints whose diff panel would be empty.
      result[result.length - 1] = item;
      previousHash = hash;
      continue;
    }
    previousHash = hash;
    result.push(item);
  }
  return result;
}

function buildLineDiff(before: string, after: string): DiffLine[] {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const rows = oldLines.length;
  const cols = newLines.length;
  const table = Array.from(
    { length: rows + 1 },
    () => Array(cols + 1).fill(0) as number[],
  );

  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] = oldLines[i] === newLines[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < rows && newIndex < cols) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      result.push({
        type: "unchanged",
        content: oldLines[oldIndex],
        oldLineNum: oldIndex + 1,
        newLineNum: newIndex + 1,
      });
      oldIndex++;
      newIndex++;
    } else if (table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]) {
      result.push({
        type: "removed",
        content: oldLines[oldIndex],
        oldLineNum: oldIndex + 1,
        newLineNum: null,
      });
      oldIndex++;
    } else {
      result.push({
        type: "added",
        content: newLines[newIndex],
        oldLineNum: null,
        newLineNum: newIndex + 1,
      });
      newIndex++;
    }
  }
  while (oldIndex < rows) {
    result.push({
      type: "removed",
      content: oldLines[oldIndex],
      oldLineNum: oldIndex + 1,
      newLineNum: null,
    });
    oldIndex++;
  }
  while (newIndex < cols) {
    result.push({
      type: "added",
      content: newLines[newIndex],
      oldLineNum: null,
      newLineNum: newIndex + 1,
    });
    newIndex++;
  }
  return result;
}

function splitDiffRows(lines: DiffLine[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index].type === "unchanged") {
      rows.push({ left: lines[index], right: lines[index] });
      index++;
      continue;
    }

    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (index < lines.length && lines[index].type === "removed") {
      removed.push(lines[index]);
      index++;
    }
    while (index < lines.length && lines[index].type === "added") {
      added.push(lines[index]);
      index++;
    }

    const count = Math.max(removed.length, added.length);
    for (let i = 0; i < count; i++) {
      rows.push({ left: removed[i] ?? null, right: added[i] ?? null });
    }
  }
  return rows;
}

function diffStats(lines: DiffLine[]) {
  return {
    additions: lines.filter((line) => line.type === "added").length,
    deletions: lines.filter((line) => line.type === "removed").length,
  };
}

function dashboardWidgetContent(
  widget: DashboardData["widgets"][number],
): string | null {
  return typeof widget.config.content === "string"
    ? widget.config.content
    : null;
}

function dashboardWidgetLabel(
  widget: DashboardData["widgets"][number],
): string {
  const fileName =
    typeof widget.config.fileName === "string" && widget.config.fileName.trim()
      ? widget.config.fileName
      : widget.title;
  return fileName || "Widget";
}

function checkpointDiffTargets(
  previous: HistoryCheckpoint,
  checkpoint: HistoryCheckpoint,
): DiffTarget[] {
  const targets: DiffTarget[] = [];
  if (previous.content !== checkpoint.content) {
    targets.push({
      label: "Document",
      before: previous.content,
      after: checkpoint.content,
    });
  }

  const previousWidgets = new Map(
    previous.dashboard.widgets.map((widget) => [widget.id, widget]),
  );
  for (const widget of checkpoint.dashboard.widgets) {
    const previousWidget = previousWidgets.get(widget.id);
    if (!previousWidget) continue;
    const before = dashboardWidgetContent(previousWidget);
    const after = dashboardWidgetContent(widget);
    if (before === null || after === null || before === after) continue;
    targets.push({ label: dashboardWidgetLabel(widget), before, after });
  }

  return targets;
}

function checkpointDiffStats(
  previous?: HistoryCheckpoint,
  checkpoint?: HistoryCheckpoint,
) {
  if (!previous || !checkpoint) return { additions: 0, deletions: 0 };
  return checkpointDiffTargets(previous, checkpoint).reduce(
    (total, target) => {
      const stats = diffStats(buildLineDiff(target.before, target.after));
      total.additions += stats.additions;
      total.deletions += stats.deletions;
      return total;
    },
    { additions: 0, deletions: 0 },
  );
}

function DiffModeToggle(
  { value, onChange }: {
    value: DiffViewMode;
    onChange: (value: DiffViewMode) => void;
  },
) {
  const { t: tr } = useI18n();
  return (
    <div className="diff-mode-toggle">
      <button
        type="button"
        className={value === "unified" ? "active" : ""}
        onClick={() => onChange("unified")}
      >
        {tr("history.unified")}
      </button>
      <button
        type="button"
        className={value === "split" ? "active" : ""}
        onClick={() => onChange("split")}
      >
        {tr("history.split")}
      </button>
    </div>
  );
}

function ComparisonFilePicker({
  files,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  onSelect,
}: {
  files: DirectoryFileEntry[];
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matching = files.filter((entry) =>
    !normalizedQuery || entry.path.toLocaleLowerCase().includes(normalizedQuery)
  ).slice(0, 200);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="diff-file-picker" ref={rootRef}>
      <button
        type="button"
        className="diff-file-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <FileText size={15} />
        <span>{selectedPath || placeholder}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="diff-file-picker-popover">
          <label>
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
          <div>
            {matching.length > 0
              ? matching.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  className={entry.path === selectedPath ? "selected" : ""}
                  onClick={() => {
                    setSelectedPath(entry.path);
                    setQuery("");
                    setOpen(false);
                    onSelect(entry.path);
                  }}
                >
                  <FileText size={14} />
                  <span>{entry.path}</span>
                </button>
              ))
              : <p>{emptyLabel}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function UnifiedDiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="history-diff-pre">
      {lines.map((line, index) => {
        const sign = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
        return (
          <div key={index} className={`history-diff-line ${line.type}`}>
            <span className="history-diff-num">{line.oldLineNum ?? ""}</span>
            <span className="history-diff-num">{line.newLineNum ?? ""}</span>
            <span className="history-diff-sign">{sign}</span>
            <span className="history-diff-text">{line.content || " "}</span>
          </div>
        );
      })}
    </pre>
  );
}

function SplitDiffView({ lines }: { lines: DiffLine[] }) {
  const rows = splitDiffRows(lines);
  return (
    <pre className="history-diff-pre split">
      {rows.map((row, index) => (
        <div key={index} className="history-diff-split-row">
          <div className={`history-diff-split-cell ${row.left?.type ?? "empty"}`}>
            {row.left ? (
              <>
                <span className="history-diff-num">{row.left.oldLineNum ?? ""}</span>
                <span className="history-diff-sign">{row.left.type === "removed" ? "-" : " "}</span>
                <span className="history-diff-text">{row.left.content || " "}</span>
              </>
            ) : <span className="history-diff-text"> </span>}
          </div>
          <div className={`history-diff-split-cell ${row.right?.type ?? "empty"}`}>
            {row.right ? (
              <>
                <span className="history-diff-num">{row.right.newLineNum ?? ""}</span>
                <span className="history-diff-sign">{row.right.type === "added" ? "+" : " "}</span>
                <span className="history-diff-text">{row.right.content || " "}</span>
              </>
            ) : <span className="history-diff-text"> </span>}
          </div>
        </div>
      ))}
    </pre>
  );
}

function HistoryDiffPanel({
  checkpoint,
  previous,
  comparisonTarget,
  viewMode,
  onViewModeChange,
}: {
  checkpoint?: HistoryCheckpoint;
  previous?: HistoryCheckpoint;
  comparisonTarget?: DiffTarget | null;
  viewMode: DiffViewMode;
  onViewModeChange: (value: DiffViewMode) => void;
}) {
  const { t: tr } = useI18n();
  if (!comparisonTarget && !checkpoint) {
    return (
      <div className="history-diff-empty">{tr("history.selectCheckpoint")}</div>
    );
  }
  if (!comparisonTarget && !previous) {
    return <div className="history-diff-empty">{tr("history.noPrevious")}</div>;
  }

  const target = comparisonTarget ??
    checkpointDiffTargets(previous!, checkpoint!)[0];
  if (!target) {
    return (
      <section className="history-diff-panel">
        <header className="history-diff-header">
          <div>
            <strong>{tr("history.diff")}</strong>
            <span>{tr("history.noTextChanges")}</span>
          </div>
          <DiffModeToggle value={viewMode} onChange={onViewModeChange} />
        </header>
        <div className="history-diff-empty">{tr("history.noDocumentDiff")}</div>
      </section>
    );
  }

  const lines = buildLineDiff(target.before, target.after);
  const stats = diffStats(lines);
  const hasDiff = stats.additions > 0 || stats.deletions > 0;

  return (
    <section className="history-diff-panel">
      <header className="history-diff-header">
        <div>
          <strong>{tr("history.diff")}</strong>
          <span>
            {target.label}{" "}
            <span className="history-added">+{stats.additions}</span>
            {" / "}
            <span className="history-removed">-{stats.deletions}</span>
          </span>
        </div>
        <DiffModeToggle value={viewMode} onChange={onViewModeChange} />
      </header>
      {!hasDiff
        ? (
          <div className="history-diff-empty">
            {tr("history.noDocumentDiff")}
          </div>
        )
        : viewMode === "split"
        ? <SplitDiffView lines={lines} />
        : <UnifiedDiffView lines={lines} />}
    </section>
  );
}

async function discordBotRequest(
  settings: ChatSettings,
): Promise<DiscordBotRequest | null> {
  const configured = configuredChatProviders(settings);
  const requestedProvider = settings.discord.provider || settings.provider;
  const provider = configured.includes(requestedProvider)
    ? requestedProvider
    : configured[0];
  if (!provider) return null;
  const resolved = switchChatProvider(settings, provider);
  const ragName = settings.discord.ragSetting ?? "";
  const selectedRAG = ragName ? settings.ragSettings[ragName] : undefined;
  const ragSetting = selectedRAG
    ? resolveRAGSetting(resolved, selectedRAG)
    : structuredClone(defaultRAGSetting);
  const skills = await discoverWorkspaceSkills().then(loadActiveSkillContents)
    .catch(() => []);
  return {
    settings: {
      enabled: true,
      botToken: settings.discord.botToken,
      allowedChannelIds: settings.discord.allowedChannelIds,
      allowedUserIds: settings.discord.allowedUserIds,
      model: settings.discord.model,
      systemPrompt: settings.discord.systemPrompt,
      maxResponseLength: settings.discord.maxResponseLength,
      respondToDMs: settings.discord.respondToDMs,
      requireMention: settings.discord.requireMention,
    },
    chat: {
      provider: resolved.provider,
      endpoint: resolved.endpoint,
      apiKey: resolved.apiKey,
      localFramework: resolved.localFramework,
      localUsername: resolved.localUsername,
      localPassword: resolved.localPassword,
      model: settings.discord.model || resolved.model,
      vertexProjectId: resolved.vertexProjectId,
      vertexLocation: resolved.vertexLocation,
      systemPrompt: settings.discord.systemPrompt,
      messages: [],
      enableFileTools: resolved.fileToolMode !== "none",
      fileToolMode: resolved.fileToolMode,
      cliType: resolved.cliType,
      cliPath: resolved.cliPaths[resolved.cliType],
      cliSessionId: "",
      customTools: [getWorkflowSpecTool],
      workflowSpecContext: {
        models: [
          ...new Set(
            configuredChatProviders(settings).flatMap((configuredProvider) =>
              configuredProvider === "cli"
                ? settings.verifiedCliTypes.map((type) => cliNames[type])
                : chatModelChoices[configuredProvider]
            ),
          ),
        ],
        ragSettings: Object.keys(settings.ragSettings),
        mcpServers: settings.mcpServers.filter((server) => server.enabled).map((
          server,
        ) => server.name),
      },
    },
    ragName,
    ragSetting,
    skills: skills.map((skill) => ({
      name: skill.name,
      folderPath: skill.folderPath,
      systemPrompt: buildSkillSystemPrompt([skill]),
      workflows: [...collectSkillWorkflows([skill]).values()].map((entry) => ({
        id: entry.id,
        path: entry.workflowPath,
        description: entry.workflow.description,
        inputVariables: entry.workflow.inputVariables,
      })),
    })),
  };
}

export default function App() {
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>("wysiwyg");
  const [content, setContent] = useState(() =>
    readStored(STORAGE_KEY, initialMarkdown)
  );
  const [fileName, setFileName] = useState(() =>
    readStored(NAME_KEY, "document.md")
  );
  const [dashboard, setDashboard] = useState<DashboardData>(() =>
    readDashboard()
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMode, setHistoryMode] = useState<"history" | "compare">(
    "history",
  );
  const [addWidgetRequest, setAddWidgetRequest] = useState<
    { id: number; direction: EqualizeLayoutDirection; type: string }
  >({ id: 0, direction: "horizontal", type: "file" });
  const [dashboardFiles, setDashboardFiles] = useState<DashboardFileEntry[]>(
    [],
  );
  const [activeDashboardPath, setActiveDashboardPath] = useState("");
  const [homeDashboardPath, setHomeDashboardPath] = useState("");
  const [dashboardRawMode, setDashboardRawMode] = useState(false);
  const [dashboardRaw, setDashboardRaw] = useState(() =>
    serializeDashboard(readDashboard())
  );
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardHistoryVersion, setDashboardHistoryVersion] = useState(0);
  const [activeLayoutDirection, setActiveLayoutDirection] = useState<
    EqualizeLayoutDirection
  >("horizontal");
  const [equalizeLayoutRequest, setEqualizeLayoutRequest] = useState<
    { id: number; direction: EqualizeLayoutDirection }
  >({ id: 0, direction: "horizontal" });
  const [splitWidgetRequest, setSplitWidgetRequest] = useState<
    { id: number; direction: EqualizeLayoutDirection }
  >({ id: 0, direction: "horizontal" });
  const [openFilePickerRequest, setOpenFilePickerRequest] = useState(0);
  const [checkpoints, setCheckpoints] = useState<HistoryCheckpoint[]>([]);
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    | "general"
    | "encryption"
    | "ai"
    | "cli"
    | "rag"
    | "commands"
    | "skills"
    | "mcp"
    | "discord"
    | "plugins"
  >("general");
  const [chatSettings, setChatSettings] = useState(loadChatSettings);
  const [historyEncryption, setHistoryEncryption] = useState(
    historyEncryptionPreferences,
  );
  const [historyEncryptionPassword, setHistoryEncryptionPassword] = useState(
    "",
  );
  const [historyEncryptionStatus, setHistoryEncryptionStatus] = useState("");
  const [historyEncryptionReady, setHistoryEncryptionReady] = useState(
    historyEncryptionConfigured,
  );
  const [encryptionDirectory, setEncryptionDirectory] = useState(() =>
    readStored(ENCRYPTION_DIRECTORY_KEY, "Secrets")
  );
  const [cliStatus, setCLIStatus] = useState("");
  const [mcpStatus, setMCPStatus] = useState<Record<string, string>>({});
  const [ragStatus, setRAGStatus] = useState("");
  const [ragErrors, setRAGErrors] = useState<string[]>([]);
  const [ragBusy, setRAGBusy] = useState(false);
  const [vertexConnected, setVertexConnected] = useState(false);
  const [vertexStatus, setVertexStatus] = useState("");
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus>({
    running: false,
    connected: false,
  });
  const [discordBusy, setDiscordBusy] = useState(false);
  const [activeChatFile, setActiveChatFile] = useState<
    { path: string; content: string } | null
  >(null);
  const [activeChatSelection, setActiveChatSelection] = useState<
    ActiveSelection | null
  >(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(
    null,
  );
  const [historyDiffViewMode, setHistoryDiffViewMode] = useState<DiffViewMode>(
    "split",
  );
  const [comparisonFiles, setComparisonFiles] = useState<DirectoryFileEntry[]>(
    [],
  );
  const [comparisonTarget, setComparisonTarget] = useState<DiffTarget | null>(
    null,
  );
  const [comparisonSource, setComparisonSource] = useState<
    {
      path: string;
      content: string;
    } | null
  >(null);
  const [externalEditorPath, setExternalEditorPath] = useState(() =>
    readStored(EXTERNAL_EDITOR_KEY, "")
  );
  const [memoSyncTimeline, setMemoSyncTimeline] = useState(() => {
    const stored = readStored(MEMO_SYNC_TIMELINE_KEY, "");
    try {
      if (
        localStorage.getItem(MEMO_SYNC_TIMELINE_DEFAULT_MIGRATION_KEY) !== "1"
      ) {
        localStorage.setItem(MEMO_SYNC_TIMELINE_DEFAULT_MIGRATION_KEY, "1");
        return stored.trim() || "Timeline";
      }
    } catch { /* Storage may be unavailable; use the normal fallback. */ }
    return stored;
  });
  const [languageSetting, setLanguageSetting] = useState<LanguageSetting>(
    () => {
      const stored = readStored(LANGUAGE_KEY, "system");
      return stored === "en" || stored === "ja" ? stored : "system";
    },
  );
  const language = resolveLanguage(languageSetting, navigator.language);
  const tr = useCallback((key: keyof TranslationStrings) => t(language, key), [
    language,
  ]);
  const [memoListOpen, setMemoListOpen] = useState(false);
  const [secretManagerOpen, setSecretManagerOpen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [kanbanOpen, setKanbanOpen] = useState(false);
  useEffect(() => {
    if (!secretManagerOpen) return;
    const close = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !document.querySelector(".widget-dialog-backdrop")
      ) {
        setSecretManagerOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [secretManagerOpen]);
  const [openPathRequest, setOpenPathRequest] = useState<
    {
      id: number;
      file: FileRef | null;
      source?:
        | "local"
        | "directory"
        | "filetree"
        | "filetree-created"
        | "memo-list"
        | "startup";
    }
  >({ id: 0, file: null });
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    activeWorkspaceId: "",
    workspaces: [],
  });
  const [directoryBase, setDirectoryBaseState] = useState("");
  const [recentDirectories, setRecentDirectories] = useState(() =>
    parseRecentDirectories(readStored(RECENT_DIRECTORIES_KEY, "[]"))
  );
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const appMenuRef = useRef<HTMLDivElement>(null);
  const [directoryContextLoaded, setDirectoryContextLoaded] = useState(false);
  const [startupPaths, setStartupPaths] = useState<string[] | null>(null);
  const [workspaceContextLoaded, setWorkspaceContextLoaded] = useState(false);
  const [dashboardContextReady, setDashboardContextReady] = useState(false);
  const [aiEnabled, setAIEnabled] = useState(() =>
    readStored(AI_ENABLED_KEY, "true") !== "false"
  );
  const [pluginViewRequest, setPluginViewRequest] = useState(0);
  const [chatOpenRequest, setChatOpenRequest] = useState(0);
  const [chatDraftRequest, setChatDraftRequest] = useState({ id: 0, text: "" });
  const [pluginWidgetRequest, setPluginWidgetRequest] = useState<{
    id: number;
    type: string;
    config: Record<string, unknown>;
  }>({ id: 0, type: "", config: {} });
  const workspacePath =
    workspaceState.workspaces.find((workspace) =>
      workspace.id === workspaceState.activeWorkspaceId
    )?.path || "";
  const handleExternalPathOpened = useCallback(
    (path: string, isDirectory = false) => {
      if (
        !/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path) ||
        pathIsInside(path, workspacePath)
      ) return;
      const directory = isDirectory ? path : parentFilesystemPath(path);
      if (!directory) return;
      if (isDirectory) {
        void setDirectoryBase(directory).then((selected) => {
          setDirectoryBaseState(selected || directory);
        }).catch((error) =>
          alert(error instanceof Error ? error.message : String(error))
        );
      } else setDirectoryBaseState(directory);
    },
    [workspacePath],
  );
  const handleDirectoryBaseUnavailable = useCallback(() => {
    setDirectoryBaseState("");
  }, []);

  const openFilesDirectory = useCallback(async (path?: string) => {
    try {
      const selected = path || await selectDirectoryBase();
      if (!selected) return;
      if (path) await setDirectoryBase(selected);
      setDirectoryBaseState(selected);
      setAppMenuOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  }, []);
  const memoDirPath = workspacePath
    ? `${workspacePath.replace(/[\\/]+$/, "")}/Memos`
    : "";
  const [fileTreeOpen, setFileTreeOpen] = useState(true);
  const [chatViewOpen, setChatViewOpen] = useState(() =>
    readStored(AI_ENABLED_KEY, "true") !== "false"
  );
  const [fileTreeWidth, setFileTreeWidth] = useState(() =>
    readStoredWidth(FILE_TREE_WIDTH_KEY, DEFAULT_FILE_TREE_WIDTH)
  );
  const [chatViewWidth, setChatViewWidth] = useState(() => {
    const stored = readStoredWidth(
      CHAT_VIEW_WIDTH_KEY,
      DEFAULT_CHAT_VIEW_WIDTH,
    );
    return stored === 300 ? DEFAULT_CHAT_VIEW_WIDTH : stored;
  });
  const visibleCheckpoints = uniqueCheckpoints(checkpoints);
  const selectedHistoryCheckpoint =
    visibleCheckpoints.find((item) => item.id === selectedHistoryId) ??
      visibleCheckpoints.at(-1);
  const selectedHistoryPrevious = selectedHistoryCheckpoint
    ? visibleCheckpoints[
      visibleCheckpoints.findIndex((item) =>
        item.id === selectedHistoryCheckpoint.id
      ) - 1
    ]
    : undefined;
  const activeLayoutDirectionRef = useRef<EqualizeLayoutDirection>(
    "horizontal",
  );
  const dashboardPastRef = useRef<DashboardData[]>([]);
  const dashboardFutureRef = useRef<DashboardData[]>([]);
  const loadingDashboardRef = useRef(false);
  const dashboardLastChangeRef = useRef(0);
  const dashboardSaveTimerRef = useRef<number | null>(null);
  const dashboardRawSaveTimerRef = useRef<number | null>(null);
  const discordAutostartRef = useRef(false);
  const projectsLoadedRef = useRef(false);
  const lastCheckpointHashRef = useRef<string>("");
  const latestStateRef = useRef({ fileName, content, dashboard });
  const selectedRAG = chatSettings.selectedRagSetting
    ? chatSettings.ragSettings[chatSettings.selectedRagSetting]
    : undefined;
  useEffect(() =>
    onRAGSyncProgress((progress) => {
      if (progress.name !== chatSettings.selectedRagSetting) return;
      const file = progress.filePath ? ` · ${progress.filePath}` : "";
      setRAGStatus(`Syncing ${progress.processed}/${progress.total}${file}`);
    }), [chatSettings.selectedRagSetting]);
  const discordProviders = configuredChatProviders(chatSettings);
  const preferredDiscordProvider = chatSettings.discord.provider ||
    chatSettings.provider;
  const discordProvider = discordProviders.includes(preferredDiscordProvider)
    ? preferredDiscordProvider
    : discordProviders[0];
  const discordResolvedSettings = discordProvider
    ? switchChatProvider(chatSettings, discordProvider)
    : null;
  const discordModels = discordResolvedSettings?.provider === "cli"
    ? []
    : chatModelChoices[discordResolvedSettings?.provider ?? "openai"];

  const updateDashboard = useCallback(
    (action: SetStateAction<DashboardData>) => {
      setDashboard((current) => {
        const next = typeof action === "function" ? action(current) : action;
        if (JSON.stringify(next) === JSON.stringify(current)) return current;
        const now = Date.now();
        const removedWidget = next.widgets.length < current.widgets.length;
        if (removedWidget || now - dashboardLastChangeRef.current > 700) {
          dashboardPastRef.current = [
            ...dashboardPastRef.current.slice(-49),
            structuredClone(current),
          ];
        }
        dashboardLastChangeRef.current = now;
        dashboardFutureRef.current = [];
        setDashboardHistoryVersion((value) => value + 1);
        return next;
      });
    },
    [],
  );

  const replaceDashboard = useCallback((next: DashboardData, path = "") => {
    loadingDashboardRef.current = true;
    setDashboard(next);
    setDashboardRaw(serializeDashboard(next));
    setDashboardError("");
    setActiveDashboardPath(path);
    setDashboardRawMode(false);
    dashboardPastRef.current = [];
    dashboardFutureRef.current = [];
    dashboardLastChangeRef.current = 0;
    setDashboardHistoryVersion((value) => value + 1);
    window.setTimeout(() => {
      loadingDashboardRef.current = false;
    }, 0);
  }, []);

  const refreshDashboardFiles = useCallback(async () => {
    const files = await listDashboardFiles();
    setDashboardFiles(files);
    return files;
  }, []);

  const openDashboardFile = useCallback(async (path: string) => {
    const dashboardPath = path;
    const loaded = await loadDashboard(path);
    if (!loaded) {
      setDashboardError(`Cannot parse dashboard: ${dashboardPath}`);
      return false;
    }
    replaceDashboard(loaded, dashboardPath);
    if (workspaceState.activeWorkspaceId) {
      localStorage.setItem(
        `gemihub-desktop:last-dashboard:${
          encodeURIComponent(workspaceState.activeWorkspaceId)
        }`,
        dashboardPath,
      );
    }
    return true;
  }, [workspaceState.activeWorkspaceId, replaceDashboard]);

  const undoDashboard = useCallback(() => {
    const previous = dashboardPastRef.current.at(-1);
    if (!previous) return;
    setDashboard((current) => {
      dashboardFutureRef.current = [
        ...dashboardFutureRef.current,
        structuredClone(current),
      ];
      return structuredClone(previous);
    });
    dashboardPastRef.current = dashboardPastRef.current.slice(0, -1);
    setDashboardHistoryVersion((value) => value + 1);
  }, []);

  const redoDashboard = useCallback(() => {
    const next = dashboardFutureRef.current.at(-1);
    if (!next) return;
    setDashboard((current) => {
      dashboardPastRef.current = [
        ...dashboardPastRef.current,
        structuredClone(current),
      ];
      return structuredClone(next);
    });
    dashboardFutureRef.current = dashboardFutureRef.current.slice(0, -1);
    setDashboardHistoryVersion((value) => value + 1);
  }, []);

  const handleActiveDashboardFileChange = useCallback(
    (file: { path: string; content: string } | null) => {
      const nextFile = file ??
        (activeDashboardPath
          ? {
            path: activeDashboardPath,
            content: serializeDashboard(persistenceDashboard(dashboard)),
          }
          : null);
      setActiveChatFile(nextFile);
      setActiveChatSelection((current) =>
        current?.path === nextFile?.path ? current : null
      );
    },
    [activeDashboardPath, dashboard],
  );

  const applyWorkspaceState = useCallback((state: WorkspaceState) => {
    setWorkspaceState(state);
  }, []);

  const prepareProjectChange = useCallback(() => {
    if (dashboardSaveTimerRef.current !== null) {
      window.clearTimeout(dashboardSaveTimerRef.current);
    }
    if (dashboardRawSaveTimerRef.current !== null) {
      window.clearTimeout(dashboardRawSaveTimerRef.current);
    }
    dashboardSaveTimerRef.current = null;
    dashboardRawSaveTimerRef.current = null;
  }, []);

  const changeProjectDirectory = useCallback(async (path: string) => {
    prepareProjectChange();
    try {
      const state = await setWorkspaceDirectory(path);
      applyWorkspaceState(state);
      window.dispatchEvent(new Event("llm-hub:workspace-changed"));
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
    } catch (error) {
      setDashboardError(error instanceof Error ? error.message : String(error));
    }
  }, [applyWorkspaceState, prepareProjectChange]);

  useEffect(() => {
    if (projectsLoadedRef.current) return;
    projectsLoadedRef.current = true;
    void (async () => {
      applyWorkspaceState(await getWorkspaceState());
    })().catch((error) => {
      setDashboardError(error instanceof Error ? error.message : String(error));
    }).finally(() => setWorkspaceContextLoaded(true));
  }, [applyWorkspaceState]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    saveChatSettings(chatSettings);
  }, [chatSettings]);

  useEffect(() => {
    if (!aiEnabled) return;
    if (discordAutostartRef.current) return;
    discordAutostartRef.current = true;
    if (!chatSettings.discord.enabled || !chatSettings.discord.botToken) return;
    setDiscordBusy(true);
    void discordBotRequest(chatSettings).then((request) => {
      if (!request) {
        throw new Error("Configure an AI provider before connecting Discord.");
      }
      return startDiscordBot(request);
    }).then(setDiscordStatus).catch((error) => {
      setDiscordStatus({
        running: false,
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      });
      setChatSettings((current) => ({
        ...current,
        discord: { ...current.discord, enabled: false },
      }));
    }).finally(() => setDiscordBusy(false));
  }, [aiEnabled, chatSettings]);

  useEffect(() => {
    if (
      !chatSettings.discord.enabled || !settingsOpen ||
      settingsSection !== "discord"
    ) return;
    const refresh = () =>
      void getDiscordStatus().then((next) =>
        setDiscordStatus((current) => (
          current.running === next.running &&
            current.connected === next.connected &&
            current.username === next.username &&
            current.error === next.error &&
            current.lastEvent === next.lastEvent
            ? current
            : next
        ))
      ).catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [chatSettings.discord.enabled, settingsOpen, settingsSection]);

  useEffect(() => {
    const needsVertexStatus = (settingsSection === "rag" &&
      selectedRAG?.embeddingProvider === "vertex") ||
      (settingsSection === "ai" && chatSettings.provider === "vertex");
    if (!settingsOpen || !needsVertexStatus) return;
    void getVertexOAuthStatus().then((status) => {
      setVertexConnected(status.connected);
      setVertexStatus(
        status.connected ? "Google account connected" : "Not connected",
      );
    }).catch((error) =>
      setVertexStatus(error instanceof Error ? error.message : String(error))
    );
  }, [
    settingsOpen,
    settingsSection,
    selectedRAG?.embeddingProvider,
    chatSettings.provider,
  ]);

  useEffect(() => {
    if (!historyOpen) return;
    if (
      !selectedHistoryId ||
      !visibleCheckpoints.some((item) => item.id === selectedHistoryId)
    ) {
      setSelectedHistoryId(visibleCheckpoints.at(-1)?.id ?? null);
    }
  }, [historyOpen, selectedHistoryId, visibleCheckpoints]);

  useEffect(() => {
    try {
      localStorage.setItem(EXTERNAL_EDITOR_KEY, externalEditorPath);
    } catch (error) {
      console.warn("Could not persist external editor path.", error);
    }
  }, [externalEditorPath]);

  useEffect(() => {
    try {
      localStorage.setItem(MEMO_SYNC_TIMELINE_KEY, memoSyncTimeline);
    } catch (error) {
      console.warn("Could not persist memo Timeline sync setting.", error);
    }
  }, [memoSyncTimeline]);

  useEffect(() => {
    try {
      localStorage.setItem(
        ENCRYPTION_DIRECTORY_KEY,
        encryptionDirectory.trim().replace(/^\/+|\/+$/g, "") || "Secrets",
      );
    } catch (error) {
      console.warn("Could not persist encryption directory.", error);
    }
  }, [encryptionDirectory]);

  useEffect(() => {
    localStorage.setItem(AI_ENABLED_KEY, String(aiEnabled));
    if (aiEnabled) return;
    discordAutostartRef.current = false;
    setChatViewOpen(false);
    if (discordStatus.running) {
      void stopDiscordBot().then(() =>
        setDiscordStatus((current) => ({
          ...current,
          running: false,
          connected: false,
        }))
      ).catch(() => undefined);
    }
  }, [aiEnabled, discordStatus.running]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getDirectoryBase(), startupFilePaths()]).then(
      async ([startupDirectory, paths]) => {
        if (cancelled) return;
        if (paths.length > 0) {
          setFileTreeOpen(false);
          setChatViewOpen(false);
        }
        const startupFile = paths[0] || "";
        const separator = Math.max(
          startupFile.lastIndexOf("/"),
          startupFile.lastIndexOf("\\"),
        );
        const associatedDirectory = separator >= 0
          ? startupFile.slice(0, separator)
          : "";
        const initialDirectory = associatedDirectory || startupDirectory ||
          readStored(LAST_OPENED_DIRECTORY_KEY, "");
        // Dashboard widgets mount as soon as this state is published. Ensure the
        // The backend resolves Files-scoped paths against the same directory first,
        // otherwise a restored binary document can be read from stale startup
        // context and only work after the widget is reopened.
        if (initialDirectory) await setDirectoryBase(initialDirectory);
        if (cancelled) return;
        setDirectoryBaseState(initialDirectory);
        setStartupPaths(paths);
        setDirectoryContextLoaded(true);
      },
    ).catch(() => {
      if (!cancelled) {
        setStartupPaths([]);
        setDirectoryContextLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const requireProject = () => {
      setSettingsSection("general");
      setSettingsOpen(true);
    };
    window.addEventListener("llm-hub:workspace-required", requireProject);
    return () =>
      window.removeEventListener("llm-hub:workspace-required", requireProject);
  }, []);

  useEffect(() => {
    if (!directoryContextLoaded) return;
    localStorage.setItem(LAST_OPENED_DIRECTORY_KEY, directoryBase);
    void setDirectoryBase(directoryBase).catch((error) =>
      console.warn("Could not set the opened file directory.", error)
    );
  }, [directoryBase, directoryContextLoaded]);

  useEffect(() => {
    if (!directoryContextLoaded || !workspaceContextLoaded || !directoryBase) {
      return;
    }
    if (
      workspacePath &&
      (pathIsInside(directoryBase, workspacePath) ||
        pathIsInside(workspacePath, directoryBase))
    ) return;
    setRecentDirectories((current) => {
      const next = updateRecentDirectories(current, directoryBase);
      localStorage.setItem(RECENT_DIRECTORIES_KEY, JSON.stringify(next));
      return next;
    });
  }, [
    workspacePath,
    directoryBase,
    directoryContextLoaded,
    workspaceContextLoaded,
  ]);

  useEffect(() => {
    if (!appMenuOpen) return;
    const close = (event: PointerEvent) => {
      if (!appMenuRef.current?.contains(event.target as Node)) {
        setAppMenuOpen(false);
      }
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAppMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", keydown);
    };
  }, [appMenuOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, languageSetting);
    } catch (error) {
      console.warn("Could not persist language setting.", error);
    }
  }, [languageSetting]);

  useEffect(() => {
    let cancelled = false;
    if (!directoryContextLoaded || startupPaths === null) return;
    if (startupPaths.length > 0) {
      // Show the associated file immediately in the lightweight default
      // dashboard. Load the persisted Workspace dashboard in the background,
      // then re-apply the file to its existing FileWidget.
      setDashboardContextReady(true);
      if (!workspaceContextLoaded || !workspaceState.activeWorkspaceId) return;
      void (async () => {
        const files = await listDashboardFiles();
        if (cancelled) return;
        setDashboardFiles(files);
        const homeKey = `gemihub-desktop:home-dashboard:${
          encodeURIComponent(workspaceState.activeWorkspaceId)
        }`;
        const lastKey = `gemihub-desktop:last-dashboard:${
          encodeURIComponent(workspaceState.activeWorkspaceId)
        }`;
        const preferred = localStorage.getItem(lastKey) ||
          localStorage.getItem(homeKey);
        const target = files.find((file) => file.path === preferred)?.path ||
          files[0]?.path;
        setHomeDashboardPath(target || "");
        if (target) await openDashboardFile(target);
        else {
          const path = "Dashboards/home.dashboard";
          const data = defaultDashboard();
          await saveDashboard(path, data);
          if (cancelled) return;
          setDashboardFiles(await listDashboardFiles());
          replaceDashboard(data, path);
          localStorage.setItem(homeKey, path);
          setHomeDashboardPath(path);
        }
        if (!cancelled) {
          setOpenPathRequest((current) => ({
            id: current.id + 1,
            file: fileRef("absolute", startupPaths[0]),
            source: "startup",
          }));
        }
      })().catch((error) => {
        if (!cancelled) {
          setDashboardError(
            error instanceof Error ? error.message : String(error),
          );
        }
      });
      return () => {
        cancelled = true;
      };
    }
    if (!workspaceContextLoaded) return;
    setDashboardContextReady(false);
    setActiveDashboardPath("");
    setHomeDashboardPath("");
    setDashboardFiles([]);
    setActiveChatFile(null);
    setDashboardRawMode(false);
    replaceDashboard(defaultDashboard(), "");
    if (!workspaceState.activeWorkspaceId) {
      setDashboardContextReady(true);
      return;
    }
    void (async () => {
      const files = await listDashboardFiles();
      if (cancelled) return;
      setDashboardFiles(files);
      const homeKey = `gemihub-desktop:home-dashboard:${
        encodeURIComponent(workspaceState.activeWorkspaceId)
      }`;
      const lastKey = `gemihub-desktop:last-dashboard:${
        encodeURIComponent(workspaceState.activeWorkspaceId)
      }`;
      const preferred = localStorage.getItem(lastKey) ||
        localStorage.getItem(homeKey);
      const target = files.find((file) => file.path === preferred)?.path ||
        files[0]?.path;
      setHomeDashboardPath(target || "");
      if (target) await openDashboardFile(target);
      else {
        const path = "Dashboards/home.dashboard";
        const data = defaultDashboard();
        await saveDashboard(path, data);
        if (cancelled) return;
        setDashboardFiles(await listDashboardFiles());
        replaceDashboard(data, path);
        localStorage.setItem(homeKey, path);
        setHomeDashboardPath(path);
      }
      if (!cancelled) setDashboardContextReady(true);
    })().catch((error) => {
      if (!cancelled) {
        setDashboardError(
          error instanceof Error ? error.message : String(error),
        );
        setDashboardContextReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    workspacePath,
    directoryContextLoaded,
    workspaceContextLoaded,
    workspaceState.activeWorkspaceId,
    openDashboardFile,
    replaceDashboard,
    startupPaths,
  ]);

  useEffect(() => {
    if (
      !activeDashboardPath || loadingDashboardRef.current || dashboardRawMode
    ) return;
    const id = window.setTimeout(() => {
      void saveDashboard(activeDashboardPath, persistenceDashboard(dashboard))
        .then(() => {
          if (!dashboardRawMode) {
            setDashboardRaw(
              serializeDashboard(persistenceDashboard(dashboard)),
            );
          }
          setSavedAt(new Date());
        }).catch((error) =>
          setDashboardError(
            error instanceof Error ? error.message : String(error),
          )
        );
    }, 450);
    dashboardSaveTimerRef.current = id;
    return () => {
      window.clearTimeout(id);
      if (dashboardSaveTimerRef.current === id) {
        dashboardSaveTimerRef.current = null;
      }
    };
  }, [activeDashboardPath, dashboard, dashboardRawMode]);

  useEffect(() => {
    if (!dashboardRawMode || !activeDashboardPath) return;
    const id = window.setTimeout(() => {
      const parsed = parseDashboard(dashboardRaw);
      if (!parsed) {
        setDashboardError("Cannot parse this dashboard YAML.");
        return;
      }
      setDashboard(parsed);
      void writeWorkspaceFile(activeDashboardPath, dashboardRaw).then(() => {
        setSavedAt(new Date());
        setDashboardError("");
        window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
      }).catch((error) =>
        setDashboardError(
          error instanceof Error ? error.message : String(error),
        )
      );
    }, 500);
    dashboardRawSaveTimerRef.current = id;
    return () => {
      window.clearTimeout(id);
      if (dashboardRawSaveTimerRef.current === id) {
        dashboardRawSaveTimerRef.current = null;
      }
    };
  }, [activeDashboardPath, dashboardRaw, dashboardRawMode]);

  useEffect(() => {
    if (dashboardRawMode && activeDashboardPath) {
      setActiveChatFile({ path: activeDashboardPath, content: dashboardRaw });
    }
  }, [activeDashboardPath, dashboardRaw, dashboardRawMode]);

  useEffect(() => {
    localStorage.setItem(FILE_TREE_WIDTH_KEY, String(fileTreeWidth));
  }, [fileTreeWidth]);

  useEffect(() => {
    localStorage.setItem(CHAT_VIEW_WIDTH_KEY, String(chatViewWidth));
  }, [chatViewWidth]);

  const beginPaneResize = useCallback(
    (side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = side === "left" ? fileTreeWidth : chatViewWidth;
      document.body.classList.add("resizing-side-pane");

      const onMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - startX;
        const desired = side === "left"
          ? startWidth + delta
          : startWidth - delta;
        const otherWidth = side === "left"
          ? (chatViewOpen ? chatViewWidth : 36)
          : (fileTreeOpen ? fileTreeWidth : 36);
        const viewportLimit = Math.max(
          side === "left" ? 180 : 220,
          window.innerWidth - otherWidth - 380,
        );
        if (side === "left") {
          setFileTreeWidth(
            Math.max(180, Math.min(viewportLimit, desired)),
          );
        } else {setChatViewWidth(
            Math.max(220, Math.min(viewportLimit, desired)),
          );}
      };
      const finish = () => {
        document.body.classList.remove("resizing-side-pane");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [chatViewOpen, chatViewWidth, fileTreeOpen, fileTreeWidth],
  );

  useEffect(() => {
    latestStateRef.current = { fileName, content, dashboard };
  }, [fileName, content, dashboard]);

  const addCheckpoint = useCallback((reason: CheckpointReason) => {
    const latest = latestStateRef.current;
    const hash = checkpointHash(
      latest.fileName,
      latest.content,
      latest.dashboard,
    );
    if (hash === lastCheckpointHashRef.current) return false;

    lastCheckpointHashRef.current = hash;
    const checkpoint: HistoryCheckpoint = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      reason,
      fileName: latest.fileName,
      content: persistenceContent(latest.fileName, latest.content),
      dashboard: historyDashboard(latest.dashboard),
    };

    setCheckpoints((items) => {
      const previous = items.at(-1);
      if (
        previous &&
        checkpointHash(
            previous.fileName,
            previous.content,
            previous.dashboard,
          ) === hash
      ) return items;
      return [...items.slice(-99), checkpoint];
    });
    return true;
  }, []);

  useEffect(() => {
    addCheckpoint("initial");
  }, [addCheckpoint]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      persistLocalState(fileName, content);
      setSavedAt(new Date());
    }, 250);

    return () => window.clearTimeout(id);
  }, [content, fileName]);

  useEffect(() => {
    try {
      localStorage.setItem(
        DASHBOARD_STORAGE_KEY,
        JSON.stringify(persistenceDashboard(dashboard)),
      );
    } catch (error) {
      console.warn("Could not persist dashboard.", error);
    }
  }, [dashboard]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      addCheckpoint("idle");
    }, 3500);

    return () => window.clearTimeout(id);
  }, [content, fileName, dashboard, addCheckpoint]);

  useEffect(() => {
    const onBlur = () => {
      addCheckpoint("blur");
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [addCheckpoint]);

  const newDocument = useCallback(() => {
    if (content.trim() && !confirm(tr("app.newDocumentConfirm"))) return;
    setContent("# Untitled\n\n");
    setFileName("untitled.md");
    setMarkdownMode("wysiwyg");
  }, [content, tr]);

  const saveDocument = useCallback(() => {
    persistLocalState(fileName, content, dashboard);
    addCheckpoint("manual");
    setSavedAt(new Date());
  }, [content, fileName, dashboard, addCheckpoint]);

  const exportDocument = useCallback(() => {
    downloadFile(fileName, content);
  }, [content, fileName]);

  const restoreCheckpoint = useCallback((checkpoint: HistoryCheckpoint) => {
    const currentHash = checkpointHash(fileName, content, dashboard);
    const targetHash = checkpointHash(
      checkpoint.fileName,
      checkpoint.content,
      checkpoint.dashboard,
    );
    if (currentHash === targetHash) {
      setHistoryOpen(false);
      return;
    }

    addCheckpoint("restore");
    setFileName(checkpoint.fileName);
    setContent(checkpoint.content);
    setDashboard(structuredClone(checkpoint.dashboard));
    setHistoryOpen(false);
    window.setTimeout(() => addCheckpoint("restore"), 0);
  }, [addCheckpoint, content, dashboard, fileName]);

  const requestHistoryCheckpoint = useCallback((reason: CheckpointReason) => {
    addCheckpoint(reason);
  }, [addCheckpoint]);

  const requestDeferredHistoryCheckpoint = useCallback(
    (reason: CheckpointReason) => {
      window.setTimeout(() => addCheckpoint(reason), 0);
    },
    [addCheckpoint],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        event.stopPropagation();
        void openDeveloperTools();
        return;
      }
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveDocument();
      }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        exportDocument();
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        newDocument();
      }
    };

    const onMenu = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id === "new") newDocument();
      if (id === "open") setOpenFilePickerRequest((value) => value + 1);
      if (id === "save") saveDocument();
      if (id === "export") exportDocument();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mdwys-menu", onMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mdwys-menu", onMenu);
    };
  }, [exportDocument, newDocument, saveDocument]);

  return (
    <I18nProvider language={language}>
      <main className="app-shell">
        <header className="topbar">
          <div className="document-meta" ref={appMenuRef}>
            <button
              type="button"
              className="app-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={appMenuOpen}
              onClick={() => setAppMenuOpen((open) => !open)}
            >
              <LayoutDashboard size={18} aria-hidden="true" />
              <strong className="app-title">{APP_NAME}</strong>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            {appMenuOpen && (
              <div className="app-menu-popover" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void openFilesDirectory()}
                >
                  <FolderOpen size={16} />
                  <span>{tr("appMenu.openDirectory")}</span>
                </button>
                {recentDirectories.length > 0 && (
                  <section className="app-menu-recent">
                    <strong>{tr("appMenu.recent")}</strong>
                    {recentDirectories.map((path) => (
                      <button
                        type="button"
                        role="menuitem"
                        key={path}
                        title={path}
                        onClick={() => void openFilesDirectory(path)}
                      >
                        <FolderOpen size={15} />
                        <span>
                          <b>
                            {path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ||
                              path}
                          </b>
                          <small>{path}</small>
                        </span>
                      </button>
                    ))}
                  </section>
                )}
                <div className="app-menu-separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPluginViewRequest((value) => value + 1);
                    setChatViewOpen(true);
                    setAppMenuOpen(false);
                  }}
                >
                  <Plug size={16} />
                  <span>{tr("appMenu.plugins")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLauncherOpen(true);
                    setAppMenuOpen(false);
                  }}
                >
                  <LayoutGrid size={16} />
                  <span>{tr("topbar.launcher")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSecretManagerOpen(true);
                    setAppMenuOpen(false);
                  }}
                >
                  <KeyRound size={16} />
                  <span>{tr("topbar.secretManager")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsDark((value) => !value);
                    setAppMenuOpen(false);
                  }}
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                  <span>{tr("topbar.toggleTheme")}</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSettingsOpen(true);
                    setAppMenuOpen(false);
                  }}
                >
                  <Settings size={16} />
                  <span>{tr("topbar.settings")}</span>
                </button>
              </div>
            )}
          </div>

          <div className="global-toolbar">
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                setPluginViewRequest((value) => value + 1);
                setChatViewOpen(true);
              }}
              title="Plugins"
            >
              <Plug size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setLauncherOpen(true)}
              title={tr("topbar.launcher")}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSecretManagerOpen(true)}
              title={tr("topbar.secretManager")}
            >
              <KeyRound size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setIsDark((value) => !value)}
              title={tr("topbar.toggleTheme")}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSettingsOpen(true)}
              title={tr("topbar.settings")}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        <section
          className={`ide-frame ${
            timelineOpen || calendarOpen || kanbanOpen ? "tool-modal-open" : ""
          }`}
          aria-hidden={timelineOpen || calendarOpen || kanbanOpen}
          style={{
            gridTemplateColumns: [
              `${fileTreeOpen ? fileTreeWidth : 36}px`,
              ...(fileTreeOpen ? ["5px"] : []),
              "minmax(0, 1fr)",
              ...(chatViewOpen ? ["5px"] : []),
              ...(chatViewOpen
                ? [`${chatViewWidth}px`]
                : aiEnabled
                ? ["36px"]
                : []),
            ].join(" "),
          }}
        >
          {fileTreeOpen && (
            <FileTree
              directoryBase={directoryBase}
              workspacePath={workspacePath}
              onDirectoryBaseUnavailable={handleDirectoryBaseUnavailable}
              onOpenFile={(file, created) => {
                if (
                  file.scope === "workspace" &&
                  file.path.toLowerCase().endsWith(".dashboard")
                ) void openDashboardFile(file.path);
                else {setOpenPathRequest((value) => ({
                    id: value.id + 1,
                    file,
                    source: created ? "filetree-created" : "filetree",
                  })
                  );}
              }}
              onCollapse={() => setFileTreeOpen(false)}
            />
          )}
          {!fileTreeOpen && (
            <aside className="side-rail left">
              <button
                type="button"
                onClick={() => setFileTreeOpen(true)}
                title="Expand FileTree"
              >
                <ChevronsRight size={18} />
              </button>
            </aside>
          )}
          {fileTreeOpen && (
            <div
              className="pane-resizer"
              role="separator"
              aria-label="Resize FileTree"
              aria-orientation="vertical"
              onPointerDown={(event) => beginPaneResize("left", event)}
              onDoubleClick={() => setFileTreeWidth(DEFAULT_FILE_TREE_WIDTH)}
            />
          )}
          <section className="editor-frame">
            <DashboardToolbar
              files={dashboardFiles}
              activePath={activeDashboardPath}
              homePath={homeDashboardPath}
              rawMode={dashboardRawMode}
              canUndo={dashboardHistoryVersion >= 0 &&
                dashboardPastRef.current.length > 0}
              canRedo={dashboardHistoryVersion >= 0 &&
                dashboardFutureRef.current.length > 0}
              activeLayoutDirection={activeLayoutDirection}
              onSelect={(path) => void openDashboardFile(path)}
              onCreate={async (name) => {
                try {
                  const created = await createDashboard(name);
                  await refreshDashboardFiles();
                  replaceDashboard(created.data, created.path);
                } catch (error) {
                  setDashboardError(
                    error instanceof Error ? error.message : String(error),
                  );
                  throw error;
                }
              }}
              onRename={(name) => {
                const previous = activeDashboardPath;
                void renameDashboard(previous, name).then(async (path) => {
                  setActiveDashboardPath(path);
                  if (homeDashboardPath === previous) {
                    const key = `gemihub-desktop:home-dashboard:${
                      encodeURIComponent(workspaceState.activeWorkspaceId)
                    }`;
                    localStorage.setItem(key, path);
                    setHomeDashboardPath(path);
                  }
                  await refreshDashboardFiles();
                }).catch((error) =>
                  setDashboardError(
                    error instanceof Error ? error.message : String(error),
                  )
                );
              }}
              onDelete={() => {
                if (
                  !confirm("Delete this dashboard? This cannot be undone.")
                ) return;
                const removing = activeDashboardPath;
                void removeDashboard(removing).then(async () => {
                  const files = await refreshDashboardFiles();
                  const next = files.find((file) => file.path !== removing) ||
                    files[0];
                  if (next) {
                    if (homeDashboardPath === removing) {
                      const key = `gemihub-desktop:home-dashboard:${
                        encodeURIComponent(workspaceState.activeWorkspaceId)
                      }`;
                      localStorage.setItem(key, next.path);
                      setHomeDashboardPath(next.path);
                    }
                    await openDashboardFile(next.path);
                  } else replaceDashboard(defaultDashboard(), "");
                }).catch((error) =>
                  setDashboardError(
                    error instanceof Error ? error.message : String(error),
                  )
                );
              }}
              onSetHome={() => {
                if (!activeDashboardPath) return;
                const key = `gemihub-desktop:home-dashboard:${
                  encodeURIComponent(workspaceState.activeWorkspaceId)
                }`;
                localStorage.setItem(key, activeDashboardPath);
                setHomeDashboardPath(activeDashboardPath);
              }}
              onUndo={undoDashboard}
              onRedo={redoDashboard}
              onLayoutDirection={(direction) => {
                if (direction !== activeLayoutDirectionRef.current) {
                  activeLayoutDirectionRef.current = direction;
                  setActiveLayoutDirection(direction);
                  return;
                }
                setEqualizeLayoutRequest((value) => ({
                  id: value.id + 1,
                  direction,
                }));
              }}
              onAddWidget={() =>
                setAddWidgetRequest((value) => ({
                  id: value.id + 1,
                  direction: activeLayoutDirectionRef.current,
                  type: "palette",
                }))}
              onToggleRaw={() => {
                if (!dashboardRawMode) {
                  setDashboardRaw(
                    serializeDashboard(persistenceDashboard(dashboard)),
                  );
                  setDashboardError("");
                  setDashboardRawMode(true);
                  return;
                }
                const parsed = parseDashboard(dashboardRaw);
                if (!parsed) {
                  setDashboardError("Cannot parse this dashboard YAML.");
                  return;
                }
                updateDashboard(parsed);
                setDashboardRawMode(false);
                setDashboardError("");
              }}
            />
            {dashboardRawMode
              ? (
                <div className="dashboard-raw-editor">
                  <header>
                    <strong>{activeDashboardPath || "Local dashboard"}</strong>
                    <span>
                      GemiHub .dashboard YAML · unknown keys are preserved
                    </span>
                  </header>
                  <textarea
                    value={dashboardRaw}
                    onChange={(event) => setDashboardRaw(event.target.value)}
                    spellCheck={false}
                  />
                  {dashboardError && (
                    <div className="dashboard-file-error">{dashboardError}</div>
                  )}
                </div>
              )
              : (
                <DashboardView
                  data={dashboard}
                  onChange={updateDashboard}
                  documentMarkdown={content}
                  onDocumentMarkdownChange={setContent}
                  markdownMode={markdownMode}
                  onMarkdownModeChange={setMarkdownMode}
                  fileName={fileName}
                  onFileNameChange={setFileName}
                  onNewDocument={newDocument}
                  onExportDocument={exportDocument}
                  onHistoryClick={(source) => {
                    setHistoryMode("history");
                    setComparisonSource(source ?? null);
                    setComparisonTarget(null);
                    setHistoryOpen(true);
                  }}
                  onDiffClick={(source) => {
                    setHistoryMode("compare");
                    setComparisonSource(source);
                    setComparisonTarget(null);
                    setComparisonFiles([]);
                    setHistoryOpen(true);
                    void listWorkspaceFiles().then((files) =>
                      setComparisonFiles(files.filter((entry) => !entry.binary))
                    );
                  }}
                  isDark={isDark}
                  aiEnabled={aiEnabled}
                  addWidgetRequest={addWidgetRequest}
                  activeLayoutDirection={activeLayoutDirection}
                  equalizeLayoutRequest={equalizeLayoutRequest}
                  splitWidgetRequest={splitWidgetRequest}
                  openFilePickerRequest={openFilePickerRequest}
                  externalEditorPath={externalEditorPath}
                  memoDirPath={memoDirPath}
                  memoSyncTimeline={memoSyncTimeline}
                  encryptionDirectory={encryptionDirectory.trim().replace(
                    /^\/+|\/+$/g,
                    "",
                  ) ||
                    "Secrets"}
                  secretManagerId={`workspace:${
                    workspaceState.activeWorkspaceId || "local"
                  }`}
                  onOpenDashboard={openDashboardFile}
                  onOpenSettings={() => setSettingsOpen(true)}
                  openPathRequest={openPathRequest}
                  onHistoryCheckpoint={requestHistoryCheckpoint}
                  onDeferredHistoryCheckpoint={requestDeferredHistoryCheckpoint}
                  onActiveFileChange={handleActiveDashboardFileChange}
                  onActiveSelectionChange={setActiveChatSelection}
                  onAskAI={(selection) => {
                    setActiveChatSelection(selection);
                    setChatViewOpen(true);
                    setChatOpenRequest((value) => value + 1);
                  }}
                  onAskMemoAI={(draft) => {
                    setChatDraftRequest((current) => ({
                      id: current.id + 1,
                      text: draft,
                    }));
                    setChatViewOpen(true);
                    setChatOpenRequest((value) => value + 1);
                  }}
                  chatSettings={chatSettings}
                  directoryBase={workspacePath}
                  workspaceBase={directoryBase}
                  dashboardPath={activeDashboardPath}
                  startupPaths={dashboardContextReady ? startupPaths : null}
                  pluginWidgetRequest={pluginWidgetRequest}
                  onExternalPathOpened={handleExternalPathOpened}
                />
              )}
            {!dashboardRawMode && dashboardError && (
              <div className="dashboard-file-error floating">
                {dashboardError}
                <button type="button" onClick={() => setDashboardError("")}>
                  <X size={12} />
                </button>
              </div>
            )}
          </section>
          {chatViewOpen && (
            <div
              className="pane-resizer"
              role="separator"
              aria-label="Resize ChatView"
              aria-orientation="vertical"
              onPointerDown={(event) => beginPaneResize("right", event)}
              onDoubleClick={() => setChatViewWidth(DEFAULT_CHAT_VIEW_WIDTH)}
            />
          )}
          {chatViewOpen
            ? (
              <PluginHost
                directoryBase={directoryBase}
                workspaceBase={workspacePath}
                language={language}
                isDark={isDark}
                aiEnabled={aiEnabled}
                pluginViewRequest={pluginViewRequest}
                chatOpenRequest={chatOpenRequest}
                chatDraftRequest={chatDraftRequest}
                settingsOpen={settingsOpen && settingsSection === "plugins"}
                onCollapse={() => setChatViewOpen(false)}
                onOpenPluginView={() => {
                  setSettingsOpen(false);
                  setChatViewOpen(true);
                }}
                onOpenPluginWidget={(request) => {
                  setDashboardRawMode(false);
                  setPluginWidgetRequest((current) => ({
                    id: current.id + 1,
                    type: request.type,
                    config: request.config,
                  }));
                }}
                onOpenPluginSettings={() => {
                  setSettingsSection("plugins");
                  setSettingsOpen(true);
                }}
                chatSettings={chatSettings}
                onChatSettingsChange={setChatSettings}
                activeFile={activeChatFile}
                activeSelection={activeChatSelection}
                onOpenChatSettings={() => {
                  setSettingsSection(
                    chatSettings.provider === "cli" ? "cli" : "ai",
                  );
                  setSettingsOpen(true);
                }}
                onOpenRAGSettings={() => {
                  setSettingsSection("rag");
                  setSettingsOpen(true);
                }}
                onOpenFile={(file) => {
                  if (
                    file.scope === "workspace" &&
                    file.path.toLowerCase().endsWith(".dashboard")
                  ) void openDashboardFile(file.path);
                  else {setOpenPathRequest((value) => ({
                      id: value.id + 1,
                      file,
                      source: "directory",
                    })
                    );}
                }}
              />
            )
            : aiEnabled
            ? (
              <aside className="side-rail right">
                <button
                  type="button"
                  onClick={() => setChatViewOpen(true)}
                  title="Expand ChatView"
                >
                  <ChevronsLeft size={18} />
                </button>
                <span>Chat</span>
              </aside>
            )
            : null}
        </section>

        {launcherOpen && (
          <div
            className="app-tool-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setLauncherOpen(false);
            }}
          >
            <section className="app-launcher-modal">
              <header>
                <strong>{tr("topbar.launcher")}</strong>
                <button
                  type="button"
                  onClick={() => setLauncherOpen(false)}
                  title={tr("common.close")}
                >
                  <X size={18} />
                </button>
              </header>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setLauncherOpen(false);
                    setMemoListOpen(true);
                  }}
                >
                  <NotebookText size={24} />
                  <strong>{tr("topbar.memoList")}</strong>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLauncherOpen(false);
                    setTimelineOpen(true);
                  }}
                >
                  <Rows2 size={24} />
                  <strong>{tr("topbar.timeline")}</strong>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLauncherOpen(false);
                    setCalendarOpen(true);
                  }}
                >
                  <CalendarDays size={24} />
                  <strong>{tr("topbar.calendar")}</strong>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLauncherOpen(false);
                    setKanbanOpen(true);
                  }}
                >
                  <Columns2 size={24} />
                  <strong>{tr("topbar.kanban")}</strong>
                </button>
              </div>
            </section>
          </div>
        )}

        {memoListOpen && (
          <MemoListModal
            memoDirPath={memoDirPath}
            onOpenFile={(path) => {
              setOpenPathRequest((value) => ({
                id: value.id + 1,
                file: fileRefFromBackendPath(path),
                source: "memo-list",
              }));
              setMemoListOpen(false);
            }}
            onClose={() => setMemoListOpen(false)}
          />
        )}

        {timelineOpen && (
          <div
            className="app-tool-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setTimelineOpen(false);
            }}
          >
            <section className="app-timeline-modal">
              <header className="memo-list-header">
                <strong>{tr("topbar.timeline")}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setTimelineOpen(false)}
                  title={tr("common.close")}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="app-timeline-body">
                <TimelineDashboardWidget
                  config={{
                    name: "Timeline",
                    latestCount: 20,
                    composerMode: "raw",
                  }}
                  isDark={isDark}
                  settings={chatSettings}
                  onChange={() => {}}
                  onOpenPath={(path) => {
                    setTimelineOpen(false);
                    setOpenPathRequest((value) => ({
                      id: value.id + 1,
                      file: fileRef("workspace", path),
                      source: "filetree",
                    }));
                  }}
                  onExternalPathOpened={handleExternalPathOpened}
                />
              </div>
            </section>
          </div>
        )}

        {calendarOpen && (
          <div
            className="app-tool-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setCalendarOpen(false);
            }}
          >
            <section className="app-calendar-modal">
              <header className="memo-list-header">
                <strong>{tr("topbar.calendar")}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setCalendarOpen(false)}
                  title={tr("common.close")}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="app-calendar-body">
                <CalendarDashboardWidget
                  config={{ timelineName: "Timeline" }}
                  isDark={isDark}
                  onOpenFile={(file) => {
                    setCalendarOpen(false);
                    setOpenPathRequest((value) => ({
                      id: value.id + 1,
                      file,
                      source: "filetree",
                    }));
                  }}
                />
              </div>
            </section>
          </div>
        )}

        {kanbanOpen && (
          <div
            className="app-tool-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setKanbanOpen(false);
            }}
          >
            <section className="app-kanban-modal">
              <header className="memo-list-header">
                <strong>{tr("topbar.kanban")}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setKanbanOpen(false)}
                  title={tr("common.close")}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="app-kanban-body">
                <KanbanDashboardWidget
                  config={{
                    title: "Kanban",
                    folder: "Tasks",
                    statusProperty: "status",
                    titleProperty: "title",
                    timelineName: "Timeline",
                    columns: [
                      { value: "todo", label: "To do" },
                      { value: "doing", label: "Doing" },
                      { value: "done", label: "Done" },
                    ],
                  }}
                  isDark={isDark}
                  onChange={() => {}}
                  onOpenFile={(file) => {
                    setKanbanOpen(false);
                    setOpenPathRequest((value) => ({
                      id: value.id + 1,
                      file,
                      source: "filetree",
                    }));
                  }}
                />
              </div>
            </section>
          </div>
        )}

        {secretManagerOpen && (
          <div
            className="app-tool-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSecretManagerOpen(false);
              }
            }}
          >
            <section className="app-secret-manager-modal">
              <header className="memo-list-header">
                <strong>{tr("topbar.secretManager")}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSecretManagerOpen(false)}
                  title={tr("common.close")}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="app-secret-manager-body">
                <SecretManagerDashboardWidget
                  config={{
                    folder: encryptionDirectory.trim().replace(
                      /^\/+|\/+$/g,
                      "",
                    ) || "Secrets",
                  }}
                  managerId={`workspace:${
                    workspaceState.activeWorkspaceId || "local"
                  }`}
                />
              </div>
            </section>
          </div>
        )}

        {settingsOpen && (
          <div
            className="settings-backdrop"
            onClick={() => setSettingsOpen(false)}
          >
            <section
              className="settings-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="settings-header">
                <strong>{tr("settings.title")}</strong>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSettingsOpen(false)}
                  title={tr("common.close")}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="settings-layout">
                <aside className="settings-nav">
                  <button
                    type="button"
                    className={settingsSection === "general" ? "active" : ""}
                    onClick={() => setSettingsSection("general")}
                  >
                    <FolderOpen size={16} /> General
                  </button>
                  <button
                    type="button"
                    className={settingsSection === "encryption" ? "active" : ""}
                    onClick={() => setSettingsSection("encryption")}
                  >
                    <LockKeyhole size={16} /> Encryption
                  </button>
                  <button
                    type="button"
                    className={settingsSection === "ai" ? "active" : ""}
                    onClick={() => setSettingsSection("ai")}
                  >
                    <MessageSquare size={16} /> AI features
                  </button>
                  {aiEnabled && (
                    <>
                      <button
                        type="button"
                        className={settingsSection === "cli" ? "active" : ""}
                        onClick={() => setSettingsSection("cli")}
                      >
                        <Terminal size={16} /> CLI providers
                      </button>
                      <button
                        type="button"
                        className={settingsSection === "rag" ? "active" : ""}
                        onClick={() => setSettingsSection("rag")}
                      >
                        <Database size={16} /> Local retrieval
                      </button>
                      <button
                        type="button"
                        className={settingsSection === "commands"
                          ? "active"
                          : ""}
                        onClick={() => setSettingsSection("commands")}
                      >
                        <Command size={16} /> Slash commands
                      </button>
                      <button
                        type="button"
                        className={settingsSection === "skills" ? "active" : ""}
                        onClick={() => setSettingsSection("skills")}
                      >
                        <Library size={16} /> Agent skills
                      </button>
                      <button
                        type="button"
                        className={settingsSection === "mcp" ? "active" : ""}
                        onClick={() => setSettingsSection("mcp")}
                      >
                        <Server size={16} /> MCP servers
                      </button>
                      <button
                        type="button"
                        className={settingsSection === "discord"
                          ? "active"
                          : ""}
                        onClick={() => setSettingsSection("discord")}
                      >
                        <Bot size={16} /> Discord
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={settingsSection === "plugins" ? "active" : ""}
                    onClick={() => {
                      setSettingsSection("plugins");
                      setChatViewOpen(true);
                    }}
                  >
                    <Plug size={16} /> Plugins
                  </button>
                  <div className="settings-version">
                    Version {packageJson.version}
                  </div>
                </aside>
                <div className="settings-body">
                  {settingsSection === "general" && (
                    <>
                      <label className="settings-field">
                        <span>Workspace directory</span>
                        <div className="settings-path-row">
                          <input
                            value={workspacePath}
                            readOnly
                            placeholder="Select a Workspace directory"
                          />
                          <button
                            type="button"
                            className="settings-browse"
                            onClick={async () => {
                              const path = await selectWorkspaceDirectory();
                              if (path) await changeProjectDirectory(path);
                            }}
                          >
                            {tr("common.browse")}
                          </button>
                        </div>
                        <small className="settings-hint">
                          Dashboards, Memos, Secrets, skills, workflows,
                          plugins, and application state are stored under this
                          directory.
                        </small>
                      </label>
                      <label className="settings-field">
                        <span>{tr("settings.externalEditor")}</span>
                        <div className="settings-path-row">
                          <input
                            value={externalEditorPath}
                            onChange={(event) =>
                              setExternalEditorPath(event.target.value)}
                            placeholder="C:\\Program Files\\Microsoft VS Code\\Code.exe"
                          />
                          <button
                            type="button"
                            className="settings-browse"
                            onClick={async () => {
                              const path = await selectExternalEditor();
                              if (path) setExternalEditorPath(path);
                            }}
                          >
                            {tr("common.browse")}
                          </button>
                        </div>
                      </label>
                      <label className="settings-field">
                        <span>{tr("settings.memoSyncTimeline")}</span>
                        <input
                          value={memoSyncTimeline}
                          onChange={(event) =>
                            setMemoSyncTimeline(event.target.value)}
                          placeholder="Timeline"
                        />
                        <small className="settings-hint">
                          {tr("settings.memoSyncTimelineHint")}
                        </small>
                      </label>
                      <label className="settings-field">
                        <span>{tr("settings.language")}</span>
                        <select
                          className="settings-select"
                          value={languageSetting}
                          onChange={(event) => {
                            const value = event.target.value;
                            setLanguageSetting(
                              value === "en" || value === "ja"
                                ? value
                                : "system",
                            );
                          }}
                        >
                          <option value="system">
                            {tr("settings.languageSystem")}
                          </option>
                          <option value="en">English</option>
                          <option value="ja">
                            {tr("settings.languageJapanese")}
                          </option>
                        </select>
                      </label>
                      <label className="settings-field">
                        <span>Theme</span>
                        <button
                          type="button"
                          className="settings-choice"
                          onClick={() => setIsDark((value) => !value)}
                        >
                          {isDark ? <Moon size={16} /> : <Sun size={16} />}{" "}
                          {isDark ? "Dark" : "Light"}
                        </button>
                      </label>
                      <details className="third-party-notices">
                        <summary>Third-party notices</summary>
                        <pre>{THIRD_PARTY_NOTICES}</pre>
                      </details>
                    </>
                  )}
                  {settingsSection === "encryption" && (
                    <div className="encryption-settings">
                      <section className="encryption-settings-hero">
                        <div className="encryption-settings-icon">
                          <LockKeyhole size={22} />
                        </div>
                        <div>
                          <span className="encryption-settings-title-row">
                            <strong>History encryption</strong>
                            <i
                              className={historyEncryptionReady
                                ? "configured"
                                : "not-configured"}
                            >
                              {historyEncryptionReady
                                ? "Key configured"
                                : "Not configured"}
                            </i>
                          </span>
                          <p>
                            Protect locally stored conversations and workflow
                            logs with a password-protected encryption key.
                          </p>
                        </div>
                      </section>
                      <section className="encryption-settings-card">
                        <header>
                          <FolderOpen size={17} />
                          <div>
                            <strong>Encrypted files directory</strong>
                            <small>
                              The shared Secret Manager stores encrypted files
                              in this workspace directory.
                            </small>
                          </div>
                        </header>
                        <label className="encryption-directory-field">
                          <span>Workspace /</span>
                          <input
                            value={encryptionDirectory}
                            placeholder="Secrets"
                            onChange={(event) =>
                              setEncryptionDirectory(event.target.value)}
                            onBlur={() =>
                              setEncryptionDirectory((value) =>
                                value.trim().replace(/^\/+|\/+$/g, "") ||
                                "Secrets"
                              )}
                          />
                        </label>
                      </section>
                      <section className="encryption-settings-card">
                        <header>
                          <KeyRound size={17} />
                          <div>
                            <strong>
                              {historyEncryptionReady
                                ? "Unlock this session"
                                : "Create encryption key"}
                            </strong>
                            <small>
                              {historyEncryptionReady
                                ? "Enter your password after restarting the app to read encrypted history."
                                : "Choose the password that will protect your history encryption key."}
                            </small>
                          </div>
                        </header>
                        <div className="encryption-password-row">
                          <input
                            type="password"
                            aria-label={historyEncryptionReady
                              ? "Encryption password"
                              : "New encryption password"}
                            placeholder={historyEncryptionReady
                              ? "Enter encryption password"
                              : "Create a strong password"}
                            value={historyEncryptionPassword}
                            onChange={(event) =>
                              setHistoryEncryptionPassword(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.currentTarget.nextElementSibling
                                  ?.dispatchEvent(
                                    new MouseEvent("click", { bubbles: true }),
                                  );
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="primary"
                            disabled={!historyEncryptionPassword}
                            onClick={async () => {
                              try {
                                await configureOrUnlockHistoryEncryption(
                                  historyEncryptionPassword,
                                );
                                setHistoryEncryptionReady(true);
                                setHistoryEncryptionPassword("");
                                setHistoryEncryptionStatus(
                                  "Encryption is unlocked for this session.",
                                );
                              } catch (error) {
                                setHistoryEncryptionStatus(
                                  error instanceof Error
                                    ? error.message
                                    : String(error),
                                );
                              }
                            }}
                          >
                            {historyEncryptionReady ? "Unlock" : "Create key"}
                          </button>
                        </div>
                        {historyEncryptionStatus && (
                          <div className="encryption-settings-feedback">
                            {historyEncryptionStatus}
                          </div>
                        )}
                      </section>
                      <section className="encryption-settings-card">
                        <header>
                          <Check size={17} />
                          <div>
                            <strong>Choose what to encrypt</strong>
                            <small>
                              New history is encrypted before it is written to
                              local storage.
                            </small>
                          </div>
                        </header>
                        <div className="encryption-target-list">
                          <label>
                            <MessageSquare size={17} />
                            <span>
                              <strong>Chat history</strong>
                              <small>Saved conversations and messages</small>
                            </span>
                            <input
                              type="checkbox"
                              checked={historyEncryption.chat}
                              disabled={!historyEncryptionReady}
                              onChange={(event) => {
                                const next = {
                                  ...historyEncryption,
                                  chat: event.target.checked,
                                };
                                setHistoryEncryption(next);
                                setHistoryEncryptionPreferences(next);
                              }}
                            />
                          </label>
                          <label>
                            <Workflow size={17} />
                            <span>
                              <strong>Workflow logs</strong>
                              <small>Execution and request history</small>
                            </span>
                            <input
                              type="checkbox"
                              checked={historyEncryption.workflow}
                              disabled={!historyEncryptionReady}
                              onChange={(event) => {
                                const next = {
                                  ...historyEncryption,
                                  workflow: event.target.checked,
                                };
                                setHistoryEncryption(next);
                                setHistoryEncryptionPreferences(next);
                                void migrateWorkflowHistoryStorage(
                                  next.workflow,
                                )
                                  .catch((error) =>
                                    setHistoryEncryptionStatus(
                                      error instanceof Error
                                        ? error.message
                                        : String(error),
                                    )
                                  );
                              }}
                            />
                          </label>
                        </div>
                        {!historyEncryptionReady && (
                          <small className="encryption-disabled-hint">
                            Create an encryption key to enable these options.
                          </small>
                        )}
                      </section>
                      <section className="encryption-settings-warning">
                        <strong>Keep your password safe</strong>
                        <p>
                          Your password is never stored and remains in memory
                          only until the app closes. If you lose it, encrypted
                          history cannot be recovered.
                        </p>
                      </section>
                    </div>
                  )}
                  {settingsSection === "ai" && (
                    <>
                      <section className="settings-info-card">
                        <Bot size={20} />
                        <div>
                          <strong>Use AI features</strong>
                          <p>
                            Enables ChatView and AI-related settings such as
                            providers, retrieval, commands, skills, MCP, and
                            Discord.
                          </p>
                        </div>
                        <label
                          className="plugin-toggle"
                          title="Use AI features"
                        >
                          <input
                            type="checkbox"
                            checked={aiEnabled}
                            onChange={(event) => {
                              const enabled = event.target.checked;
                              setAIEnabled(enabled);
                              setChatViewOpen(enabled);
                            }}
                          />
                          <span />
                        </label>
                      </section>
                      {aiEnabled && (
                        <>
                          <ModelProviderManager
                            settings={chatSettings}
                            onChange={setChatSettings}
                          />
                          {chatSettings.provider !== "vertex" && (
                            <button
                              type="button"
                              className="settings-choice"
                              onClick={() =>
                                setChatSettings((current) =>
                                  switchChatProvider(current, "vertex")
                                )}
                            >
                              Configure Vertex AI
                            </button>
                          )}
                          {chatSettings.provider === "vertex"
                            ? (
                              <>
                                <label className="settings-field">
                                  <span>Vertex AI model</span>
                                  <input
                                    value={chatSettings.model}
                                    onChange={(event) =>
                                      setChatSettings((current) => ({
                                        ...current,
                                        model: event.target.value,
                                      }))}
                                  />
                                </label>
                                <section className="vertex-oauth-settings">
                                  <div>
                                    <strong>Google OAuth</strong>
                                    <span
                                      className={vertexConnected
                                        ? "connected"
                                        : ""}
                                    >
                                      {vertexStatus || "Not connected"}
                                    </span>
                                  </div>
                                  <label className="settings-field">
                                    <span>Desktop OAuth client ID</span>
                                    <div className="settings-path-row">
                                      <input
                                        value={chatSettings.vertexOAuthClientId}
                                        placeholder="Select client_secret_*.json"
                                        onChange={(event) =>
                                          setChatSettings((current) => ({
                                            ...current,
                                            vertexOAuthClientId:
                                              event.target.value,
                                          }))}
                                      />
                                      <button
                                        type="button"
                                        className="settings-browse"
                                        onClick={async () => {
                                          const client =
                                            await selectVertexOAuthClient();
                                          if (!client) return;
                                          setChatSettings((current) => ({
                                            ...current,
                                            vertexOAuthClientId:
                                              client.clientId,
                                            vertexOAuthClientSecret:
                                              client.clientSecret,
                                            vertexProjectId: client.projectId ||
                                              current.vertexProjectId,
                                          }));
                                          setVertexStatus(
                                            client.projectId
                                              ? `OAuth client loaded · ${client.projectId}`
                                              : "OAuth client loaded",
                                          );
                                        }}
                                      >
                                        Browse JSON
                                      </button>
                                    </div>
                                  </label>
                                  <label className="settings-field">
                                    <span>Desktop OAuth client secret</span>
                                    <input
                                      type="password"
                                      value={chatSettings
                                        .vertexOAuthClientSecret}
                                      onChange={(event) =>
                                        setChatSettings((current) => ({
                                          ...current,
                                          vertexOAuthClientSecret:
                                            event.target.value,
                                        }))}
                                    />
                                  </label>
                                  <div className="vertex-oauth-actions">
                                    {vertexConnected
                                      ? (
                                        <button
                                          type="button"
                                          className="settings-choice"
                                          onClick={async () => {
                                            await disconnectVertexOAuth();
                                            setVertexConnected(false);
                                            setVertexStatus("Disconnected");
                                          }}
                                        >
                                          Disconnect
                                        </button>
                                      )
                                      : (
                                        <button
                                          type="button"
                                          className="settings-choice"
                                          disabled={!chatSettings
                                            .vertexOAuthClientId || ragBusy}
                                          onClick={async () => {
                                            setRAGBusy(true);
                                            setVertexStatus(
                                              "Waiting for Google login…",
                                            );
                                            try {
                                              const status =
                                                await connectVertexOAuth(
                                                  chatSettings
                                                    .vertexOAuthClientId,
                                                  chatSettings
                                                    .vertexOAuthClientSecret,
                                                );
                                              setVertexConnected(
                                                status.connected,
                                              );
                                              setVertexStatus(
                                                status.connected
                                                  ? "Google account connected"
                                                  : "Not connected",
                                              );
                                            } catch (caught) {
                                              setVertexStatus(
                                                caught instanceof Error
                                                  ? caught.message
                                                  : String(caught),
                                              );
                                            } finally {
                                              setRAGBusy(false);
                                            }
                                          }}
                                        >
                                          Connect Google account
                                        </button>
                                      )}
                                    <small>
                                      Uses the Cloud Platform scope. This
                                      account needs Vertex AI User access on the
                                      project.
                                    </small>
                                  </div>
                                </section>
                                <details className="vertex-advanced">
                                  <summary>Advanced</summary>
                                  <div className="rag-number-grid">
                                    <label className="settings-field">
                                      <span>
                                        Google Cloud project ID override
                                      </span>
                                      <input
                                        value={chatSettings.vertexProjectId}
                                        placeholder="Loaded from OAuth JSON"
                                        onChange={(event) =>
                                          setChatSettings((current) => ({
                                            ...current,
                                            vertexProjectId: event.target.value,
                                          }))}
                                      />
                                    </label>
                                    <label className="settings-field">
                                      <span>Location</span>
                                      <input
                                        value={chatSettings.vertexLocation}
                                        placeholder="global"
                                        list="vertex-chat-locations"
                                        onChange={(event) =>
                                          setChatSettings((current) => ({
                                            ...current,
                                            vertexLocation: event.target.value,
                                          }))}
                                      />
                                      <datalist id="vertex-chat-locations">
                                        <option value="global" />
                                        <option value="us-central1" />
                                        <option value="europe-west4" />
                                        <option value="asia-northeast1" />
                                      </datalist>
                                    </label>
                                  </div>
                                  <small>
                                    Only change these when Vertex AI runs in a
                                    different project or region from the OAuth
                                    client defaults.
                                  </small>
                                </details>
                              </>
                            )
                            : null}
                          <label className="settings-field">
                            <span>System prompt</span>
                            <textarea
                              rows={6}
                              value={chatSettings.systemPrompt}
                              onChange={(event) =>
                                setChatSettings((current) => ({
                                  ...current,
                                  systemPrompt: event.target.value,
                                }))}
                            />
                          </label>
                          <small className="settings-hint">
                            {chatSettings.provider === "vertex"
                              ? "Vertex AI uses the connected Google account; API keys are not supported."
                              : "Provider credentials can only be changed from a provider card's pencil button."}
                            {" "}
                            Proposed API file writes still require Apply.
                          </small>
                        </>
                      )}
                    </>
                  )}
                  {settingsSection === "cli" && (
                    <>
                      <section className="settings-info-card">
                        <Terminal size={20} />
                        <div>
                          <strong>Local agent providers</strong>
                          <p>
                            Codex uses its structured App Server protocol.
                            Antigravity retains its CLI integration. Each
                            provider uses your existing local login.
                          </p>
                        </div>
                      </section>
                      <section className="model-provider-list">
                        <header>
                          <div>
                            <strong>CLI providers</strong>
                            <small>
                              Each verified CLI appears as a separate Chat
                              model.
                            </small>
                          </div>
                        </header>
                        <div className="model-provider-cards">
                          {(Object.entries(cliNames) as [CLIType, string][])
                            .map(([type, label]) => (
                              <button
                                type="button"
                                key={type}
                                className={`model-provider-card ${
                                  chatSettings.cliType === type
                                    ? "selected"
                                    : ""
                                }`}
                                onClick={() => {
                                  setCLIStatus("");
                                  setChatSettings((current) => ({
                                    ...current,
                                    provider: "cli",
                                    cliType: type,
                                  }));
                                }}
                              >
                                <span>
                                  <strong>{label}</strong>
                                  <small>
                                    {chatSettings.cliPaths[type] ||
                                      "Auto-detect from PATH"}
                                  </small>
                                </span>
                                <i
                                  className={chatSettings.verifiedCliTypes
                                      .includes(type)
                                    ? "configured"
                                    : ""}
                                >
                                  {chatSettings.verifiedCliTypes.includes(type)
                                    ? "Verified"
                                    : "Not verified"}
                                </i>
                              </button>
                            ))}
                        </div>
                      </section>
                      <label className="settings-field">
                        <span>Selected CLI</span>
                        <select
                          className="settings-select"
                          value={chatSettings.cliType}
                          onChange={(event) => {
                            setCLIStatus("");
                            setChatSettings((current) => ({
                              ...current,
                              provider: "cli",
                              cliType: event.target.value as CLIType,
                            }));
                          }}
                        >
                          {Object.entries(cliNames).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="settings-field">
                        <span>
                          Executable or JavaScript entry point (optional)
                        </span>
                        <div className="settings-path-row">
                          <input
                            value={chatSettings.cliPaths[chatSettings.cliType]}
                            placeholder="Auto-detect from PATH"
                            onChange={(event) => {
                              const value = event.target.value;
                              setCLIStatus("");
                              setChatSettings((current) => ({
                                ...current,
                                provider: "cli",
                                cliPaths: {
                                  ...current.cliPaths,
                                  [current.cliType]: value,
                                },
                              }));
                            }}
                          />
                          <button
                            type="button"
                            className="settings-browse"
                            onClick={async () => {
                              const path = await selectCLIPath();
                              if (path) {
                                setChatSettings((current) => ({
                                  ...current,
                                  provider: "cli",
                                  cliPaths: {
                                    ...current.cliPaths,
                                    [current.cliType]: path,
                                  },
                                }));
                              }
                            }}
                          >
                            Browse
                          </button>
                        </div>
                      </label>
                      <button
                        type="button"
                        className="settings-choice"
                        onClick={async () => {
                          setCLIStatus("Checking…");
                          const type = chatSettings.cliType;
                          const result = await verifyCLI(
                            type,
                            chatSettings.cliPaths[type],
                          );
                          setCLIStatus(
                            result.success
                              ? `Verified: ${
                                result.version || result.path || "OK"
                              }`
                              : `Not available: ${
                                result.error || "Unknown error"
                              }`,
                          );
                          setChatSettings((current) => ({
                            ...current,
                            verifiedCliTypes: result.success
                              ? [
                                ...new Set([...current.verifiedCliTypes, type]),
                              ]
                              : current.verifiedCliTypes.filter((item) =>
                                item !== type
                              ),
                          }));
                        }}
                      >
                        {chatSettings.cliType === "codex"
                          ? "Verify App Server"
                          : "Verify CLI"}
                      </button>
                      {cliStatus && (
                        <div
                          className={cliStatus.startsWith("Verified")
                            ? "settings-status ok"
                            : "settings-status"}
                        >
                          {cliStatus}
                        </div>
                      )}
                      <label className="settings-field">
                        <span>System prompt</span>
                        <textarea
                          rows={6}
                          value={chatSettings.systemPrompt}
                          onChange={(event) =>
                            setChatSettings((current) => ({
                              ...current,
                              systemPrompt: event.target.value,
                            }))}
                        />
                      </label>
                      <section className="settings-warning">
                        <strong>Local agent permissions</strong>
                        <p>
                          Codex App Server is restricted to a workspace-write
                          sandbox for DirectoryBase, with interactive approval
                          requests denied until an approval UI is available.
                          Antigravity runs with its own CLI permission and
                          sandbox settings.
                        </p>
                      </section>
                    </>
                  )}
                  {settingsSection === "commands" && (
                    <>
                      <section className="settings-info-card">
                        <Command size={20} />
                        <div>
                          <strong>Slash commands</strong>
                          <p>
                            Type <code>/command</code> in Chat. Use{" "}
                            <code>{"{selection}"}</code> or{" "}
                            <code>{"{input}"}</code>{" "}
                            in the template for the text entered after the
                            command.
                          </p>
                        </div>
                      </section>
                      <div className="slash-command-list">
                        {chatSettings.slashCommands.map((command) => (
                          <article key={command.id}>
                            <div className="slash-command-heading">
                              <strong>/{command.name || "command"}</strong>
                              <button
                                type="button"
                                title="Delete command"
                                onClick={() =>
                                  setChatSettings((current) => ({
                                    ...current,
                                    slashCommands: current.slashCommands.filter(
                                      (item) =>
                                        item.id !== command.id,
                                    ),
                                  }))}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            <label className="settings-field">
                              <span>Name</span>
                              <input
                                value={command.name}
                                onChange={(event) => {
                                  const name = event.target.value.toLowerCase()
                                    .replace(/[^a-z0-9_-]/g, "");
                                  setChatSettings((current) => ({
                                    ...current,
                                    slashCommands: current.slashCommands.map((
                                      item,
                                    ) =>
                                      item.id === command.id
                                        ? { ...item, name }
                                        : item
                                    ),
                                  }));
                                }}
                              />
                            </label>
                            <label className="settings-field">
                              <span>Description</span>
                              <input
                                value={command.description}
                                onChange={(event) => {
                                  const description = event.target.value;
                                  setChatSettings((current) => ({
                                    ...current,
                                    slashCommands: current.slashCommands.map((
                                      item,
                                    ) =>
                                      item.id === command.id
                                        ? { ...item, description }
                                        : item
                                    ),
                                  }));
                                }}
                              />
                            </label>
                            <label className="settings-field">
                              <span>Prompt template</span>
                              <textarea
                                rows={5}
                                value={command.promptTemplate}
                                onChange={(event) => {
                                  const promptTemplate = event.target.value;
                                  setChatSettings((current) => ({
                                    ...current,
                                    slashCommands: current.slashCommands.map((
                                      item,
                                    ) =>
                                      item.id === command.id
                                        ? { ...item, promptTemplate }
                                        : item
                                    ),
                                  }));
                                }}
                              />
                            </label>
                            {chatSettings.mcpServers.length > 0 && (
                              <fieldset className="slash-command-mcp">
                                <legend>MCP servers for this command</legend>
                                <label>
                                  <input
                                    type="radio"
                                    name={`mcp-${command.id}`}
                                    checked={command.enabledMcpServers == null}
                                    onChange={() =>
                                      setChatSettings((current) => ({
                                        ...current,
                                        slashCommands: current.slashCommands
                                          .map((item) =>
                                            item.id === command.id
                                              ? {
                                                ...item,
                                                enabledMcpServers: null,
                                              }
                                              : item
                                          ),
                                      }))}
                                  />Keep current selection
                                </label>
                                <label>
                                  <input
                                    type="radio"
                                    name={`mcp-${command.id}`}
                                    checked={command.enabledMcpServers != null}
                                    onChange={() =>
                                      setChatSettings((current) => ({
                                        ...current,
                                        slashCommands: current.slashCommands
                                          .map((item) =>
                                            item.id === command.id
                                              ? {
                                                ...item,
                                                enabledMcpServers: [],
                                              }
                                              : item
                                          ),
                                      }))}
                                  />Use selected servers
                                </label>
                                {command.enabledMcpServers != null &&
                                  chatSettings.mcpServers.map((server) => (
                                    <label key={server.id}>
                                      <input
                                        type="checkbox"
                                        checked={command.enabledMcpServers
                                          ?.includes(server.name) || false}
                                        onChange={(event) =>
                                          setChatSettings((current) => ({
                                            ...current,
                                            slashCommands: current.slashCommands
                                              .map((item) =>
                                                item.id !== command.id
                                                  ? item
                                                  : {
                                                    ...item,
                                                    enabledMcpServers:
                                                      event.target.checked
                                                        ? [
                                                          ...new Set([
                                                            ...(item
                                                              .enabledMcpServers ||
                                                              []),
                                                            server.name,
                                                          ]),
                                                        ]
                                                        : (item
                                                          .enabledMcpServers ||
                                                          []).filter((name) =>
                                                            name !== server.name
                                                          ),
                                                  }
                                              ),
                                          }))}
                                      />
                                      {server.name}
                                    </label>
                                  ))}
                              </fieldset>
                            )}
                          </article>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="settings-choice"
                        onClick={() =>
                          setChatSettings((current) => ({
                            ...current,
                            slashCommands: [...current.slashCommands, {
                              id: `cmd-${Date.now()}`,
                              name: "new-command",
                              description: "",
                              promptTemplate: "{selection}",
                              enabledMcpServers: null,
                            }],
                          }))}
                      >
                        <Plus size={15} /> Add command
                      </button>
                    </>
                  )}
                  {settingsSection === "skills" && (
                    <AgentSkillsSettings
                      directoryBase={workspacePath}
                      settings={chatSettings}
                    />
                  )}
                  {settingsSection === "mcp" && (
                    <>
                      <section className="settings-info-card">
                        <Server size={20} />
                        <div>
                          <strong>MCP servers</strong>
                          <p>
                            Enabled servers are available from Chat’s tool menu.
                            Workflow command nodes can select servers with the
                            {" "}
                            <code>mcpServers</code>{" "}
                            property. HTTP uses Streamable HTTP; local servers
                            can use stdio.
                          </p>
                        </div>
                      </section>
                      <div className="mcp-server-list">
                        {chatSettings.mcpServers.map((server) => (
                          <article key={server.id}>
                            <div className="slash-command-heading">
                              <strong>{server.name || "MCP server"}</strong>
                              <div>
                                <label
                                  className="settings-check"
                                  title={server.verified
                                    ? undefined
                                    : "Test the connection before enabling this server."}
                                >
                                  <input
                                    type="checkbox"
                                    checked={server.enabled && server.verified}
                                    disabled={!server.verified}
                                    onChange={(event) =>
                                      setChatSettings((current) => ({
                                        ...current,
                                        mcpServers: current.mcpServers.map((
                                          item,
                                        ) =>
                                          item.id === server.id
                                            ? {
                                              ...item,
                                              enabled: event.target.checked,
                                            }
                                            : item
                                        ),
                                      }))}
                                  />{" "}
                                  Enabled
                                </label>
                                <button
                                  type="button"
                                  title="Delete server"
                                  onClick={() => {
                                    void disconnectMCPOAuth(server.id);
                                    setChatSettings((current) => ({
                                      ...current,
                                      mcpServers: current.mcpServers.filter((
                                        item,
                                      ) =>
                                        item.id !== server.id
                                      ),
                                    }));
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                            <div className="rag-number-grid">
                              <label className="settings-field">
                                <span>Name</span>
                                <input
                                  value={server.name}
                                  onChange={(event) =>
                                    setChatSettings((current) => ({
                                      ...current,
                                      mcpServers: current.mcpServers.map((
                                        item,
                                      ) =>
                                        item.id === server.id
                                          ? {
                                            ...item,
                                            name: event.target.value,
                                          }
                                          : item
                                      ),
                                    }))}
                                />
                              </label>
                              <label className="settings-field">
                                <span>Transport</span>
                                <select
                                  className="settings-select"
                                  value={server.transport}
                                  onChange={(event) => {
                                    void disconnectMCPOAuth(server.id);
                                    setChatSettings((current) => ({
                                      ...current,
                                      mcpServers: current.mcpServers.map((
                                        item,
                                      ) =>
                                        item.id === server.id
                                          ? {
                                            ...item,
                                            transport:
                                              event.target.value === "stdio"
                                                ? "stdio"
                                                : "http",
                                            verified: false,
                                            enabled: false,
                                            toolHints: [],
                                            oauth: false,
                                          }
                                          : item
                                      ),
                                    }));
                                  }}
                                >
                                  <option value="http">Streamable HTTP</option>
                                  <option value="stdio">stdio</option>
                                </select>
                              </label>
                            </div>
                            {server.transport === "http"
                              ? (
                                <>
                                  <label className="settings-field">
                                    <span>URL</span>
                                    <input
                                      value={server.url}
                                      placeholder="http://127.0.0.1:3000/mcp"
                                      onChange={(event) => {
                                        void disconnectMCPOAuth(server.id);
                                        setChatSettings((current) => ({
                                          ...current,
                                          mcpServers: current.mcpServers.map((
                                            item,
                                          ) =>
                                            item.id === server.id
                                              ? {
                                                ...item,
                                                url: event.target.value,
                                                verified: false,
                                                enabled: false,
                                                toolHints: [],
                                                oauth: false,
                                              }
                                              : item
                                          ),
                                        }));
                                      }}
                                    />
                                  </label>
                                  <div className="rag-number-grid">
                                    <label className="settings-field">
                                      <span>OAuth Client ID</span>
                                      <input
                                        value={server.oauthClientId || ""}
                                        placeholder="Google Cloud OAuth client ID"
                                        onChange={(event) =>
                                          setChatSettings((current) => ({
                                            ...current,
                                            mcpServers: current.mcpServers.map((
                                              item,
                                            ) =>
                                              item.id === server.id
                                                ? {
                                                  ...item,
                                                  oauthClientId:
                                                    event.target.value,
                                                }
                                                : item
                                            ),
                                          }))}
                                      />
                                    </label>
                                    <label className="settings-field">
                                      <span>OAuth Client Secret</span>
                                      <input
                                        type="password"
                                        value={server.oauthClientSecret || ""}
                                        placeholder="OAuth client secret"
                                        onChange={(event) =>
                                          setChatSettings((current) => ({
                                            ...current,
                                            mcpServers: current.mcpServers.map((
                                              item,
                                            ) =>
                                              item.id === server.id
                                                ? {
                                                  ...item,
                                                  oauthClientSecret:
                                                    event.target.value,
                                                }
                                                : item
                                            ),
                                          }))}
                                      />
                                    </label>
                                  </div>
                                  <label className="settings-field">
                                    <span>OAuth scopes</span>
                                    <input
                                      value={(server.oauthScopes || []).join(
                                        " ",
                                      )}
                                      placeholder="https://www.googleapis.com/auth/logging.read"
                                      onChange={(event) =>
                                        setChatSettings((current) => ({
                                          ...current,
                                          mcpServers: current.mcpServers.map((
                                            item,
                                          ) =>
                                            item.id === server.id
                                              ? {
                                                ...item,
                                                oauthScopes: event.target.value
                                                  .split(/[\s,]+/).map((
                                                    scope,
                                                  ) => scope.trim()).filter(
                                                    Boolean,
                                                  ),
                                              }
                                              : item
                                          ),
                                        }))}
                                    />
                                    <small>
                                      Space-separated. Empty uses the Google MCP
                                      default scope.
                                    </small>
                                  </label>
                                  <label className="settings-field">
                                    <span>Headers (JSON)</span>
                                    <textarea
                                      key={JSON.stringify(server.headers)}
                                      rows={3}
                                      defaultValue={JSON.stringify(
                                        server.headers,
                                        null,
                                        2,
                                      )}
                                      onBlur={(event) => {
                                        try {
                                          const headers = JSON.parse(
                                            event.target.value,
                                          ) as Record<string, string>;
                                          setChatSettings((current) => ({
                                            ...current,
                                            mcpServers: current.mcpServers.map((
                                              item,
                                            ) =>
                                              item.id === server.id
                                                ? {
                                                  ...item,
                                                  headers,
                                                  verified: false,
                                                  enabled: false,
                                                  toolHints: [],
                                                }
                                                : item
                                            ),
                                          }));
                                          setMCPStatus((current) => ({
                                            ...current,
                                            [server.id]: "",
                                          }));
                                        } catch {
                                          setMCPStatus((current) => ({
                                            ...current,
                                            [server.id]:
                                              "Headers must be valid JSON.",
                                          }));
                                        }
                                      }}
                                    />
                                  </label>
                                  {!server.oauthClientId?.trim() && (
                                    <button
                                      type="button"
                                      className="settings-choice"
                                      disabled={!server.url}
                                      onClick={async () => {
                                        setMCPStatus((current) => ({
                                          ...current,
                                          [server.id]: "Connecting…",
                                        }));
                                        let usedOAuth = server.oauth;
                                        let client = new McpHttpClient({
                                          id: server.id,
                                          name: server.name,
                                          transport: "http",
                                          url: server.url,
                                          headers: server.headers,
                                          enabled: server.enabled,
                                          oauth: server.oauth,
                                        });
                                        try {
                                          let tools;
                                          try {
                                            tools = await client.listTools();
                                          } catch (initialError) {
                                            if (
                                              usedOAuth ||
                                              !(initialError instanceof
                                                  McpHttpError &&
                                                initialError.status === 401)
                                            ) throw initialError;
                                            await client.close();
                                            setMCPStatus((current) => ({
                                              ...current,
                                              [server.id]:
                                                "Opening browser for OAuth…",
                                            }));
                                            await connectMCPOAuth({
                                              serverId: server.id,
                                              serverUrl: server.url,
                                              clientId: server.oauthClientId,
                                              clientSecret:
                                                server.oauthClientSecret,
                                              scopes: server.oauthScopes,
                                            });
                                            usedOAuth = true;
                                            client = new McpHttpClient({
                                              id: server.id,
                                              name: server.name,
                                              transport: "http",
                                              url: server.url,
                                              headers: server.headers,
                                              enabled: true,
                                              oauth: true,
                                            });
                                            tools = await client.listTools();
                                          }
                                          setChatSettings((current) => ({
                                            ...current,
                                            mcpServers: current.mcpServers.map((
                                              item,
                                            ) =>
                                              item.id === server.id
                                                ? {
                                                  ...item,
                                                  toolHints: tools.map((tool) =>
                                                    tool.name
                                                  ),
                                                  verified: true,
                                                  enabled: true,
                                                  oauth: usedOAuth,
                                                }
                                                : item
                                            ),
                                          }));
                                          setMCPStatus((current) => ({
                                            ...current,
                                            [server.id]: `Connected${
                                              usedOAuth ? " · OAuth" : ""
                                            } · ${tools.length} tools`,
                                          }));
                                        } catch (caught) {
                                          setMCPStatus((current) => ({
                                            ...current,
                                            [server.id]: caught instanceof Error
                                              ? caught.message
                                              : String(caught),
                                          }));
                                        } finally {
                                          await client.close();
                                        }
                                      }}
                                    >
                                      Test connection
                                    </button>
                                  )}
                                </>
                              )
                              : (
                                <>
                                  <label className="settings-field">
                                    <span>Command</span>
                                    <input
                                      value={server.command}
                                      placeholder="npx"
                                      onChange={(event) =>
                                        setChatSettings((current) => ({
                                          ...current,
                                          mcpServers: current.mcpServers.map((
                                            item,
                                          ) =>
                                            item.id === server.id
                                              ? {
                                                ...item,
                                                command: event.target.value,
                                                verified: false,
                                                enabled: false,
                                                toolHints: [],
                                              }
                                              : item
                                          ),
                                        }))}
                                    />
                                  </label>
                                  <label className="settings-field">
                                    <span>Arguments (one per line)</span>
                                    <textarea
                                      rows={3}
                                      value={server.args.join("\n")}
                                      onChange={(event) =>
                                        setChatSettings((current) => ({
                                          ...current,
                                          mcpServers: current.mcpServers.map((
                                            item,
                                          ) =>
                                            item.id === server.id
                                              ? {
                                                ...item,
                                                args: event.target.value.split(
                                                  /\r?\n/,
                                                ).filter(Boolean),
                                                verified: false,
                                                enabled: false,
                                                toolHints: [],
                                              }
                                              : item
                                          ),
                                        }))}
                                    />
                                  </label>
                                  <label className="settings-field">
                                    <span>Environment (JSON)</span>
                                    <textarea
                                      rows={3}
                                      defaultValue={JSON.stringify(
                                        server.env,
                                        null,
                                        2,
                                      )}
                                      onBlur={(event) => {
                                        try {
                                          const env = JSON.parse(
                                            event.target.value,
                                          ) as Record<string, string>;
                                          setChatSettings((current) => ({
                                            ...current,
                                            mcpServers: current.mcpServers.map((
                                              item,
                                            ) =>
                                              item.id === server.id
                                                ? {
                                                  ...item,
                                                  env,
                                                  verified: false,
                                                  enabled: false,
                                                  toolHints: [],
                                                }
                                                : item
                                            ),
                                          }));
                                        } catch {
                                          setMCPStatus((current) => ({
                                            ...current,
                                            [server.id]:
                                              "Environment must be valid JSON.",
                                          }));
                                        }
                                      }}
                                    />
                                  </label>
                                </>
                              )}
                            {server.transport === "stdio" && (
                              <div className="rag-number-grid">
                                <label className="settings-field">
                                  <span>Framing</span>
                                  <select
                                    className="settings-select"
                                    value={server.framing}
                                    onChange={(event) =>
                                      setChatSettings((current) => ({
                                        ...current,
                                        mcpServers: current.mcpServers.map((
                                          item,
                                        ) =>
                                          item.id === server.id
                                            ? {
                                              ...item,
                                              framing:
                                                event.target.value === "newline"
                                                  ? "newline"
                                                  : "content-length",
                                              verified: false,
                                              enabled: false,
                                              toolHints: [],
                                            }
                                            : item
                                        ),
                                      }))}
                                  >
                                    <option value="content-length">
                                      Content-Length
                                    </option>
                                    <option value="newline">
                                      Newline JSON
                                    </option>
                                  </select>
                                </label>
                                <button
                                  type="button"
                                  className="settings-choice"
                                  disabled={!server.command}
                                  onClick={async () => {
                                    setMCPStatus((current) => ({
                                      ...current,
                                      [server.id]: "Connecting…",
                                    }));
                                    const client = new McpStdioClient(server);
                                    try {
                                      const tools = await client.listTools();
                                      setChatSettings((current) => ({
                                        ...current,
                                        mcpServers: current.mcpServers.map((
                                          item,
                                        ) =>
                                          item.id === server.id
                                            ? {
                                              ...item,
                                              toolHints: tools.map((tool) =>
                                                tool.name
                                              ),
                                              verified: true,
                                              enabled: true,
                                            }
                                            : item
                                        ),
                                      }));
                                      setMCPStatus((current) => ({
                                        ...current,
                                        [server.id]:
                                          `Connected · ${tools.length} tools`,
                                      }));
                                    } catch (caught) {
                                      setMCPStatus((current) => ({
                                        ...current,
                                        [server.id]: caught instanceof Error
                                          ? caught.message
                                          : String(caught),
                                      }));
                                    } finally {
                                      await client.close();
                                    }
                                  }}
                                >
                                  Test connection
                                </button>
                              </div>
                            )}
                            {!server.verified && (
                              <small className="settings-hint">
                                Test the connection before enabling this server.
                              </small>
                            )}
                            {server.toolHints.length > 0 && (
                              <small className="settings-hint">
                                Tools: {server.toolHints.join(", ")}
                              </small>
                            )}
                            {server.transport === "http" && (
                              <div className="vertex-oauth-actions">
                                <small>
                                  {server.oauth
                                    ? "OAuth configured · tokens are stored by the desktop app"
                                    : "Authenticate this MCP server with OAuth"}
                                </small>
                                <button
                                  type="button"
                                  className="settings-choice"
                                  onClick={async () => {
                                    setMCPStatus((current) => ({
                                      ...current,
                                      [server.id]: `Opening browser for OAuth${
                                        server.oauth
                                          ? " re-authorization"
                                          : " authentication"
                                      }…`,
                                    }));
                                    try {
                                      await connectMCPOAuth({
                                        serverId: server.id,
                                        serverUrl: server.url,
                                        clientId: server.oauthClientId,
                                        clientSecret: server.oauthClientSecret,
                                        scopes: server.oauthScopes,
                                      });
                                      setChatSettings((current) => ({
                                        ...current,
                                        mcpServers: current.mcpServers.map((
                                          item,
                                        ) =>
                                          item.id === server.id
                                            ? { ...item, oauth: true }
                                            : item
                                        ),
                                      }));
                                      const client = new McpHttpClient({
                                        id: server.id,
                                        name: server.name,
                                        transport: "http",
                                        url: server.url,
                                        headers: server.headers,
                                        enabled: true,
                                        oauth: true,
                                      });
                                      const tools = await client.listTools();
                                      await client.close();
                                      setChatSettings((current) => ({
                                        ...current,
                                        mcpServers: current.mcpServers.map((
                                          item,
                                        ) =>
                                          item.id === server.id
                                            ? {
                                              ...item,
                                              oauth: true,
                                              verified: true,
                                              enabled: true,
                                              toolHints: tools.map((tool) =>
                                                tool.name
                                              ),
                                            }
                                            : item
                                        ),
                                      }));
                                      setMCPStatus((current) => ({
                                        ...current,
                                        [server.id]:
                                          `Connected · OAuth · ${tools.length} tools`,
                                      }));
                                    } catch (caught) {
                                      setMCPStatus((current) => ({
                                        ...current,
                                        [server.id]: caught instanceof Error
                                          ? caught.message
                                          : String(caught),
                                      }));
                                    }
                                  }}
                                >
                                  {server.oauth
                                    ? "Re-authorize"
                                    : "Authenticate with OAuth"}
                                </button>
                                {server.oauth && (
                                  <button
                                    type="button"
                                    className="settings-choice"
                                    onClick={() => {
                                      void disconnectMCPOAuth(server.id);
                                      setChatSettings((current) => ({
                                        ...current,
                                        mcpServers: current.mcpServers.map((
                                          item,
                                        ) =>
                                          item.id === server.id
                                            ? {
                                              ...item,
                                              oauth: false,
                                              verified: false,
                                              enabled: false,
                                              toolHints: [],
                                            }
                                            : item
                                        ),
                                      }));
                                      setMCPStatus((current) => ({
                                        ...current,
                                        [server.id]: "OAuth disconnected.",
                                      }));
                                    }}
                                  >
                                    Disconnect OAuth
                                  </button>
                                )}
                              </div>
                            )}
                            {mcpStatus[server.id] && (
                              <div
                                className={mcpStatus[server.id].startsWith(
                                    "Connected",
                                  )
                                  ? "settings-status ok"
                                  : "settings-status"}
                              >
                                {mcpStatus[server.id]}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="settings-choice"
                        onClick={() =>
                          setChatSettings((current) => ({
                            ...current,
                            mcpServers: [...current.mcpServers, {
                              id: `mcp-${crypto.randomUUID()}`,
                              name: "MCP server",
                              transport: "http",
                              url: "",
                              headers: {},
                              command: "",
                              args: [],
                              env: {},
                              framing: "content-length",
                              enabled: false,
                              toolHints: [],
                              verified: false,
                              oauth: false,
                              oauthClientId: "",
                              oauthClientSecret: "",
                              oauthScopes: [],
                            }],
                          }))}
                      >
                        <Plus size={15} /> Add MCP server
                      </button>
                    </>
                  )}
                  {settingsSection === "rag" && (
                    <>
                      <OkfSettingsCard
                        root={chatSettings.okfRoot}
                        onChange={(okfRoot) =>
                          setChatSettings((current) => ({
                            ...current,
                            okfRoot,
                          }))}
                      />
                      <section className="settings-info-card">
                        <Database size={20} />
                        <div>
                          <strong>Local RAG</strong>
                          <p>
                            Local vector index with chunked Markdown, embedding
                            APIs, incremental checksum sync and cosine
                            similarity search.
                          </p>
                        </div>
                      </section>
                      <div className="rag-setting-selector">
                        <select
                          className="settings-select"
                          value={chatSettings.selectedRagSetting ?? ""}
                          onChange={async (event) => {
                            const name = event.target.value || null;
                            setChatSettings((current) => ({
                              ...current,
                              selectedRagSetting: name,
                            }));
                            setRAGStatus("");
                            if (name) {
                              const status = await getRAGStatus(name);
                              setRAGStatus(
                                `${status.chunkCount} chunks · ${status.fileCount} files · ${status.dimension} dimensions`,
                              );
                            }
                          }}
                        >
                          <option value="">None</option>
                          {Object.keys(chatSettings.ragSettings).map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="settings-browse"
                          onClick={() => {
                            let index =
                              Object.keys(chatSettings.ragSettings).length + 1;
                            let name = `RAG ${index}`;
                            while (chatSettings.ragSettings[name]) {
                              index++;
                              name = `RAG ${index}`;
                            }
                            const embeddingProvider = configuredChatProviders(
                              chatSettings,
                            )
                              .find((provider) =>
                                provider === "gemini" ||
                                provider === "vertex" || provider === "openai"
                              ) as "gemini" | "vertex" | "openai" | undefined;
                            setChatSettings((current) => ({
                              ...current,
                              selectedRagSetting: name,
                              ragSettings: {
                                ...current.ragSettings,
                                [name]: {
                                  ...structuredClone(defaultRAGSetting),
                                  embeddingProvider: embeddingProvider ??
                                    "gemini",
                                },
                              },
                            }));
                            setRAGStatus("Not synced");
                          }}
                        >
                          <Plus size={14} /> New
                        </button>
                        <button
                          type="button"
                          className="settings-browse"
                          disabled={!chatSettings.selectedRagSetting}
                          onClick={async () => {
                            const oldName = chatSettings.selectedRagSetting;
                            if (!oldName) return;
                            const requested = window.prompt(
                              "RAG name",
                              oldName,
                            );
                            const newName = requested?.trim() ?? "";
                            if (!newName || newName === oldName) return;
                            if (chatSettings.ragSettings[newName]) {
                              setRAGStatus(
                                `A RAG setting named ${newName} already exists.`,
                              );
                              return;
                            }
                            try {
                              await renameRAGIndex(oldName, newName);
                              setChatSettings((current) => {
                                const ragSettings = Object.fromEntries(
                                  Object.entries(current.ragSettings).map((
                                    [name, setting],
                                  ) => [
                                    name,
                                    {
                                      ...setting,
                                      sourceRagSettings: setting
                                        .sourceRagSettings.map((source) =>
                                          source === oldName ? newName : source
                                        ),
                                    },
                                  ]),
                                );
                                ragSettings[newName] = ragSettings[oldName];
                                delete ragSettings[oldName];
                                return {
                                  ...current,
                                  selectedRagSetting: newName,
                                  ragSettings,
                                  discord: {
                                    ...current.discord,
                                    ragSetting:
                                      current.discord.ragSetting === oldName
                                        ? newName
                                        : current.discord.ragSetting,
                                  },
                                };
                              });
                              setRAGStatus(`Renamed ${oldName} to ${newName}.`);
                            } catch (caught) {
                              setRAGStatus(
                                caught instanceof Error
                                  ? caught.message
                                  : String(caught),
                              );
                            }
                          }}
                        >
                          <Pencil size={14} /> Rename
                        </button>
                        <button
                          type="button"
                          className="settings-browse danger"
                          disabled={!chatSettings.selectedRagSetting}
                          title="Delete RAG setting"
                          aria-label="Delete RAG setting"
                          onClick={async () => {
                            const name = chatSettings.selectedRagSetting;
                            if (!name) return;
                            if (
                              !window.confirm(
                                `Delete RAG setting "${name}" and its local index?`,
                              )
                            ) return;
                            await deleteRAGIndex(name);
                            setChatSettings((current) => {
                              const ragSettings = { ...current.ragSettings };
                              delete ragSettings[name];
                              return {
                                ...current,
                                selectedRagSetting: null,
                                ragSettings,
                              };
                            });
                            setRAGStatus("");
                          }}
                        >
                          <X size={14} /> Delete
                        </button>
                      </div>
                      {selectedRAG && chatSettings.selectedRagSetting && (
                        <>
                          <label className="settings-field">
                            <span>Embedding connection</span>
                            <select
                              className="settings-select"
                              value={selectedRAG.embeddingSource}
                              onChange={(event) => {
                                const embeddingSource = event.target.value as
                                  | "ai"
                                  | "custom";
                                setChatSettings((current) => ({
                                  ...current,
                                  ragSettings: {
                                    ...current.ragSettings,
                                    [current.selectedRagSetting!]: {
                                      ...current
                                        .ragSettings[
                                          current.selectedRagSetting!
                                        ],
                                      embeddingSource,
                                      embeddingProvider:
                                        embeddingSource === "custom"
                                          ? "openai"
                                          : current
                                            .ragSettings[
                                              current.selectedRagSetting!
                                            ].embeddingProvider,
                                    },
                                  },
                                }));
                              }}
                            >
                              <option value="ai">Use AI settings</option>
                              <option value="custom">
                                Custom URL and API key
                              </option>
                            </select>
                          </label>
                          {selectedRAG.embeddingSource === "ai" && (
                            <label className="settings-field">
                              <span>AI provider</span>
                              <select
                                className="settings-select"
                                value={selectedRAG.embeddingProvider}
                                disabled={!configuredChatProviders(chatSettings)
                                  .some((provider) =>
                                    provider === "gemini" ||
                                    provider === "vertex" ||
                                    provider === "openai"
                                  )}
                                onChange={(event) => {
                                  const embeddingProvider = event.target
                                    .value as "gemini" | "vertex" | "openai";
                                  setChatSettings((current) => ({
                                    ...current,
                                    ragSettings: {
                                      ...current.ragSettings,
                                      [current.selectedRagSetting!]: {
                                        ...current
                                          .ragSettings[
                                            current.selectedRagSetting!
                                          ],
                                        embeddingProvider,
                                        embeddingModel:
                                          embeddingProvider === "vertex"
                                            ? "gemini-embedding-2"
                                            : current
                                              .ragSettings[
                                                current.selectedRagSetting!
                                              ].embeddingModel,
                                      },
                                    },
                                  }));
                                }}
                              >
                                {!configuredChatProviders(chatSettings).some((
                                  provider,
                                ) =>
                                  provider === "gemini" ||
                                  provider === "vertex" || provider === "openai"
                                ) && (
                                  <option value="">
                                    No embedding-capable AI provider configured
                                  </option>
                                )}
                                {configuredChatProviders(chatSettings)
                                  .filter((provider) =>
                                    provider === "gemini" ||
                                    provider === "vertex" ||
                                    provider === "openai"
                                  )
                                  .map((provider) => (
                                    <option key={provider} value={provider}>
                                      {provider === "gemini"
                                        ? "Gemini"
                                        : provider === "vertex"
                                        ? "Vertex AI"
                                        : "OpenAI / Compatible"}
                                    </option>
                                  ))}
                              </select>
                              <small className="settings-hint">
                                Credentials and endpoint come from AI settings.
                              </small>
                            </label>
                          )}
                          {selectedRAG.embeddingSource === "custom" && (
                            <label className="settings-field">
                              <span>Embedding URL</span>
                              <input
                                value={selectedRAG.embeddingBaseUrl}
                                placeholder="http://localhost:11434"
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setChatSettings((current) => ({
                                    ...current,
                                    ragSettings: {
                                      ...current.ragSettings,
                                      [current.selectedRagSetting!]: {
                                        ...current
                                          .ragSettings[
                                            current.selectedRagSetting!
                                          ],
                                        embeddingBaseUrl: value,
                                      },
                                    },
                                  }));
                                }}
                              />
                              <small className="settings-hint">
                                The provider must expose{" "}
                                <code>/v1/embeddings</code>.
                              </small>
                            </label>
                          )}
                          {selectedRAG.embeddingSource === "ai"
                            ? null
                            : selectedRAG.embeddingProvider === "vertex"
                            ? (
                              <section className="vertex-oauth-settings">
                                <div>
                                  <strong>Google OAuth</strong>
                                  <span
                                    className={vertexConnected
                                      ? "connected"
                                      : ""}
                                  >
                                    {vertexStatus || "Not connected"}
                                  </span>
                                </div>
                                <label className="settings-field">
                                  <span>Desktop OAuth client ID</span>
                                  <div className="settings-path-row">
                                    <input
                                      value={selectedRAG.vertexOAuthClientId}
                                      placeholder="Select client_secret_*.json"
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        setChatSettings((current) => ({
                                          ...current,
                                          ragSettings: {
                                            ...current.ragSettings,
                                            [current.selectedRagSetting!]: {
                                              ...current
                                                .ragSettings[
                                                  current.selectedRagSetting!
                                                ],
                                              vertexOAuthClientId: value,
                                            },
                                          },
                                        }));
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="settings-browse"
                                      onClick={async () => {
                                        const client =
                                          await selectVertexOAuthClient();
                                        if (!client) return;
                                        setChatSettings((current) => ({
                                          ...current,
                                          ragSettings: {
                                            ...current.ragSettings,
                                            [current.selectedRagSetting!]: {
                                              ...current
                                                .ragSettings[
                                                  current.selectedRagSetting!
                                                ],
                                              vertexOAuthClientId:
                                                client.clientId,
                                              vertexOAuthClientSecret:
                                                client.clientSecret,
                                              vertexProjectId:
                                                client.projectId ||
                                                current
                                                  .ragSettings[
                                                    current.selectedRagSetting!
                                                  ].vertexProjectId,
                                            },
                                          },
                                        }));
                                        setVertexStatus(
                                          client.projectId
                                            ? `OAuth client loaded · ${client.projectId}`
                                            : "OAuth client loaded",
                                        );
                                      }}
                                    >
                                      Browse JSON
                                    </button>
                                  </div>
                                </label>
                                <label className="settings-field">
                                  <span>Desktop OAuth client secret</span>
                                  <input
                                    type="password"
                                    value={selectedRAG.vertexOAuthClientSecret}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setChatSettings((current) => ({
                                        ...current,
                                        ragSettings: {
                                          ...current.ragSettings,
                                          [current.selectedRagSetting!]: {
                                            ...current
                                              .ragSettings[
                                                current.selectedRagSetting!
                                              ],
                                            vertexOAuthClientSecret: value,
                                          },
                                        },
                                      }));
                                    }}
                                  />
                                </label>
                                <div className="vertex-oauth-actions">
                                  {vertexConnected
                                    ? (
                                      <button
                                        type="button"
                                        className="settings-choice"
                                        onClick={async () => {
                                          await disconnectVertexOAuth();
                                          setVertexConnected(false);
                                          setVertexStatus("Disconnected");
                                        }}
                                      >
                                        Disconnect
                                      </button>
                                    )
                                    : (
                                      <button
                                        type="button"
                                        className="settings-choice"
                                        disabled={!selectedRAG
                                          .vertexOAuthClientId || ragBusy}
                                        onClick={async () => {
                                          setRAGBusy(true);
                                          setVertexStatus(
                                            "Waiting for Google login…",
                                          );
                                          try {
                                            const status =
                                              await connectVertexOAuth(
                                                selectedRAG.vertexOAuthClientId,
                                                selectedRAG
                                                  .vertexOAuthClientSecret,
                                              );
                                            setVertexConnected(
                                              status.connected,
                                            );
                                            setVertexStatus(
                                              status.connected
                                                ? "Google account connected"
                                                : "Not connected",
                                            );
                                          } catch (caught) {
                                            setVertexStatus(
                                              caught instanceof Error
                                                ? caught.message
                                                : String(caught),
                                            );
                                          } finally {
                                            setRAGBusy(false);
                                          }
                                        }}
                                      >
                                        Connect Google account
                                      </button>
                                    )}
                                  <small>
                                    Uses the Cloud Platform scope. The refresh
                                    token is stored in the app's protected user
                                    configuration directory.
                                  </small>
                                </div>
                              </section>
                            )
                            : (
                              <label className="settings-field">
                                <span>Embedding API key</span>
                                <input
                                  type="password"
                                  value={selectedRAG.embeddingApiKey}
                                  placeholder="API key"
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setChatSettings((current) => ({
                                      ...current,
                                      ragSettings: {
                                        ...current.ragSettings,
                                        [current.selectedRagSetting!]: {
                                          ...current
                                            .ragSettings[
                                              current.selectedRagSetting!
                                            ],
                                          embeddingApiKey: value,
                                        },
                                      },
                                    }));
                                  }}
                                />
                                <small className="settings-hint">
                                  Used only with this custom embedding URL.
                                </small>
                              </label>
                            )}
                          {selectedRAG.embeddingSource === "custom" &&
                            selectedRAG.embeddingProvider === "vertex" && (
                            <details className="vertex-advanced">
                              <summary>Advanced</summary>
                              <div className="rag-number-grid">
                                <label className="settings-field">
                                  <span>Google Cloud project ID override</span>
                                  <input
                                    value={selectedRAG.vertexProjectId}
                                    placeholder="Loaded from OAuth JSON"
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setChatSettings((current) => ({
                                        ...current,
                                        ragSettings: {
                                          ...current.ragSettings,
                                          [current.selectedRagSetting!]: {
                                            ...current
                                              .ragSettings[
                                                current.selectedRagSetting!
                                              ],
                                            vertexProjectId: value,
                                          },
                                        },
                                      }));
                                    }}
                                  />
                                </label>
                                <label className="settings-field">
                                  <span>Location</span>
                                  <select
                                    className="settings-select"
                                    value={selectedRAG.vertexLocation}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setChatSettings((current) => ({
                                        ...current,
                                        ragSettings: {
                                          ...current.ragSettings,
                                          [current.selectedRagSetting!]: {
                                            ...current
                                              .ragSettings[
                                                current.selectedRagSetting!
                                              ],
                                            vertexLocation: value,
                                          },
                                        },
                                      }));
                                    }}
                                  >
                                    <option value="global">global</option>
                                    <option value="us">us</option>
                                    <option value="eu">eu</option>
                                  </select>
                                </label>
                              </div>
                              <small>
                                Only change these when the embedding project or
                                multi-region differs from the OAuth client
                                defaults.
                              </small>
                            </details>
                          )}
                          <label className="settings-field">
                            <span>Embedding model</span>
                            <input
                              value={selectedRAG.embeddingModel}
                              placeholder={selectedRAG.embeddingProvider ===
                                  "vertex"
                                ? "gemini-embedding-2"
                                : selectedRAG.embeddingProvider === "gemini"
                                ? "gemini-embedding-2-preview"
                                : "Model name"}
                              onChange={(event) => {
                                const value = event.target.value;
                                setChatSettings((current) => ({
                                  ...current,
                                  ragSettings: {
                                    ...current.ragSettings,
                                    [current.selectedRagSetting!]: {
                                      ...current
                                        .ragSettings[
                                          current.selectedRagSetting!
                                        ],
                                      embeddingModel: value,
                                    },
                                  },
                                }));
                              }}
                            />
                          </label>
                          <div className="rag-number-grid">
                            <label className="settings-field">
                              <span>Chunk size</span>
                              <input
                                type="number"
                                min="100"
                                value={selectedRAG.chunkSize}
                                onChange={(event) => {
                                  const value = Number(event.target.value);
                                  setChatSettings((current) => ({
                                    ...current,
                                    ragSettings: {
                                      ...current.ragSettings,
                                      [current.selectedRagSetting!]: {
                                        ...current
                                          .ragSettings[
                                            current.selectedRagSetting!
                                          ],
                                        chunkSize: value,
                                      },
                                    },
                                  }));
                                }}
                              />
                            </label>
                            <label className="settings-field">
                              <span>Chunk overlap</span>
                              <input
                                type="number"
                                min="0"
                                value={selectedRAG.chunkOverlap}
                                onChange={(event) => {
                                  const value = Number(event.target.value);
                                  setChatSettings((current) => ({
                                    ...current,
                                    ragSettings: {
                                      ...current.ragSettings,
                                      [current.selectedRagSetting!]: {
                                        ...current
                                          .ragSettings[
                                            current.selectedRagSetting!
                                          ],
                                        chunkOverlap: value,
                                      },
                                    },
                                  }));
                                }}
                              />
                            </label>
                          </div>
                          <label className="settings-field">
                            <span>Retrieved chunks: {selectedRAG.topK}</span>
                            <input
                              type="range"
                              min="1"
                              max="20"
                              value={selectedRAG.topK}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                setChatSettings((current) => ({
                                  ...current,
                                  ragSettings: {
                                    ...current.ragSettings,
                                    [current.selectedRagSetting!]: {
                                      ...current
                                        .ragSettings[
                                          current.selectedRagSetting!
                                        ],
                                      topK: value,
                                    },
                                  },
                                }));
                              }}
                            />
                          </label>
                          <label className="settings-field">
                            <span>
                              Score threshold:{" "}
                              {selectedRAG.scoreThreshold.toFixed(1)}
                            </span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={selectedRAG.scoreThreshold}
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                setChatSettings((current) => ({
                                  ...current,
                                  ragSettings: {
                                    ...current.ragSettings,
                                    [current.selectedRagSetting!]: {
                                      ...current
                                        .ragSettings[
                                          current.selectedRagSetting!
                                        ],
                                      scoreThreshold: value,
                                    },
                                  },
                                }));
                              }}
                            />
                          </label>
                          <label className="settings-field">
                            <span>
                              Target folders (one per line; empty = all)
                            </span>
                            <LineSeparatedTextarea
                              value={selectedRAG.targetFolders}
                              onChange={(value) => {
                                setChatSettings((current) => ({
                                  ...current,
                                  ragSettings: {
                                    ...current.ragSettings,
                                    [current.selectedRagSetting!]: {
                                      ...current
                                        .ragSettings[
                                          current.selectedRagSetting!
                                        ],
                                      targetFolders: value,
                                    },
                                  },
                                }));
                              }}
                            />
                          </label>
                          <label className="settings-field">
                            <span>Exclude regex patterns (one per line)</span>
                            <LineSeparatedTextarea
                              value={selectedRAG.excludePatterns}
                              onChange={(value) => {
                                setChatSettings((current) => ({
                                  ...current,
                                  ragSettings: {
                                    ...current.ragSettings,
                                    [current.selectedRagSetting!]: {
                                      ...current
                                        .ragSettings[
                                          current.selectedRagSetting!
                                        ],
                                      excludePatterns: value,
                                    },
                                  },
                                }));
                              }}
                            />
                          </label>
                          <label className="settings-field">
                            <span>
                              Search file extensions (comma separated; empty =
                              all)
                            </span>
                            <CommaSeparatedInput
                              value={selectedRAG.searchFileExtensions}
                              onChange={(value) => {
                                setChatSettings((current) => ({
                                  ...current,
                                  ragSettings: {
                                    ...current.ragSettings,
                                    [current.selectedRagSetting!]: {
                                      ...current
                                        .ragSettings[
                                          current.selectedRagSetting!
                                        ],
                                      searchFileExtensions: value,
                                    },
                                  },
                                }));
                              }}
                            />
                            <small className="settings-hint">
                              Markdown, TXT, and PDF are indexed. Gemini
                              Embedding 2 also indexes supported images, audio,
                              and video directly. This filter limits search
                              results.
                            </small>
                          </label>
                          <div className="rag-sync-row">
                            <button
                              type="button"
                              className="settings-choice"
                              disabled={ragBusy || !workspacePath ||
                                (selectedRAG.embeddingProvider === "vertex" &&
                                  !vertexConnected)}
                              title={!workspacePath
                                ? "An active Workspace is required"
                                : selectedRAG.embeddingProvider === "vertex" &&
                                    !vertexConnected
                                ? "Connect Vertex AI before syncing"
                                : "Sync the active Workspace index"}
                              onClick={async () => {
                                const name = chatSettings.selectedRagSetting!;
                                const setting = resolveRAGSetting(
                                  chatSettings,
                                  selectedRAG,
                                );
                                setRAGBusy(true);
                                setRAGStatus("Syncing…");
                                setRAGErrors([]);
                                try {
                                  let result = await syncRAG(name, setting);
                                  let embedded = result.embedded;
                                  let removed = result.removed;
                                  const errors = [...result.errors];
                                  while (result.deferredFiles > 0) {
                                    result = await syncRAG(name, setting);
                                    embedded += result.embedded;
                                    removed += result.removed;
                                    errors.push(...result.errors);
                                  }
                                  const now = Date.now();
                                  setChatSettings((current) => ({
                                    ...current,
                                    ragSettings: {
                                      ...current.ragSettings,
                                      [name]: {
                                        ...current.ragSettings[name],
                                        lastFullSync: now,
                                      },
                                    },
                                  }));
                                  setRAGStatus(
                                    `${result.chunkCount} chunks · ${result.fileCount} files · embedded ${embedded}, skipped ${result.skipped}, removed ${removed}${
                                      errors.length
                                        ? ` · ${errors.length} errors`
                                        : ""
                                    }`,
                                  );
                                  setRAGErrors(errors);
                                } catch (caught) {
                                  const message = caught instanceof Error
                                    ? caught.message
                                    : String(caught);
                                  setRAGStatus(`Sync failed: ${message}`);
                                  setRAGErrors([message]);
                                } finally {
                                  setRAGBusy(false);
                                }
                              }}
                            >
                              <Database size={15} />{" "}
                              {ragBusy ? "Syncing…" : "Sync index"}
                            </button>
                            <span>
                              {ragStatus || (selectedRAG.lastFullSync
                                ? `Last sync: ${
                                  new Date(selectedRAG.lastFullSync)
                                    .toLocaleString()
                                }`
                                : "Never synced")}
                            </span>
                          </div>
                          {ragErrors.length > 0 && (
                            <div className="rag-error-list">
                              <strong>Embedding errors</strong>
                              {ragErrors.slice(0, 10).map((error, index) => (
                                <code key={`${index}-${error}`}>{error}</code>
                              ))}
                              {ragErrors.length > 10 && (
                                <small>…and {ragErrors.length - 10} more</small>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {settingsSection === "discord" && (
                    <>
                      <section className="settings-info-card">
                        <Bot size={20} />
                        <div>
                          <strong>Discord bot</strong>
                          <p>
                            Connect a bot to use Chat, local retrieval, and the
                            selected DirectoryBase file tools from Discord.
                            Disconnecting stops all Discord access.
                          </p>
                        </div>
                      </section>
                      <label className="settings-field">
                        <span>Bot token</span>
                        <input
                          type="password"
                          value={chatSettings.discord.botToken}
                          placeholder="Discord Developer Portal bot token"
                          onChange={(event) =>
                            setChatSettings((current) => ({
                              ...current,
                              discord: {
                                ...current.discord,
                                botToken: event.target.value,
                              },
                            }))}
                        />
                        <small className="settings-hint">
                          Message Content Intent is only required when “Require
                          mention in servers” is turned off.
                        </small>
                      </label>
                      <div className="discord-connection-row">
                        {chatSettings.discord.enabled
                          ? (
                            <button
                              type="button"
                              className="settings-choice"
                              disabled={discordBusy}
                              onClick={async () => {
                                setDiscordBusy(true);
                                try {
                                  await stopDiscordBot();
                                  setDiscordStatus({
                                    running: false,
                                    connected: false,
                                  });
                                  setChatSettings((current) => ({
                                    ...current,
                                    discord: {
                                      ...current.discord,
                                      enabled: false,
                                    },
                                  }));
                                } finally {
                                  setDiscordBusy(false);
                                }
                              }}
                            >
                              Disconnect
                            </button>
                          )
                          : (
                            <>
                              <button
                                type="button"
                                className="settings-choice"
                                disabled={discordBusy ||
                                  !chatSettings.discord.botToken}
                                onClick={async () => {
                                  setDiscordBusy(true);
                                  try {
                                    const status = await verifyDiscordToken(
                                      chatSettings.discord.botToken,
                                    );
                                    setDiscordStatus(status);
                                  } catch (caught) {
                                    setDiscordStatus({
                                      running: false,
                                      connected: false,
                                      error: caught instanceof Error
                                        ? caught.message
                                        : String(caught),
                                    });
                                  } finally {
                                    setDiscordBusy(false);
                                  }
                                }}
                              >
                                Verify token
                              </button>
                              <button
                                type="button"
                                className="settings-choice primary"
                                disabled={discordBusy ||
                                  !chatSettings.discord.botToken ||
                                  !discordProvider}
                                onClick={async () => {
                                  const next = {
                                    ...chatSettings,
                                    discord: {
                                      ...chatSettings.discord,
                                      enabled: true,
                                      provider: discordProvider ?? "",
                                    },
                                  };
                                  setDiscordBusy(true);
                                  try {
                                    const request = await discordBotRequest(
                                      next,
                                    );
                                    if (!request) {
                                      throw new Error(
                                        "Configure an AI provider before connecting Discord.",
                                      );
                                    }
                                    const status = await startDiscordBot(
                                      request,
                                    );
                                    setDiscordStatus(status);
                                    setChatSettings(next);
                                  } catch (caught) {
                                    setDiscordStatus({
                                      running: false,
                                      connected: false,
                                      error: caught instanceof Error
                                        ? caught.message
                                        : String(caught),
                                    });
                                  } finally {
                                    setDiscordBusy(false);
                                  }
                                }}
                              >
                                Connect
                              </button>
                            </>
                          )}
                        <span
                          className={discordStatus.connected
                            ? "discord-status connected"
                            : "discord-status"}
                        >
                          {discordBusy
                            ? "Connecting…"
                            : discordStatus.connected
                            ? `Connected as ${discordStatus.username || "bot"}`
                            : discordStatus.username
                            ? `Verified: ${discordStatus.username}`
                            : "Disconnected"}
                        </span>
                      </div>
                      {discordStatus.error && (
                        <div className="settings-status">
                          {discordStatus.error}
                        </div>
                      )}
                      {discordStatus.lastEvent && (
                        <div className="discord-activity">
                          <strong>Activity</strong>
                          <span>{discordStatus.lastEvent}</span>
                        </div>
                      )}
                      <label className="settings-field">
                        <span>AI provider</span>
                        <select
                          className="settings-select"
                          value={discordProvider ?? ""}
                          disabled={discordProviders.length === 0 ||
                            chatSettings.discord.enabled}
                          onChange={(event) => {
                            const provider = event.target.value as ChatProvider;
                            const resolved = switchChatProvider(
                              chatSettings,
                              provider,
                            );
                            setChatSettings((current) => ({
                              ...current,
                              discord: {
                                ...current.discord,
                                provider,
                                model: resolved.model,
                              },
                            }));
                          }}
                        >
                          {discordProviders.length === 0 && (
                            <option value="">
                              Configure an AI provider first
                            </option>
                          )}
                          {discordProviders.map((provider) => (
                            <option key={provider} value={provider}>
                              {provider === "openai"
                                ? "OpenAI / Compatible"
                                : provider === "gemini"
                                ? "Google Gemini"
                                : provider === "vertex"
                                ? "Vertex AI"
                                : provider === "anthropic"
                                ? "Anthropic"
                                : cliNames[chatSettings.cliType]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {discordResolvedSettings?.provider !== "cli" && (
                        <label className="settings-field">
                          <span>Model</span>
                          <input
                            value={chatSettings.discord.model ||
                              discordResolvedSettings?.model || ""}
                            list="discord-models"
                            disabled={chatSettings.discord.enabled}
                            onChange={(event) =>
                              setChatSettings((current) => ({
                                ...current,
                                discord: {
                                  ...current.discord,
                                  model: event.target.value,
                                },
                              }))}
                          />
                          <datalist id="discord-models">
                            {discordModels.map((model) => (
                              <option key={model} value={model} />
                            ))}
                          </datalist>
                        </label>
                      )}
                      <label className="settings-field">
                        <span>RAG</span>
                        <select
                          className="settings-select"
                          value={chatSettings.discord.ragSetting ?? ""}
                          disabled={chatSettings.discord.enabled}
                          onChange={(event) =>
                            setChatSettings((current) => ({
                              ...current,
                              discord: {
                                ...current.discord,
                                ragSetting: event.target.value || null,
                              },
                            }))}
                        >
                          <option value="">None</option>
                          {Object.keys(chatSettings.ragSettings).map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </label>
                      <div className="discord-check-grid">
                        <label className="settings-check">
                          <input
                            type="checkbox"
                            checked={chatSettings.discord.respondToDMs}
                            disabled={chatSettings.discord.enabled}
                            onChange={(event) =>
                              setChatSettings((current) => ({
                                ...current,
                                discord: {
                                  ...current.discord,
                                  respondToDMs: event.target.checked,
                                },
                              }))}
                          />{" "}
                          Respond to direct messages
                        </label>
                        <label className="settings-check">
                          <input
                            type="checkbox"
                            checked={chatSettings.discord.requireMention}
                            disabled={chatSettings.discord.enabled}
                            onChange={(event) =>
                              setChatSettings((current) => ({
                                ...current,
                                discord: {
                                  ...current.discord,
                                  requireMention: event.target.checked,
                                },
                              }))}
                          />{" "}
                          Require mention in servers
                        </label>
                      </div>
                      <label className="settings-field">
                        <span>
                          Allowed channel IDs (comma or newline separated)
                        </span>
                        <textarea
                          rows={2}
                          value={chatSettings.discord.allowedChannelIds}
                          disabled={chatSettings.discord.enabled}
                          placeholder="Empty allows every channel"
                          onChange={(event) =>
                            setChatSettings((current) => ({
                              ...current,
                              discord: {
                                ...current.discord,
                                allowedChannelIds: event.target.value,
                              },
                            }))}
                        />
                      </label>
                      <label className="settings-field">
                        <span>
                          Allowed user IDs (comma or newline separated)
                        </span>
                        <textarea
                          rows={2}
                          value={chatSettings.discord.allowedUserIds}
                          disabled={chatSettings.discord.enabled}
                          placeholder="Empty allows every user"
                          onChange={(event) =>
                            setChatSettings((current) => ({
                              ...current,
                              discord: {
                                ...current.discord,
                                allowedUserIds: event.target.value,
                              },
                            }))}
                        />
                      </label>
                      <label className="settings-field">
                        <span>System prompt</span>
                        <textarea
                          rows={5}
                          value={chatSettings.discord.systemPrompt}
                          disabled={chatSettings.discord.enabled}
                          onChange={(event) =>
                            setChatSettings((current) => ({
                              ...current,
                              discord: {
                                ...current.discord,
                                systemPrompt: event.target.value,
                              },
                            }))}
                        />
                      </label>
                      <label className="settings-field">
                        <span>Maximum response length</span>
                        <input
                          type="number"
                          min="200"
                          max="2000"
                          value={chatSettings.discord.maxResponseLength}
                          disabled={chatSettings.discord.enabled}
                          onChange={(event) =>
                            setChatSettings((current) => ({
                              ...current,
                              discord: {
                                ...current.discord,
                                maxResponseLength: Math.min(
                                  2000,
                                  Math.max(
                                    200,
                                    Number(event.target.value) || 1900,
                                  ),
                                ),
                              },
                            }))}
                        />
                      </label>
                      <section className="settings-warning">
                        <strong>File access</strong>
                        <p>
                          The bot uses the file-tool mode selected in Chat. File
                          changes requested through Discord are applied
                          immediately while connected. Use allowed channel and
                          user IDs when the bot is installed in a shared server.
                        </p>
                      </section>
                    </>
                  )}
                  {settingsSection === "plugins" && (
                    <div id="plugin-settings-manager" />
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {historyOpen && (
          <div
            className="history-backdrop"
            onClick={() => setHistoryOpen(false)}
          >
            <section
              className="history-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="history-header">
                <div>
                  <strong>
                    {historyMode === "compare"
                      ? tr("history.compareFile")
                      : tr("history.title")}
                  </strong>
                  {historyMode === "history" && (
                    <span>
                      {visibleCheckpoints.length}{" "}
                      {tr("history.checkpointsSuffix")}
                    </span>
                  )}
                </div>
                {historyMode === "compare" && (
                  <ComparisonFilePicker
                    files={comparisonFiles}
                    placeholder={tr("history.chooseFile")}
                    searchPlaceholder={tr("picker.searchFiles")}
                    emptyLabel={tr("picker.noFiles")}
                    onSelect={(path) => {
                      void readWorkspaceFile(path).then((file) => {
                        if (!file) return;
                        setComparisonTarget({
                          label: `${
                            comparisonSource?.path || fileName ||
                            "Current document"
                          } ↔ ${path}`,
                          before: comparisonSource?.content ?? content,
                          after: file.content,
                        });
                      });
                    }}
                  />
                )}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setHistoryOpen(false)}
                  title={tr("common.close")}
                >
                  <X size={18} />
                </button>
              </header>

              <div
                className={`history-body ${
                  historyMode === "compare" ? "compare" : ""
                }`}
              >
                {historyMode === "history" && (
                  <div className="history-list">
                    {[...visibleCheckpoints].reverse().map(
                      (checkpoint, index) => {
                        const previous = visibleCheckpoints[
                          visibleCheckpoints.findIndex((item) =>
                            item.id === checkpoint.id
                          ) - 1
                        ];
                        const isCurrent = index === 0 &&
                          checkpointHash(fileName, content, dashboard) ===
                            checkpointHash(
                              checkpoint.fileName,
                              checkpoint.content,
                              checkpoint.dashboard,
                            );
                        const isSelected =
                          selectedHistoryCheckpoint?.id === checkpoint.id;
                        const stats = checkpointDiffStats(previous, checkpoint);
                        return (
                          <article
                            key={checkpoint.id}
                            className={`history-item ${
                              isSelected ? "selected" : ""
                            }`}
                            onClick={() => {
                              setComparisonTarget(null);
                              setSelectedHistoryId(checkpoint.id);
                            }}
                          >
                            <div className="history-item-main">
                              <strong>
                                {reasonLabel(tr, checkpoint.reason)}
                              </strong>
                              <span>
                                {checkpoint.timestamp.toLocaleString()}
                              </span>
                              <small>
                                {changedSummary(tr, checkpoint, previous)}
                                {previous
                                  ? `  +${stats.additions} / -${stats.deletions}`
                                  : ""}
                              </small>
                            </div>
                            <button
                              type="button"
                              className="history-restore"
                              onClick={(event) => {
                                event.stopPropagation();
                                restoreCheckpoint(checkpoint);
                              }}
                              disabled={isCurrent}
                              title={isCurrent
                                ? tr("history.currentState")
                                : tr("history.restoreTooltip")}
                            >
                              {isCurrent ? <Check size={16} /> : null}
                              <span>
                                {isCurrent
                                  ? tr("history.current")
                                  : tr("history.restore")}
                              </span>
                            </button>
                          </article>
                        );
                      },
                    )}
                    {visibleCheckpoints.length === 0 && (
                      <div className="history-empty">{tr("history.empty")}</div>
                    )}
                  </div>
                )}
                {historyMode === "history" || comparisonTarget
                  ? (
                    <HistoryDiffPanel
                      checkpoint={historyMode === "history"
                        ? selectedHistoryCheckpoint
                        : undefined}
                      previous={historyMode === "history"
                        ? selectedHistoryPrevious
                        : undefined}
                      comparisonTarget={comparisonTarget}
                      viewMode={historyDiffViewMode}
                      onViewModeChange={setHistoryDiffViewMode}
                    />
                  )
                  : (
                    <div className="history-diff-empty">
                      {tr("history.chooseFile")}
                    </div>
                  )}
              </div>
            </section>
          </div>
        )}
      </main>
    </I18nProvider>
  );
}
