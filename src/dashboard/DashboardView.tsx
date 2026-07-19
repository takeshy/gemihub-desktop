import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Code,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FilePlus,
  FileText,
  FolderOpen,
  Globe2,
  GripVertical,
  History,
  Image,
  type LucideIcon,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  SquarePen,
  Workflow as WorkflowIcon,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useI18n } from "../i18n/context";
import { epubToHtml, isEpubFileName } from "../lib/epub";
import { FileWidgetBody } from "./FileWidgetBody";
import {
  fileInventory,
  hasWailsBackend,
  inspectLocalPath,
  onWailsFileDrop,
  openExternalEditor,
  openHTMLInBrowser,
  readFile,
  readLocalFile,
  saveHTMLExport,
  selectLocalFilePath,
  writeFile,
} from "../lib/wailsBackend";
import type { EqualizeLayoutDirection, MarkdownMode } from "../App";
import type { DashboardData, DashboardWidget, LayoutPos } from "./types";
import { type ChatSettings, configuredChatProviders } from "../llm/settings";
import type { ActiveSelection } from "../llm/selection";
import { WorkflowWidget } from "./WorkflowWidget";
import {
  BaseDashboardWidget,
  KanbanDashboardWidget,
  MemoListDashboardWidget,
  SecretManagerDashboardWidget,
  TimelineDashboardWidget,
  UnknownDashboardWidget,
  WebDashboardWidget,
} from "./DashboardWidgets";
import { WidgetPalette } from "./WidgetPalette";
import { WidgetSettingsPanel } from "./WidgetSettingsPanel";
import { CalendarDashboardWidget } from "./CalendarDashboardWidget";
import {
  dashboardPluginWidgetForPath,
  dashboardWidgetDefinition,
  dashboardWidgetFilePath,
  dashboardWidgetHasSettings,
  isDashboardWidgetConfigured,
} from "./widgetRegistry";
import { shouldPersistFileWidgetText } from "./fileWidgetPersistence";
import {
  docKindFor,
  isBinaryDocumentFileName,
  isFileWidgetFileName,
} from "./documentKind";
import { renderMarkdownToPrintableHTML } from "../lib/printableHtml";
import {
  openEncryptedWorkspaceFile,
  rememberedFilePassword,
} from "../lib/fileEncryption";
import { isEncryptedFile, reencryptFileContent } from "../lib/hybridEncryption";

const DEFAULT_COLS = 12;
const DEFAULT_ROW_HEIGHT = 80;
const MIN_ROW_HEIGHT = 44;
const DEFAULT_GAP = 8;
const MAX_WIDGETS = 100;
const DEFAULT_VIEW_FONT_SCALE = 100;
const MIN_VIEW_FONT_SCALE = 70;
const MAX_VIEW_FONT_SCALE = 240;
const VIEW_FONT_STEP = 10;
const DEFAULT_VIEW_WIDTH_SCALE = 100;
const MIN_VIEW_WIDTH_SCALE = 70;
const MAX_VIEW_WIDTH_SCALE = 180;
const VIEW_WIDTH_STEP = 10;

interface RecentFile {
  id: string;
  fileName: string;
  filePath?: string;
  content: string;
  mode: MarkdownMode;
  updatedAt: Date;
}

interface PickerFile {
  path: string;
  fileName: string;
  updatedAt: Date;
}

interface WidgetNavigationHistory {
  back: string[];
  forward: string[];
}

function clampLayout(pos: LayoutPos, cols = DEFAULT_COLS): LayoutPos {
  const minWidth = Math.min(2, cols);
  const w = Math.max(minWidth, Math.min(cols, pos.w));
  const h = Math.max(1, pos.h);
  return {
    x: Math.max(0, Math.min(cols - w, pos.x)),
    y: Math.max(0, pos.y),
    w,
    h,
  };
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

async function prepareOpenedContent(
  fileName: string,
  content: string,
): Promise<string> {
  if (!isEpubFileName(fileName)) return content;
  const blob = dataUrlToBlob(content);
  if (!blob) throw new Error("EPUB content was not returned as binary data.");
  return await epubToHtml(
    new File([blob], fileName || "document.epub", {
      type: "application/epub+zip",
    }),
  );
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

function readFileMode(fileName: string): MarkdownMode {
  return "preview";
}

function isEditMode(mode: unknown): mode is "wysiwyg" | "raw" {
  return mode === "wysiwyg" || mode === "raw";
}

function isImageFileName(fileName: string) {
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(fileName);
}

function isFileWidgetType(type: string): boolean {
  return type === "file" || type === "markdown";
}
function rawFilePathFromConfig(config: Record<string, unknown>): string {
  return typeof config.filePath === "string"
    ? config.filePath
    : typeof config.path === "string"
    ? config.path
    : "";
}
function filePathFromConfig(config: Record<string, unknown>): string {
  return rawFilePathFromConfig(config).replace(
    /^(?:workspace|files):\/\//i,
    "",
  );
}
function fileReadPathFromConfig(config: Record<string, unknown>): string {
  const raw = rawFilePathFromConfig(config);
  if (/^(?:workspace|files):\/\//i.test(raw)) return raw;
  if (config.fileScope === "workspace") return `workspace://${raw}`;
  if (config.fileScope === "files") return `files://${raw}`;
  return raw;
}
function normalizedFileReference(
  path?: string,
): { filePath?: string; fileScope?: "workspace" | "files" } {
  if (!path) return { filePath: path, fileScope: undefined };
  if (/^workspace:\/\//i.test(path)) {
    return {
      filePath: path.replace(/^workspace:\/\//i, ""),
      fileScope: "workspace",
    };
  }
  if (/^files:\/\//i.test(path)) {
    return {
      filePath: path.replace(/^files:\/\//i, ""),
      fileScope: "files",
    };
  }
  return { filePath: path, fileScope: undefined };
}
function configString(config: Record<string, unknown>, key: string): string {
  return typeof config[key] === "string" ? config[key] as string : "";
}
function isWorkspaceBackedPath(path: string): boolean {
  if (path.startsWith("workspace://")) return true;
  if (path.startsWith("files://")) return false;
  if (/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path)) return false;
  return /^(?:Dashboards|Memos|Secrets|skills|workflows)(?:[\\/]|$)/i.test(
    path,
  );
}

function recentContent(
  fileName: string,
  content: string,
  filePath?: string,
): string {
  return filePath && isBinaryDocumentFileName(fileName) ? "" : content;
}

function readViewFontScale(config: Record<string, unknown>): number {
  const value = typeof config.viewFontScale === "number"
    ? config.viewFontScale
    : DEFAULT_VIEW_FONT_SCALE;
  return Math.max(MIN_VIEW_FONT_SCALE, Math.min(MAX_VIEW_FONT_SCALE, value));
}

function nextViewFontScale(current: number, direction: -1 | 1): number {
  return Math.max(
    MIN_VIEW_FONT_SCALE,
    Math.min(MAX_VIEW_FONT_SCALE, current + direction * VIEW_FONT_STEP),
  );
}

function readViewWidthScale(config: Record<string, unknown>): number {
  const value = typeof config.viewWidthScale === "number"
    ? config.viewWidthScale
    : DEFAULT_VIEW_WIDTH_SCALE;
  return Math.max(MIN_VIEW_WIDTH_SCALE, Math.min(MAX_VIEW_WIDTH_SCALE, value));
}

function nextViewWidthScale(current: number, direction: -1 | 1): number {
  return Math.max(
    MIN_VIEW_WIDTH_SCALE,
    Math.min(MAX_VIEW_WIDTH_SCALE, current + direction * VIEW_WIDTH_STEP),
  );
}

function rectIsFree(
  widgets: DashboardWidget[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  return widgets.every((widget) => {
    const layout = widget.layout;
    return x + w <= layout.x || layout.x + layout.w <= x || y + h <= layout.y ||
      layout.y + layout.h <= y;
  });
}

function nextWidgetLayout(
  type: DashboardWidget["type"],
  widgets: DashboardWidget[],
  direction: EqualizeLayoutDirection,
  cols = DEFAULT_COLS,
): LayoutPos {
  const def = dashboardWidgetDefinition(type) ??
    dashboardWidgetDefinition("file")!;
  const height =
    widgets.length > 0 && widgets.every((widget) => widget.layout.h === 1)
      ? 1
      : (def.defaultSize?.h ?? 4);
  const maxY = widgets.reduce(
    (max, widget) => Math.max(max, widget.layout.y + widget.layout.h),
    0,
  );

  if (direction === "vertical") return { x: 0, y: maxY, w: cols, h: height };

  const slots = Math.min(3, Math.max(1, widgets.length + 1), cols);
  const slotWidth = Math.max(1, Math.floor(cols / slots));
  const candidateRows = [
    ...new Set(widgets.map((widget) => widget.layout.y)),
    maxY,
  ].sort((a, b) => a - b);

  for (const y of candidateRows) {
    for (let index = 0; index < slots; index++) {
      const x = index * slotWidth,
        width = index === slots - 1 ? cols - x : slotWidth;
      if (rectIsFree(widgets, x, y, width, height)) {
        return { x, y, w: width, h: height };
      }
    }
  }

  return { x: 0, y: maxY, w: slotWidth, h: height };
}

function widgetDefaults(
  type: DashboardWidget["type"],
  widgets: DashboardWidget[],
  direction: EqualizeLayoutDirection,
  cols = DEFAULT_COLS,
): DashboardWidget {
  const def = dashboardWidgetDefinition(type) ??
    {
      type,
      label: `Unknown (${type})`,
      defaultConfig: {},
      defaultSize: { w: 5, h: 4 },
    };

  return {
    id: crypto.randomUUID(),
    type,
    title: def.label,
    layout: nextWidgetLayout(type, widgets, direction, cols),
    layoutBreakpoints: {},
    config: structuredClone(def.defaultConfig),
  };
}

function FilePickerDialog({
  query,
  recentFiles,
  onQueryChange,
  onBrowse,
  onSelect,
  onSelectPath,
  onClose,
}: {
  query: string;
  recentFiles: RecentFile[];
  onQueryChange: (value: string) => void;
  onBrowse: () => void;
  onSelect: (file: RecentFile) => void;
  onSelectPath: (path: string) => void;
  onClose: () => void;
}) {
  const { t: tr } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scope, setScope] = useState<"files" | "recent">("files");
  const [files, setFiles] = useState<PickerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRecent = recentFiles.filter((file) =>
    `${file.fileName} ${file.filePath || ""}`.toLowerCase().includes(
      normalizedQuery,
    )
  );
  const filteredFiles = files.filter((file) =>
    file.path.toLowerCase().includes(normalizedQuery)
  ).slice(0, 200);
  const visibleCount = scope === "files"
    ? filteredFiles.length
    : filteredRecent.length;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fileInventory().then((inventory) => {
      if (cancelled) return;
      setFiles(
        inventory.filter((entry) => isFileWidgetFileName(entry.path)).map((
          entry,
        ) => ({
          path: entry.path,
          fileName: entry.path.replaceAll("\\", "/").split("/").pop() ||
            entry.path,
          updatedAt: new Date(entry.modTime),
        })),
      );
    }).catch(() => {
      if (!cancelled) setFiles([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => setActiveIndex(0), [query, scope]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="file-picker-backdrop" onClick={onClose}>
      <section
        className="file-picker"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="file-picker-header">
          <div className="file-picker-search">
            <Search size={17} />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) =>
                    Math.min(index + 1, Math.max(0, visibleCount - 1))
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(0, index - 1));
                }
                if (event.key === "Enter") {
                  if (scope === "files" && filteredFiles[activeIndex]) {
                    onSelectPath(filteredFiles[activeIndex].path);
                  } else if (
                    scope === "recent" && filteredRecent[activeIndex]
                  ) {
                    onSelect(filteredRecent[activeIndex]);
                  }
                }
              }}
              placeholder={scope === "files"
                ? tr("picker.searchFiles")
                : tr("picker.searchRecent")}
              aria-label={scope === "files"
                ? tr("picker.searchFiles")
                : tr("picker.searchRecent")}
            />
          </div>
          <button
            type="button"
            className="file-picker-browse"
            onClick={onBrowse}
          >
            <FolderOpen size={16} />
            <span>{tr("common.browse")}</span>
          </button>
          <button
            type="button"
            className="file-picker-close"
            onClick={onClose}
            title={tr("common.close")}
          >
            <X size={17} />
          </button>
        </header>

        <div className="file-picker-body">
          <aside className="file-picker-rail">
            <button
              type="button"
              className={scope === "files" ? "active" : ""}
              onClick={() => setScope("files")}
            >
              {tr("picker.files")}
            </button>
            <button
              type="button"
              className={scope === "recent" ? "active" : ""}
              onClick={() => setScope("recent")}
            >
              {tr("picker.recent")}
            </button>
            <button type="button" onClick={onBrowse}>
              {tr("picker.localFiles")}
            </button>
          </aside>
          <div className="file-picker-list">
            {scope === "files" && filteredFiles.length > 0
              ? (
                filteredFiles.map((file, index) => (
                  <button
                    key={file.path}
                    type="button"
                    className={`file-picker-item ${
                      index === activeIndex ? "selected" : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => onSelectPath(file.path)}
                  >
                    {isImageFileName(file.fileName)
                      ? <Image size={18} />
                      : <FileText size={18} />}
                    <span>
                      <strong>{file.fileName}</strong>
                      <small>{file.path}</small>
                    </span>
                    <time>{file.updatedAt.toLocaleDateString()}</time>
                  </button>
                ))
              )
              : scope === "recent" && filteredRecent.length > 0
              ? filteredRecent.map((file, index) => (
                <button
                  key={file.id}
                  type="button"
                  className={`file-picker-item ${
                    index === activeIndex ? "selected" : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelect(file)}
                >
                  {isImageFileName(file.fileName)
                    ? <Image size={18} />
                    : <FileText size={18} />}
                  <span>
                    <strong>{file.fileName}</strong>
                    {file.filePath && <small>{file.filePath}</small>}
                  </span>
                  <time>{file.updatedAt.toLocaleTimeString()}</time>
                </button>
              ))
              : (
                <div className="file-picker-empty">
                  <FileText size={24} />
                  <span>
                    {loading && scope === "files"
                      ? "Loading…"
                      : scope === "files"
                      ? tr("picker.noFiles")
                      : tr("picker.noRecent")}
                  </span>
                </div>
              )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function DashboardView({
  data,
  onChange,
  documentMarkdown,
  onDocumentMarkdownChange,
  markdownMode,
  onMarkdownModeChange,
  fileName,
  onFileNameChange,
  onNewDocument,
  onSaveDocument,
  onExportDocument,
  onHistoryClick,
  isDark,
  aiEnabled,
  addWidgetRequest,
  activeLayoutDirection,
  equalizeLayoutRequest,
  splitWidgetRequest,
  openFilePickerRequest,
  externalEditorPath,
  memoDirPath,
  memoSyncTimeline,
  onOpenSettings,
  openPathRequest,
  onHistoryCheckpoint,
  onDeferredHistoryCheckpoint,
  onActiveFileChange,
  onActiveSelectionChange,
  onAskAI,
  onAskMemoAI,
  chatSettings,
  directoryBase,
  workspaceBase,
  dashboardPath,
  startupPaths,
  pluginWidgetRequest,
  onExternalPathOpened,
}: {
  data: DashboardData;
  onChange: Dispatch<SetStateAction<DashboardData>>;
  documentMarkdown: string;
  onDocumentMarkdownChange: (value: string) => void;
  markdownMode: MarkdownMode;
  onMarkdownModeChange: (mode: MarkdownMode) => void;
  fileName: string;
  onFileNameChange: (value: string) => void;
  onNewDocument: () => void;
  onSaveDocument: () => void;
  onExportDocument: () => void;
  onHistoryClick: () => void;
  isDark: boolean;
  aiEnabled: boolean;
  addWidgetRequest: {
    id: number;
    direction: EqualizeLayoutDirection;
    type: string;
  };
  activeLayoutDirection: EqualizeLayoutDirection;
  equalizeLayoutRequest: { id: number; direction: EqualizeLayoutDirection };
  splitWidgetRequest: { id: number; direction: EqualizeLayoutDirection };
  openFilePickerRequest: number;
  externalEditorPath: string;
  memoDirPath: string;
  memoSyncTimeline: string;
  onOpenSettings: () => void;
  openPathRequest: {
    id: number;
    path: string;
    source?: "local" | "directory" | "filetree" | "startup";
  };
  onHistoryCheckpoint: (reason: "reload") => void;
  onDeferredHistoryCheckpoint: (reason: "reload") => void;
  onActiveFileChange: (file: { path: string; content: string } | null) => void;
  onActiveSelectionChange: (selection: ActiveSelection | null) => void;
  onAskAI: (selection: ActiveSelection) => void;
  onAskMemoAI: (draft: string) => void;
  chatSettings: ChatSettings;
  directoryBase: string;
  workspaceBase: string;
  dashboardPath?: string;
  startupPaths: string[] | null;
  pluginWidgetRequest: {
    id: number;
    type: string;
    config: Record<string, unknown>;
  };
  onExternalPathOpened: (path: string, isDirectory?: boolean) => void;
}) {
  const { t: tr } = useI18n();
  const cols = Math.max(
    1,
    Math.min(48, Math.floor(Number(data.grid?.cols) || DEFAULT_COLS)),
  );
  const gapValue = Number(data.grid?.gap);
  const gap = Math.max(
    0,
    Math.min(40, Number.isFinite(gapValue) ? gapValue : DEFAULT_GAP),
  );
  const configuredRowHeight = Math.max(
    MIN_ROW_HEIGHT,
    Math.min(320, Number(data.grid?.rowHeight) || DEFAULT_ROW_HEIGHT),
  );
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsWidgetId, setSettingsWidgetId] = useState<string | null>(null);
  const [pendingNewWidgetId, setPendingNewWidgetId] = useState<string | null>(
    null,
  );
  const [chromeOffsets, setChromeOffsets] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [chromeDragging, setChromeDragging] = useState<
    {
      id: string;
      pointerId: number;
      x: number;
      y: number;
      originX: number;
      originY: number;
    } | null
  >(null);
  const [widgetRegistryVersion, setWidgetRegistryVersion] = useState(0);
  const [maximizedWidgetId, setMaximizedWidgetId] = useState<string | null>(
    null,
  );
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(() =>
    data.widgets.find((widget) => isFileWidgetType(widget.type))?.id ?? null
  );
  const lastActiveFileWidgetIdRef = useRef<string | null>(
    data.widgets.find((widget) => isFileWidgetType(widget.type))?.id ?? null,
  );
  const gridRef = useRef<HTMLDivElement | null>(null);
  const seededRecentFilesRef = useRef(false);
  const handledAddWidgetRequestRef = useRef(0);
  const handledOpenPathRequestRef = useRef(0);
  const handledEqualizeLayoutRequestRef = useRef(0);
  const handledSplitWidgetRequestRef = useRef(0);
  const handledPluginWidgetRequestRef = useRef(0);
  const hydratedFilePathsRef = useRef(new Set<string>());
  const previousWorkspaceBaseRef = useRef(workspaceBase);
  const handledStartupFilesRef = useRef(false);
  const navigationHistoryRef = useRef(
    new Map<string, WidgetNavigationHistory>(),
  );
  const fileSaveTimersRef = useRef(new Map<string, number>());
  const pendingFileWritesRef = useRef(
    new Map<string, { path: string; content: string; displayPath: string }>(),
  );
  const [navigationVersion, setNavigationVersion] = useState(0);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [filePickerTargetId, setFilePickerTargetId] = useState<string | null>(
    null,
  );
  const [filePickerCreatesWidget, setFilePickerCreatesWidget] = useState(false);
  const [filePickerCreateDirection, setFilePickerCreateDirection] = useState<
    EqualizeLayoutDirection
  >("horizontal");
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [gridRowHeight, setGridRowHeight] = useState(configuredRowHeight);
  const [smallGrid, setSmallGrid] = useState(false);
  const [dragging, setDragging] = useState<
    {
      id: string;
      mode: "move" | "resize";
      breakpoint: "lg" | "sm";
      pointerId: number;
      x: number;
      y: number;
      origin: LayoutPos;
      dx: number;
      dy: number;
      next: LayoutPos;
    } | null
  >(null);

  const smallLayouts = useMemo(() => {
    let y = 0;
    const result = new Map<string, LayoutPos>();
    for (
      const widget of [...data.widgets].sort((left, right) =>
        left.layout.y - right.layout.y || left.layout.x - right.layout.x
      )
    ) {
      const position = widget.layoutBreakpoints?.sm ??
        { x: 0, y, w: cols, h: widget.layout.h };
      result.set(widget.id, position);
      y = Math.max(y, position.y + position.h);
    }
    return result;
  }, [cols, data.widgets]);

  useEffect(() => setGridRowHeight(configuredRowHeight), [configuredRowHeight]);

  useEffect(() => {
    const element = gridRef.current?.parentElement;
    if (!element) return;
    const update = () => setSmallGrid(element.clientWidth < 768);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const refresh = () => setWidgetRegistryVersion((value) => value + 1);
    window.addEventListener("llm-hub:dashboard-widgets-changed", refresh);
    return () =>
      window.removeEventListener("llm-hub:dashboard-widgets-changed", refresh);
  }, []);
  void widgetRegistryVersion;

  const fitGridRows = useCallback((rows: number) => {
    void rows;
    setGridRowHeight(configuredRowHeight);
  }, [configuredRowHeight]);

  const updateWidget = useCallback(
    (nextWidget: DashboardWidget) => {
      onChange((current) => ({
        ...current,
        widgets: current.widgets.map((
          widget,
        ) => (widget.id === nextWidget.id ? nextWidget : widget)),
      }));
    },
    [onChange],
  );

  const recordRecentFile = useCallback(
    (
      fileName: string,
      content: string,
      mode: MarkdownMode,
      filePath?: string,
    ) => {
      if (!fileName.trim()) return;
      const storedContent = recentContent(fileName, content, filePath);
      setRecentFiles((items) => [
        {
          id: `${filePath || fileName}-${Date.now()}`,
          fileName,
          filePath,
          content: storedContent,
          mode,
          updatedAt: new Date(),
        },
        ...items.filter((
          item,
        ) => (filePath
          ? item.filePath !== filePath
          : item.fileName !== fileName)
        ).slice(0, 29),
      ]);
    },
    [],
  );

  useEffect(() => {
    if (seededRecentFilesRef.current) return;
    seededRecentFilesRef.current = true;
    data.widgets.forEach((widget) => {
      if (!isFileWidgetType(widget.type)) return;
      const widgetFilePath = filePathFromConfig(widget.config);
      const widgetFileName = typeof widget.config.fileName === "string"
        ? widget.config.fileName
        : widgetFilePath.split("/").pop() || "";
      const widgetContent = typeof widget.config.content === "string"
        ? widget.config.content
        : "";
      const widgetMode =
        widget.config.mode === "preview" || widget.config.mode === "wysiwyg" ||
          widget.config.mode === "raw"
          ? widget.config.mode
          : readFileMode(widgetFileName);
      if (widgetFileName && widgetContent) {
        recordRecentFile(
          widgetFileName,
          widgetContent,
          widgetMode,
          widgetFilePath,
        );
      }
    });
  }, [data.widgets, recordRecentFile]);

  const updateFileWidget = useCallback(
    (widgetId: string, next: Record<string, unknown>) => {
      const widget = data.widgets.find((item) => item.id === widgetId);
      if (!widget) return;
      const nextConfig = { ...widget.config, ...next };
      updateWidget({ ...widget, config: nextConfig });

      const nextFileName = typeof nextConfig.fileName === "string"
        ? nextConfig.fileName
        : "";
      const nextFilePath = filePathFromConfig(nextConfig) || undefined;
      const nextContent = typeof nextConfig.content === "string"
        ? nextConfig.content
        : "";
      const previousContent = typeof widget.config.content === "string"
        ? widget.config.content
        : "";
      const nextMode =
        nextConfig.mode === "preview" || nextConfig.mode === "wysiwyg" ||
          nextConfig.mode === "raw"
          ? nextConfig.mode
          : readFileMode(nextFileName);
      if (nextFileName && nextContent) {
        recordRecentFile(nextFileName, nextContent, nextMode, nextFilePath);
      }
      if (
        nextFilePath &&
        nextConfig.encrypted !== true &&
        shouldPersistFileWidgetText(nextFileName, previousContent, next.content)
      ) {
        const existing = fileSaveTimersRef.current.get(widgetId);
        if (existing) window.clearTimeout(existing);
        const pendingWrite = {
          path: fileReadPathFromConfig(nextConfig),
          content: nextContent,
          displayPath: nextFilePath,
        };
        pendingFileWritesRef.current.set(widgetId, pendingWrite);
        const timer = window.setTimeout(() => {
          fileSaveTimersRef.current.delete(widgetId);
          pendingFileWritesRef.current.delete(widgetId);
          void writeFile(pendingWrite.path, pendingWrite.content).then(() => {
            window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
            window.dispatchEvent(
              new CustomEvent("llm-hub:dashboard-data-changed", {
                detail: { path: nextFilePath },
              }),
            );
          }).catch((error) =>
            console.warn("Dashboard file widget save failed", error)
          );
        }, 450);
        fileSaveTimersRef.current.set(widgetId, timer);
      }
    },
    [data.widgets, recordRecentFile, updateWidget],
  );

  useEffect(() => () => {
    for (const timer of fileSaveTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    fileSaveTimersRef.current.clear();
    for (const pending of pendingFileWritesRef.current.values()) {
      void writeFile(pending.path, pending.content).then(() => {
        window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
        window.dispatchEvent(
          new CustomEvent("llm-hub:dashboard-data-changed", {
            detail: { path: pending.displayPath },
          }),
        );
      }).catch((error) =>
        console.warn("Dashboard file widget flush failed", error)
      );
    }
    pendingFileWritesRef.current.clear();
  }, []);

  const openFilePicker = useCallback(
    (targetId?: string) => {
      const activeTarget = data.widgets.find((widget) =>
        widget.id === activeWidgetId && isFileWidgetType(widget.type)
      )?.id;
      const lastTarget = data.widgets.find((widget) =>
        widget.id === lastActiveFileWidgetIdRef.current &&
        isFileWidgetType(widget.type)
      )?.id;
      const fallbackTarget = activeTarget ?? lastTarget ??
        data.widgets.find((widget) => isFileWidgetType(widget.type))?.id;
      const nextTargetId = targetId ?? fallbackTarget;
      if (nextTargetId) {
        setFilePickerTargetId(nextTargetId);
        setFilePickerCreatesWidget(false);
        setFilePickerQuery("");
        return;
      }

      setFilePickerTargetId(null);
      setFilePickerCreatesWidget(true);
      setFilePickerCreateDirection(activeLayoutDirection);
      setFilePickerQuery("");
    },
    [activeLayoutDirection, activeWidgetId, data.widgets],
  );

  const getGridMetrics = useCallback(() => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return { cellW: 96, cellH: gridRowHeight };
    return {
      cellW: (rect.width - gap * (cols - 1)) / cols,
      cellH: gridRowHeight,
    };
  }, [cols, gap, gridRowHeight]);

  const layoutForPointer = useCallback(
    (event: PointerEvent, current: NonNullable<typeof dragging>) => {
      const { cellW, cellH } = getGridMetrics();
      const dxPx = event.clientX - current.x;
      const dyPx = event.clientY - current.y;
      const dx = Math.round(dxPx / (cellW + gap));
      const dy = Math.round(dyPx / (cellH + gap));
      const next = current.mode === "move"
        ? clampLayout({
          ...current.origin,
          x: current.origin.x + dx,
          y: current.origin.y + dy,
        }, cols)
        : clampLayout({
          ...current.origin,
          w: current.origin.w + dx,
          h: current.origin.h + dy,
        }, cols);
      return { dxPx, dyPx, next };
    },
    [cols, gap, getGridMetrics],
  );

  const commitPointer = useCallback(
    (event?: PointerEvent) => {
      if (!dragging) return;
      const nextLayout = event
        ? layoutForPointer(event, dragging).next
        : dragging.next;
      const widget = data.widgets.find((item) => item.id === dragging.id);
      if (widget) {
        updateWidget(
          dragging.breakpoint === "sm"
            ? {
              ...widget,
              layoutBreakpoints: {
                ...(widget.layoutBreakpoints || {}),
                lg: widget.layout,
                sm: nextLayout,
              },
            }
            : {
              ...widget,
              layout: nextLayout,
              layoutBreakpoints: {
                ...(widget.layoutBreakpoints || {}),
                lg: nextLayout,
              },
            },
        );
      }
      setDragging(null);
    },
    [data.widgets, dragging, layoutForPointer, updateWidget],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      setDragging((current) => {
        if (!current || event.pointerId !== current.pointerId) return current;
        const { dxPx, dyPx, next } = layoutForPointer(event, current);
        return { ...current, dx: dxPx, dy: dyPx, next };
      });
    };
    const onUp = (event: PointerEvent) => commitPointer(event);
    const onCancel = () => commitPointer();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onCancel, { once: true });
    window.addEventListener("blur", onCancel, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onCancel);
    };
  }, [commitPointer, dragging, layoutForPointer]);

  const buildEqualizedWidgets = useCallback(
    (widgets: DashboardWidget[], direction: EqualizeLayoutDirection) => {
      const count = widgets.length;
      if (count === 0) return widgets;

      const primarySlots = Math.min(3, count);
      const groups = Array.from(
        { length: primarySlots },
        () => [] as DashboardWidget[],
      );
      widgets.forEach((widget, index) => {
        groups[index % primarySlots].push(widget);
      });
      const maxGroupSize = Math.max(...groups.map((group) => group.length));
      const availableHeight = gridRef.current?.parentElement?.clientHeight ||
        configuredRowHeight * 6;
      const targetRows = Math.max(
        2,
        Math.floor((availableHeight + gap) / (configuredRowHeight + gap)),
      );

      setMaximizedWidgetId(null);
      setDragging(null);
      fitGridRows(targetRows);

      const layouts = new Map<string, LayoutPos>();
      groups.forEach((group, primaryIndex) => {
        if (direction === "vertical") {
          const rowHeight = Math.max(2, Math.floor(targetRows / primarySlots));
          const slotWidth = Math.max(1, Math.floor(cols / group.length));
          group.forEach((widget, groupIndex) => {
            const x = groupIndex * slotWidth;
            const w = groupIndex === group.length - 1 ? cols - x : slotWidth;
            layouts.set(
              widget.id,
              clampLayout(
                { x, y: primaryIndex * rowHeight, w, h: rowHeight },
                cols,
              ),
            );
          });
          return;
        }

        const slotWidth = Math.max(1, Math.floor(cols / primarySlots));
        const tileHeight = Math.max(2, Math.floor(targetRows / maxGroupSize));
        const x = primaryIndex * slotWidth;
        const w = primaryIndex === primarySlots - 1 ? cols - x : slotWidth;
        group.forEach((widget, groupIndex) => {
          layouts.set(
            widget.id,
            clampLayout({
              x,
              y: groupIndex * tileHeight,
              w,
              h: group.length === 1 ? maxGroupSize * tileHeight : tileHeight,
            }, cols),
          );
        });
      });

      return widgets.map((widget) => ({
        ...widget,
        layout: layouts.get(widget.id) ?? widget.layout,
      }));
    },
    [cols, configuredRowHeight, fitGridRows, gap],
  );

  const buildSplitWidgets = useCallback(
    (
      widgets: DashboardWidget[],
      selectedId: string,
      direction: EqualizeLayoutDirection,
    ) => {
      if (widgets.length <= 1) return widgets;
      const selected = widgets.find((widget) => widget.id === selectedId);
      if (!selected) return widgets;

      const others = widgets.filter((widget) => widget.id !== selectedId);
      const layouts = new Map<string, LayoutPos>();

      setMaximizedWidgetId(null);
      setDragging(null);

      if (direction === "horizontal") {
        const rows = Math.max(1, Math.min(3, others.length));
        const groups = Array.from(
          { length: rows },
          () => [] as DashboardWidget[],
        );
        others.forEach((widget, index) => groups[index % rows].push(widget));
        fitGridRows(rows);

        const primaryWidth = Math.max(1, Math.floor(cols * 2 / 3));
        layouts.set(
          selected.id,
          clampLayout({
            x: primaryWidth,
            y: 0,
            w: cols - primaryWidth,
            h: rows,
          }, cols),
        );
        groups.forEach((group, rowIndex) => {
          const slotWidth = Math.max(
            1,
            Math.floor(primaryWidth / group.length),
          );
          group.forEach((widget, groupIndex) => {
            const x = groupIndex * slotWidth;
            const w = groupIndex === group.length - 1
              ? primaryWidth - x
              : slotWidth;
            layouts.set(
              widget.id,
              clampLayout({ x, y: rowIndex, w, h: 1 }, cols),
            );
          });
        });
      } else {
        const columns = Math.max(1, Math.min(3, others.length));
        const groups = Array.from(
          { length: columns },
          () => [] as DashboardWidget[],
        );
        others.forEach((widget, index) => groups[index % columns].push(widget));
        const maxGroupSize = Math.max(
          1,
          ...groups.map((group) => group.length),
        );
        fitGridRows(maxGroupSize + 1);

        layouts.set(
          selected.id,
          clampLayout({ x: 0, y: maxGroupSize, w: cols, h: 1 }, cols),
        );
        const slotWidth = Math.max(1, Math.floor(cols / columns));
        groups.forEach((group, columnIndex) => {
          const x = columnIndex * slotWidth;
          const w = columnIndex === columns - 1 ? cols - x : slotWidth;
          group.forEach((widget, rowIndex) => {
            layouts.set(
              widget.id,
              clampLayout({
                x,
                y: rowIndex,
                w,
                h: group.length === 1 ? maxGroupSize : 1,
              }, cols),
            );
          });
        });
      }

      return widgets.map((widget) => ({
        ...widget,
        layout: layouts.get(widget.id) ?? widget.layout,
      }));
    },
    [cols, fitGridRows],
  );

  const buildAddedWidgets = useCallback(
    (
      widgets: DashboardWidget[],
      nextWidget: DashboardWidget,
      direction: EqualizeLayoutDirection,
    ) => {
      const layouts = new Map<string, LayoutPos>();
      const FIT_ROWS = 6;

      if (direction === "vertical") {
        const columns = [...new Set(widgets.map((widget) => widget.layout.x))]
          .sort((a, b) => a - b)
          .map((x) =>
            widgets.filter((widget) => widget.layout.x === x).sort((a, b) =>
              a.layout.y - b.layout.y
            )
          );
        if (columns.length === 0) columns.push([]);

        let targetIndex = columns
          .map((column, index) => ({ index, size: column.length }))
          .filter((item) => item.size < 3)
          .sort((a, b) => a.size - b.size || a.index - b.index)[0]?.index;
        if (targetIndex === undefined && columns.length < 3) {
          columns.push([]);
          targetIndex = columns.length - 1;
        }
        columns[targetIndex ?? 0].push(nextWidget);

        const columnCount = Math.min(3, columns.length);
        const slotWidth = Math.floor(cols / columnCount);
        columns.slice(0, columnCount).forEach((column, columnIndex) => {
          const itemCount = Math.max(1, Math.min(3, column.length));
          const slotHeight = Math.floor(FIT_ROWS / itemCount);
          const x = columnIndex * slotWidth;
          const w = columnIndex === columnCount - 1 ? cols - x : slotWidth;
          column.slice(0, 3).forEach((widget, rowIndex) => {
            const y = rowIndex * slotHeight;
            const h = rowIndex === itemCount - 1 ? FIT_ROWS - y : slotHeight;
            layouts.set(widget.id, clampLayout({ x, y, w, h }, cols));
          });
        });
      } else {
        const rows = [...new Set(widgets.map((widget) => widget.layout.y))]
          .sort((a, b) => a - b)
          .map((y) =>
            widgets.filter((widget) => widget.layout.y === y).sort((a, b) =>
              a.layout.x - b.layout.x
            )
          );
        if (rows.length === 0) rows.push([]);

        let targetIndex = rows
          .map((row, index) => ({ index, size: row.length }))
          .filter((item) => item.size < 3)
          .sort((a, b) => a.size - b.size || a.index - b.index)[0]?.index;
        if (targetIndex === undefined && rows.length < 3) {
          rows.push([]);
          targetIndex = rows.length - 1;
        }
        rows[targetIndex ?? 0].push(nextWidget);

        const rowCount = Math.min(3, rows.length);
        const rowHeight = Math.floor(FIT_ROWS / rowCount);
        rows.slice(0, 3).forEach((row, rowIndex) => {
          const rowCount = Math.min(3, row.length);
          const slotWidth = Math.floor(cols / Math.max(1, rowCount));
          const y = rowIndex * rowHeight;
          const h = rowIndex === rows.length - 1 ? FIT_ROWS - y : rowHeight;
          row.slice(0, 3).forEach((widget, columnIndex) => {
            const x = columnIndex * slotWidth;
            const w = columnIndex === rowCount - 1 ? cols - x : slotWidth;
            layouts.set(widget.id, clampLayout({ x, y, w, h }, cols));
          });
        });
      }

      const nextWidgets = [...widgets, nextWidget].map((widget) => ({
        ...widget,
        layout: layouts.get(widget.id) ?? widget.layout,
      }));
      const rows = nextWidgets.reduce(
        (max, widget) => Math.max(max, widget.layout.y + widget.layout.h),
        1,
      );
      setMaximizedWidgetId(null);
      setDragging(null);
      fitGridRows(rows);
      return nextWidgets;
    },
    [cols, fitGridRows],
  );

  const openOrUpdatePluginWidget = useCallback(
    (type: string, config: Record<string, unknown>): string | undefined => {
      const existing = data.widgets.find((widget) => widget.type === type);
      if (!existing && data.widgets.length >= MAX_WIDGETS) return undefined;
      const next = existing
        ? null
        : widgetDefaults(type, data.widgets, activeLayoutDirection, cols);
      const targetId = existing?.id || next?.id;
      if (!targetId) return undefined;
      onChange((current) => {
        const currentWidget = current.widgets.find((widget) =>
          widget.type === type
        );
        if (currentWidget) {
          const definition = dashboardWidgetDefinition(currentWidget.type);
          return {
            ...current,
            widgets: current.widgets.map((widget) =>
              widget.id === currentWidget.id
                ? {
                  ...widget,
                  title: definition?.label || widget.title,
                  config: { ...widget.config, ...config },
                }
                : widget
            ),
          };
        }
        if (!next) return current;
        next.config = { ...next.config, ...config };
        return {
          ...current,
          widgets: buildAddedWidgets(
            current.widgets,
            next,
            activeLayoutDirection,
          ),
        };
      });
      setActiveWidgetId(targetId);
      setMaximizedWidgetId(targetId);
      return targetId;
    },
    [activeLayoutDirection, buildAddedWidgets, cols, data.widgets, onChange],
  );

  const openPluginWidgetForPath = useCallback(
    (path: string): string | undefined => {
      const definition = dashboardPluginWidgetForPath(path);
      return definition
        ? openOrUpdatePluginWidget(definition.type, { filePath: path })
        : undefined;
    },
    [openOrUpdatePluginWidget],
  );

  const revealGenericFileWidget = useCallback((widgetId: string) => {
    if (!maximizedWidgetId) return;
    const maximized = data.widgets.find((widget) =>
      widget.id === maximizedWidgetId
    );
    if (
      maximized &&
      (maximized.type.startsWith("plugin-view:") ||
        dashboardWidgetDefinition(maximized.type)?.pluginId)
    ) {
      setMaximizedWidgetId(widgetId);
    }
  }, [data.widgets, maximizedWidgetId]);

  const createFileWidget = useCallback(
    (
      fileName: string,
      content: string,
      mode: MarkdownMode,
      direction: EqualizeLayoutDirection,
      filePath?: string,
      extraConfig: Record<string, unknown> = {},
    ) => {
      const nextWidgetId = crypto.randomUUID();
      onChange((current) => {
        if (current.widgets.length >= MAX_WIDGETS) return current;
        const nextWidget = {
          ...widgetDefaults("file", current.widgets, direction, cols),
          id: nextWidgetId,
          config: {
            fileName,
            ...normalizedFileReference(filePath),
            content,
            mode,
            ...extraConfig,
          },
        };
        return {
          ...current,
          widgets: buildAddedWidgets(current.widgets, nextWidget, direction),
        };
      });
      recordRecentFile(fileName, content, mode, filePath);
      setActiveWidgetId(nextWidgetId);
      revealGenericFileWidget(nextWidgetId);
      return nextWidgetId;
    },
    [
      buildAddedWidgets,
      cols,
      onChange,
      recordRecentFile,
      revealGenericFileWidget,
    ],
  );

  const openFileInWidget = useCallback(
    (
      widgetId: string,
      fileName: string,
      content: string,
      mode: MarkdownMode,
      filePath?: string,
      extraConfig: Record<string, unknown> = {},
    ) => {
      const targetWidget = data.widgets.find((widget) =>
        widget.id === widgetId
      );
      const nextMode = isEditMode(targetWidget?.config.mode)
        ? targetWidget.config.mode
        : mode;
      updateFileWidget(widgetId, {
        fileName,
        ...normalizedFileReference(filePath),
        content,
        mode: nextMode,
        encrypted: false,
        encryptedSourceContent: undefined,
        ...extraConfig,
      });
      setActiveWidgetId(widgetId);
      revealGenericFileWidget(widgetId);
    },
    [data.widgets, revealGenericFileWidget, updateFileWidget],
  );

  const resolveOpenedFile = useCallback(
    async (
      path: string,
      result: { path: string; fileName: string; content: string },
    ) => {
      if (
        !result.fileName.toLowerCase().endsWith(".encrypted") &&
        !path.toLowerCase().endsWith(".encrypted") &&
        !isEncryptedFile(result.content)
      ) {
        return {
          fileName: result.fileName,
          content: await prepareOpenedContent(result.fileName, result.content),
          filePath: result.path,
          extraConfig: docKindFor(result.fileName) === "external"
            ? { externalOnly: true }
            : {},
        };
      }
      const password = rememberedFilePassword(result.path) ||
        prompt("暗号化ファイルのパスワードを入力してください") || "";
      if (!password) {
        throw new Error("Password is required to open an encrypted file.");
      }
      const opened = await openEncryptedWorkspaceFile(path, password);
      return {
        fileName: opened.originalName,
        content: await prepareOpenedContent(
          opened.originalName,
          opened.content,
        ),
        filePath: opened.encryptedPath,
        extraConfig: {
          encrypted: true,
          encryptedSourceContent: opened.encryptedContent,
        },
      };
    },
    [],
  );

  const readKnownPath = useCallback(
    (path: string) =>
      /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path)
        ? readLocalFile(path)
        : readFile(path),
    [],
  );

  useEffect(() => {
    if (!hasWailsBackend()) return;
    data.widgets.forEach((widget) => {
      if (!isFileWidgetType(widget.type)) return;
      const filePath = filePathFromConfig(widget.config);
      const readPath = fileReadPathFromConfig(widget.config);
      const fileName = typeof widget.config.fileName === "string"
        ? widget.config.fileName
        : filePath.split("/").pop() || "";
      const content = typeof widget.config.content === "string"
        ? widget.config.content
        : "";
      const reloadBinaryFromDisk = isBinaryDocumentFileName(fileName);
      if (
        !fileName || !filePath || (content && !reloadBinaryFromDisk) ||
        widget.config.externalOnly === true ||
        docKindFor(fileName) === "external"
      ) return;

      const hydrateKey = `${widget.id}:${filePath}`;
      if (hydratedFilePathsRef.current.has(hydrateKey)) return;
      hydratedFilePathsRef.current.add(hydrateKey);
      // Older Dashboard files can contain stale or text-decoded binary
      // content. Never hand that persisted value to a media viewer while the
      // authoritative file is being restored from disk.
      if (content && reloadBinaryFromDisk) {
        updateFileWidget(widget.id, { content: "" });
      }

      void (async () => {
        try {
          const result = await readKnownPath(readPath);
          if (!result) return;
          const opened = await resolveOpenedFile(readPath, result);
          openFileInWidget(
            widget.id,
            opened.fileName,
            opened.content,
            readFileMode(opened.fileName),
            opened.filePath,
            opened.extraConfig,
          );
        } catch (error) {
          console.warn("Could not restore local file content.", error);
        }
      })();
    });
  }, [
    data.widgets,
    openFileInWidget,
    readKnownPath,
    resolveOpenedFile,
    updateFileWidget,
  ]);

  useEffect(() => {
    if (previousWorkspaceBaseRef.current === workspaceBase) return;
    previousWorkspaceBaseRef.current = workspaceBase;
    if (!hasWailsBackend() || !workspaceBase) return;

    for (const widget of data.widgets) {
      if (!isFileWidgetType(widget.type)) continue;
      const filePath = filePathFromConfig(widget.config);
      const readPath = fileReadPathFromConfig(widget.config);
      if (!filePath || !isWorkspaceBackedPath(readPath)) continue;
      hydratedFilePathsRef.current.delete(`${widget.id}:${filePath}`);
      void (async () => {
        try {
          const result = await readKnownPath(readPath);
          if (!result) return;
          const opened = await resolveOpenedFile(readPath, result);
          openFileInWidget(
            widget.id,
            opened.fileName,
            opened.content,
            readFileMode(opened.fileName),
            opened.filePath,
            opened.extraConfig,
          );
        } catch (error) {
          console.warn(
            "Could not reload the file from the changed workspace.",
            error,
          );
        }
      })();
    }
  }, [
    data.widgets,
    openFileInWidget,
    readKnownPath,
    resolveOpenedFile,
    workspaceBase,
  ]);

  const applyPickedFile = useCallback(
    (
      fileName: string,
      content: string,
      mode: MarkdownMode,
      filePath?: string,
    ) => {
      if (filePath && openPluginWidgetForPath(filePath)) {
        // A plugin main view owns this file type; do not create or replace a
        // generic File widget with its binary/file-object representation.
      } else if (filePickerCreatesWidget) {
        const widgetId = createFileWidget(
          fileName,
          content,
          mode,
          filePickerCreateDirection,
          filePath,
        );
        setActiveWidgetId(widgetId);
        setMaximizedWidgetId(widgetId);
      } else if (filePickerTargetId) {
        openFileInWidget(filePickerTargetId, fileName, content, mode, filePath);
        setActiveWidgetId(filePickerTargetId);
        setMaximizedWidgetId(filePickerTargetId);
      }
      setFilePickerTargetId(null);
      setFilePickerCreatesWidget(false);
      setFilePickerCreateDirection(activeLayoutDirection);
      setFilePickerQuery("");
    },
    [
      activeLayoutDirection,
      createFileWidget,
      filePickerCreateDirection,
      filePickerCreatesWidget,
      filePickerTargetId,
      openFileInWidget,
      openPluginWidgetForPath,
    ],
  );

  const openPathAsWidget = useCallback(
    async (path: string) => {
      const pluginWidgetId = openPluginWidgetForPath(path);
      if (pluginWidgetId) return pluginWidgetId;
      const result = await readKnownPath(path);
      if (!result) return undefined;
      const opened = await resolveOpenedFile(path, result);
      return createFileWidget(
        opened.fileName,
        opened.content,
        readFileMode(opened.fileName),
        activeLayoutDirection,
        opened.filePath,
        opened.extraConfig,
      );
    },
    [
      activeLayoutDirection,
      createFileWidget,
      openPluginWidgetForPath,
      readKnownPath,
      resolveOpenedFile,
    ],
  );

  const openDirectoryPathAsWidget = useCallback(
    async (path: string) => {
      const pluginWidgetId = openPluginWidgetForPath(path);
      if (pluginWidgetId) return pluginWidgetId;
      const result = await readFile(path);
      if (!result) return undefined;
      const opened = await resolveOpenedFile(path, result);
      return createFileWidget(
        opened.fileName,
        opened.content,
        readFileMode(opened.fileName),
        activeLayoutDirection,
        opened.filePath,
        opened.extraConfig,
      );
    },
    [
      activeLayoutDirection,
      createFileWidget,
      openPluginWidgetForPath,
      resolveOpenedFile,
    ],
  );

  const openPathInWidget = useCallback(
    async (widgetId: string, path: string) => {
      if (openPluginWidgetForPath(path)) return true;
      const target = data.widgets.find((widget) => widget.id === widgetId);
      const scopedPrefix = target?.config.fileScope === "workspace" ||
          target?.config.fileScope === "files"
        ? target.config.fileScope
        : "";
      const readPath = scopedPrefix &&
          !/^(?:(?:workspace|files):\/\/|[a-z]:[\\/]|\/|\\\\)/i.test(path)
        ? `${scopedPrefix}://${path}`
        : path;
      const result = await readKnownPath(readPath);
      if (!result) return false;
      const opened = await resolveOpenedFile(readPath, result);
      openFileInWidget(
        widgetId,
        opened.fileName,
        opened.content,
        readFileMode(opened.fileName),
        opened.filePath,
        opened.extraConfig,
      );
      return true;
    },
    [
      data.widgets,
      openFileInWidget,
      openPluginWidgetForPath,
      readKnownPath,
      resolveOpenedFile,
    ],
  );

  const navigationFor = useCallback(
    (widgetId: string): WidgetNavigationHistory => {
      let history = navigationHistoryRef.current.get(widgetId);
      if (!history) {
        history = { back: [], forward: [] };
        navigationHistoryRef.current.set(widgetId, history);
      }
      return history;
    },
    [],
  );

  const openDirectoryPathInLastActiveWidget = useCallback(
    async (path: string) => {
      const pluginWidgetId = openPluginWidgetForPath(path);
      if (pluginWidgetId) return pluginWidgetId;
      const result = await readFile(path);
      if (!result) return undefined;
      const content = await prepareOpenedContent(
        result.fileName,
        result.content,
      );
      const targetId = lastActiveFileWidgetIdRef.current;
      const target =
        data.widgets.find((widget) =>
          widget.id === targetId && isFileWidgetType(widget.type)
        ) ?? data.widgets.find((widget) => isFileWidgetType(widget.type));
      if (!target) {
        return createFileWidget(
          result.fileName,
          content,
          readFileMode(result.fileName),
          activeLayoutDirection,
          result.path,
        );
      }
      const currentPath = filePathFromConfig(target.config);
      openFileInWidget(
        target.id,
        result.fileName,
        content,
        readFileMode(result.fileName),
        result.path,
      );
      const history = navigationFor(target.id);
      if (
        currentPath && currentPath !== result.path &&
        history.back.at(-1) !== currentPath
      ) history.back.push(currentPath);
      history.forward = [];
      setNavigationVersion((value) => value + 1);
      return target.id;
    },
    [
      activeLayoutDirection,
      createFileWidget,
      data.widgets,
      navigationFor,
      openFileInWidget,
      openPluginWidgetForPath,
    ],
  );

  const openKnownPathInLastActiveWidget = useCallback(
    async (path: string) => {
      const pluginWidgetId = openPluginWidgetForPath(path);
      if (pluginWidgetId) return pluginWidgetId;
      if (!/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path)) {
        return openDirectoryPathInLastActiveWidget(path);
      }
      const result = await readKnownPath(path);
      if (!result) return undefined;
      const content = await prepareOpenedContent(
        result.fileName,
        result.content,
      );
      const targetId = lastActiveFileWidgetIdRef.current;
      const target =
        data.widgets.find((widget) =>
          widget.id === targetId && isFileWidgetType(widget.type)
        ) ?? data.widgets.find((widget) => isFileWidgetType(widget.type));
      if (!target) {
        return createFileWidget(
          result.fileName,
          content,
          readFileMode(result.fileName),
          activeLayoutDirection,
          result.path,
        );
      }
      const currentPath = filePathFromConfig(target.config);
      openFileInWidget(
        target.id,
        result.fileName,
        content,
        readFileMode(result.fileName),
        result.path,
      );
      const history = navigationFor(target.id);
      if (
        currentPath && currentPath !== result.path &&
        history.back.at(-1) !== currentPath
      ) history.back.push(currentPath);
      history.forward = [];
      setNavigationVersion((value) => value + 1);
      return target.id;
    },
    [
      activeLayoutDirection,
      createFileWidget,
      data.widgets,
      navigationFor,
      openDirectoryPathInLastActiveWidget,
      openFileInWidget,
      openPluginWidgetForPath,
      readKnownPath,
    ],
  );

  const openMemoListPath = useCallback(async (
    memoListWidgetId: string,
    path: string,
  ) => {
    const result = await readKnownPath(path);
    if (!result) return;
    const content = await prepareOpenedContent(result.fileName, result.content);
    const mode = readFileMode(result.fileName);
    onChange((current) => ({
      ...current,
      widgets: current.widgets.map((widget) =>
        widget.id === memoListWidgetId
          ? {
            ...widget,
            type: "file",
            config: {
              fileName: result.fileName,
              ...normalizedFileReference(result.path),
              content,
              mode,
              memoPanelOpen: true,
              memoPanelCollapsed: false,
              memoListReturnConfig: widget.config,
            },
          }
          : widget
      ),
    }));
    navigationHistoryRef.current.delete(memoListWidgetId);
    recordRecentFile(result.fileName, content, mode, result.path);
    setActiveWidgetId(memoListWidgetId);
    setMaximizedWidgetId(memoListWidgetId);
  }, [onChange, readKnownPath, recordRecentFile]);

  const navigateWidgetToPath = useCallback(
    async (widgetId: string, path: string) => {
      const widget = data.widgets.find((item) => item.id === widgetId);
      const currentPath = widget ? filePathFromConfig(widget.config) : "";
      if (currentPath === path) return;
      if (!await openPathInWidget(widgetId, path)) return;
      const history = navigationFor(widgetId);
      if (currentPath && history.back.at(-1) !== currentPath) {
        history.back.push(currentPath);
      }
      history.forward = [];
      setNavigationVersion((value) => value + 1);
    },
    [data.widgets, navigationFor, openPathInWidget],
  );

  const navigateWidgetHistory = useCallback(
    async (widgetId: string, direction: "back" | "forward") => {
      const widget = data.widgets.find((item) => item.id === widgetId);
      const currentPath = widget ? filePathFromConfig(widget.config) : "";
      const history = navigationFor(widgetId);
      const source = direction === "back" ? history.back : history.forward;
      const target = source.at(-1);
      if (!target && direction === "back" && widget) {
        const returnConfig = widget.config.memoListReturnConfig;
        if (
          returnConfig && typeof returnConfig === "object" &&
          !Array.isArray(returnConfig)
        ) {
          onChange((current) => ({
            ...current,
            widgets: current.widgets.map((item) =>
              item.id === widgetId
                ? {
                  ...item,
                  type: "memo-list",
                  config: returnConfig as Record<string, unknown>,
                }
                : item
            ),
          }));
          navigationHistoryRef.current.delete(widgetId);
          setNavigationVersion((value) => value + 1);
          setMaximizedWidgetId((id) => id === widgetId ? null : id);
          return;
        }
      }
      if (!target || !await openPathInWidget(widgetId, target)) return;
      source.pop();
      const destination = direction === "back" ? history.forward : history.back;
      if (currentPath && destination.at(-1) !== currentPath) {
        destination.push(currentPath);
      }
      setNavigationVersion((value) => value + 1);
    },
    [data.widgets, navigationFor, onChange, openPathInWidget],
  );

  useEffect(() => {
    if (
      !hasWailsBackend() || startupPaths === null ||
      handledStartupFilesRef.current
    ) return;
    handledStartupFilesRef.current = true;

    void (async () => {
      const paths = startupPaths;
      if (!paths.length) return;
      onExternalPathOpened(paths[0]);

      for (const [index, path] of paths.entries()) {
        try {
          if (index === 0) {
            const widgetId = await openKnownPathInLastActiveWidget(path);
            if (widgetId) {
              setActiveWidgetId(widgetId);
              setMaximizedWidgetId(widgetId);
            }
          } else {
            const widgetId = await openPathAsWidget(path);
            if (index === 0 && widgetId) setMaximizedWidgetId(widgetId);
          }
        } catch (error) {
          console.warn("Could not open startup file.", error);
        }
      }
    })();
  }, [
    data.widgets,
    onExternalPathOpened,
    openKnownPathInLastActiveWidget,
    openPathAsWidget,
    startupPaths,
  ]);

  const browseLocalFile = useCallback(async () => {
    if (hasWailsBackend()) {
      try {
        const path = await selectLocalFilePath();
        if (!path) return;
        onExternalPathOpened(path);
        setFilePickerTargetId(null);
        setFilePickerCreatesWidget(false);
        setFilePickerCreateDirection(activeLayoutDirection);
        setFilePickerQuery("");

        const result = await readLocalFile(path);
        if (result) {
          const content = await prepareOpenedContent(
            result.fileName,
            result.content,
          );
          applyPickedFile(
            result.fileName,
            content,
            readFileMode(result.fileName),
            result.path,
          );
        }
      } catch (error) {
        console.error(error);
        alert(tr("alert.openFileFailed"));
      }
      return;
    }
    alert(tr("alert.desktopOnly"));
  }, [activeLayoutDirection, applyPickedFile, onExternalPathOpened, tr]);

  useEffect(() => {
    if (!hasWailsBackend()) return;
    const dispose = onWailsFileDrop((x, y, paths) => {
      const path = paths[0];
      if (!path) return;
      void inspectLocalPath(path).then((info) => {
        if (!info) return;
        if (info.isDirectory) {
          onExternalPathOpened(info.path, true);
          return;
        }
        onExternalPathOpened(info.path);
        const target = document.elementFromPoint(x, y)?.closest<HTMLElement>(
          "[data-widget-id]",
        );
        const widgetId = target?.dataset.widgetId;
        if (widgetId) void openPathInWidget(widgetId, info.path);
        else void openPathAsWidget(info.path);
      }).catch((error) => {
        console.error(error);
        alert(tr("alert.openFileFailed"));
      });
    });
    return () => dispose?.();
  }, [onExternalPathOpened, openPathAsWidget, openPathInWidget, tr]);

  const addWidget = (
    type: DashboardWidget["type"],
    direction: EqualizeLayoutDirection,
  ) => {
    if (data.widgets.length >= MAX_WIDGETS) return;
    if (type === "palette") {
      setPaletteOpen(true);
      return;
    }
    const nextWidget = widgetDefaults(type, data.widgets, direction, cols);
    onChange({
      ...data,
      widgets: buildAddedWidgets(data.widgets, nextWidget, direction),
    });
    setActiveWidgetId(nextWidget.id);
    if (dashboardWidgetHasSettings(type)) {
      setSettingsWidgetId(nextWidget.id);
      setPendingNewWidgetId(nextWidget.id);
    }
  };

  const closeWidgetSettings = useCallback(() => {
    const id = settingsWidgetId;
    setSettingsWidgetId(null);
    if (id && id === pendingNewWidgetId) {
      const widget = data.widgets.find((item) => item.id === id);
      if (widget && !isDashboardWidgetConfigured(widget)) {
        onChange({
          ...data,
          widgets: data.widgets.filter((item) => item.id !== id),
        });
        setActiveWidgetId((activeId) => activeId === id ? null : activeId);
      }
    }
    setPendingNewWidgetId(null);
  }, [data, onChange, pendingNewWidgetId, settingsWidgetId]);

  const equalizeLayout = useCallback((direction: EqualizeLayoutDirection) => {
    onChange({
      ...data,
      widgets: buildEqualizedWidgets(data.widgets, direction),
    });
  }, [buildEqualizedWidgets, data.widgets, onChange]);

  useEffect(() => {
    if (addWidgetRequest.id <= handledAddWidgetRequestRef.current) return;
    handledAddWidgetRequestRef.current = addWidgetRequest.id;
    addWidget(addWidgetRequest.type, addWidgetRequest.direction);
  }, [activeLayoutDirection, addWidget, addWidgetRequest]);

  useEffect(() => {
    if (
      pluginWidgetRequest.id <= handledPluginWidgetRequestRef.current ||
      !pluginWidgetRequest.type
    ) return;
    handledPluginWidgetRequestRef.current = pluginWidgetRequest.id;
    openOrUpdatePluginWidget(
      pluginWidgetRequest.type,
      pluginWidgetRequest.config,
    );
  }, [openOrUpdatePluginWidget, pluginWidgetRequest]);

  useEffect(() => {
    if (equalizeLayoutRequest.id <= handledEqualizeLayoutRequestRef.current) {
      return;
    }
    handledEqualizeLayoutRequestRef.current = equalizeLayoutRequest.id;
    equalizeLayout(equalizeLayoutRequest.direction);
  }, [equalizeLayout, equalizeLayoutRequest]);

  useEffect(() => {
    if (splitWidgetRequest.id <= handledSplitWidgetRequestRef.current) return;
    handledSplitWidgetRequestRef.current = splitWidgetRequest.id;
    if (!activeWidgetId) return;
    onChange({
      ...data,
      widgets: buildSplitWidgets(
        data.widgets,
        activeWidgetId,
        splitWidgetRequest.direction,
      ),
    });
  }, [
    activeWidgetId,
    buildSplitWidgets,
    data.widgets,
    onChange,
    splitWidgetRequest,
  ]);

  useEffect(() => {
    if (
      activeWidgetId &&
      !data.widgets.some((widget) => widget.id === activeWidgetId)
    ) {
      setActiveWidgetId(null);
    }
    const rows = data.widgets.reduce((max, widget) => {
      const position = smallGrid
        ? smallLayouts.get(widget.id) ?? widget.layout
        : widget.layout;
      return Math.max(max, position.y + position.h);
    }, 1);
    fitGridRows(rows);
  }, [activeWidgetId, data.widgets, fitGridRows, smallGrid, smallLayouts]);

  useEffect(() => {
    const widget = data.widgets.find((item) => item.id === activeWidgetId);
    if (!widget) {
      onActiveFileChange(null);
      return;
    }
    if (isFileWidgetType(widget.type)) {
      lastActiveFileWidgetIdRef.current = widget.id;
    }
    const path = (isFileWidgetType(widget.type)
      ? filePathFromConfig(widget.config)
      : dashboardWidgetFilePath(widget)) ||
      (typeof widget.config.fileName === "string"
        ? widget.config.fileName
        : "");
    const content = typeof widget.config.content === "string"
      ? widget.config.content
      : "";
    onActiveFileChange(
      path
        ? {
          path,
          content: content && !content.startsWith("data:") &&
              content.length <= 1024 * 1024
            ? content
            : "",
        }
        : null,
    );
  }, [activeWidgetId, data.widgets, onActiveFileChange]);

  useEffect(() => {
    if (openFilePickerRequest > 0) openFilePicker();
  }, [openFilePicker, openFilePickerRequest]);

  // Open-file requests from outside the dashboard (e.g. the memo list modal).
  useEffect(() => {
    if (openPathRequest.id <= handledOpenPathRequestRef.current) return;
    handledOpenPathRequestRef.current = openPathRequest.id;
    if (!openPathRequest.path) return;
    void (async () => {
      try {
        const widgetId = openPathRequest.source === "startup"
          ? await openKnownPathInLastActiveWidget(openPathRequest.path)
          : openPathRequest.source === "filetree"
          ? await openDirectoryPathInLastActiveWidget(openPathRequest.path)
          : openPathRequest.source === "directory"
          ? await openDirectoryPathAsWidget(openPathRequest.path)
          : await openPathAsWidget(openPathRequest.path);
        if (!widgetId) alert(tr("alert.openFileFailed"));
        else if (openPathRequest.source === "startup") {
          setActiveWidgetId(widgetId);
          setMaximizedWidgetId(widgetId);
        }
      } catch (error) {
        console.error(error);
        alert(tr("alert.openFromListFailed"));
      }
    })();
  }, [
    openDirectoryPathAsWidget,
    openDirectoryPathInLastActiveWidget,
    openKnownPathInLastActiveWidget,
    openPathAsWidget,
    openPathRequest,
    tr,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        openFilePicker();
      }
      if (key === "o") {
        event.preventDefault();
        const nextWidgetId = activeWidgetId ?? data.widgets[0]?.id ?? null;
        if (nextWidgetId) setMaximizedWidgetId(nextWidgetId);
      }
      if (key === "m") {
        event.preventDefault();
        setMaximizedWidgetId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeWidgetId, data.widgets, openFilePicker]);

  const markdownModes: Array<
    { key: MarkdownMode; label: string; icon: LucideIcon }
  > = [
    { key: "preview", label: "Preview", icon: Eye },
    { key: "wysiwyg", label: "WYSIWYG", icon: PenLine },
    { key: "raw", label: "Raw", icon: Code },
  ];

  const markdownActions = [
    { id: "new", label: tr("widget.new"), icon: FilePlus },
    { id: "open", label: tr("widget.file"), icon: FolderOpen },
    { id: "save", label: tr("widget.save"), icon: Save },
    { id: "export", label: tr("widget.export"), icon: Download },
    { id: "history", label: tr("widget.history"), icon: History },
  ];
  void navigationVersion;

  return (
    <section className="dashboard-shell">
      <div className="dashboard-scroll">
        <div
          ref={gridRef}
          className="dashboard-grid"
          onClick={() => setActiveWidgetId(null)}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridAutoRows: `${gridRowHeight}px`,
            gap,
          }}
        >
          {data.widgets.length === 0 && (
            <div className="dashboard-empty-state">
              <Plus size={48} />
              <p>This dashboard is empty.</p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setPaletteOpen(true);
                }}
              >
                <Plus size={16} />Add your first widget
              </button>
            </div>
          )}
          {dragging && (
            <div
              className="dashboard-snap-preview"
              style={{
                gridColumn: `${dragging.next.x + 1} / span ${dragging.next.w}`,
                gridRow: `${dragging.next.y + 1} / span ${dragging.next.h}`,
              }}
            />
          )}
          {data.widgets.map((widget) => (
            (() => {
              const widgetFilePath = filePathFromConfig(widget.config);
              const widgetFileName = typeof widget.config.fileName === "string"
                ? widget.config.fileName
                : widgetFilePath.split("/").pop() || fileName;
              const widgetContent = typeof widget.config.content === "string"
                ? widget.config.content
                : documentMarkdown;
              const widgetMode = widget.config.mode === "preview" ||
                  widget.config.mode === "wysiwyg" ||
                  widget.config.mode === "raw"
                ? widget.config.mode
                : readFileMode(widgetFileName);
              const fileIsMarkdown =
                widgetFileName.toLowerCase().endsWith(".md") ||
                widgetFileName.toLowerCase().endsWith(".markdown");
              const fileIsBrowserHtml = /\.html?$/i.test(widgetFileName);
              const fileIsHtml = /\.(html?|epub)$/i.test(widgetFileName);
              const fileIsPdf = /\.pdf$/i.test(widgetFileName);
              const viewFontScale = readViewFontScale(widget.config);
              const viewWidthScale = readViewWidthScale(widget.config);
              const canAdjustView =
                (fileIsMarkdown && widgetMode === "preview") || fileIsHtml ||
                fileIsPdf;
              const memoPanelOpen = widget.config.memoPanelOpen === true;
              const widgetNavigation = navigationHistoryRef.current.get(
                widget.id,
              );
              const canReturnToMemoList =
                !!widget.config.memoListReturnConfig &&
                typeof widget.config.memoListReturnConfig === "object" &&
                !Array.isArray(widget.config.memoListReturnConfig);
              const canNavigateBack =
                (widgetNavigation?.back.length ?? 0) > 0 ||
                canReturnToMemoList;
              const canNavigateForward =
                (widgetNavigation?.forward.length ?? 0) > 0;
              const updateFileConfig = (next: Record<string, unknown>) =>
                updateFileWidget(widget.id, next);
              // Memo files live under the Workspace's Memos directory.
              const toggleMemoPanel = () => {
                if (!memoDirPath) {
                  if (confirm(tr("memo.dirPrompt"))) onOpenSettings();
                  return;
                }
                if (!widgetFilePath) {
                  alert(tr("memo.needsLocalFile"));
                  return;
                }
                updateFileConfig({
                  memoPanelOpen: !memoPanelOpen,
                  memoPanelCollapsed: false,
                });
              };
              const isMaximized = maximizedWidgetId === widget.id;
              const displayLayout = smallGrid
                ? (smallLayouts.get(widget.id) ?? widget.layout)
                : widget.layout;
              const pluginDefinition = dashboardWidgetDefinition(widget.type);
              const pluginWidget = pluginDefinition?.component;
              const pluginRender = pluginDefinition?.render;
              const pluginBackingPath = dashboardWidgetFilePath(widget);
              const pluginExternalURL = pluginDefinition?.externalUrlOf?.(
                widget.config,
              );
              const handleAction = async (id: string) => {
                if (id === "new") {
                  updateFileConfig({
                    fileName: "untitled.md",
                    filePath: undefined,
                    content: "# Untitled\n\n",
                    mode: "wysiwyg",
                  });
                } else if (id === "open") {
                  openFilePicker(widget.id);
                } else if (id === "save") {
                  try {
                    const targetPath = widgetFilePath || widgetFileName;
                    if (widget.config.encrypted === true) {
                      if (
                        isBinaryDocumentFileName(widgetFileName)
                      ) {throw new Error(
                          "Encrypted binary previews are read-only. Permanently decrypt the file before editing it.",
                        );}
                      const encryptedSource =
                        typeof widget.config.encryptedSourceContent === "string"
                          ? widget.config.encryptedSourceContent
                          : "";
                      const password = rememberedFilePassword(targetPath) ||
                        prompt(
                          "暗号化ファイルのパスワードを入力してください",
                        ) || "";
                      if (!password || !encryptedSource) {
                        throw new Error(
                          "Encrypted file password or source data is unavailable.",
                        );
                      }
                      const nextEncrypted = await reencryptFileContent(
                        encryptedSource,
                        widgetContent,
                        password,
                      );
                      await writeFile(targetPath, nextEncrypted);
                      updateFileConfig({
                        encryptedSourceContent: nextEncrypted,
                      });
                    } else {
                      await writeFile(targetPath, widgetContent);
                    }
                    if (!widgetFilePath) {
                      const saved = await readFile(targetPath);
                      if (saved) {
                        updateFileConfig({
                          filePath: saved.path,
                          fileName: saved.fileName,
                        });
                      }
                    }
                    onSaveDocument();
                    window.dispatchEvent(
                      new Event("llm-hub:file-tree-refresh"),
                    );
                  } catch (error) {
                    console.error(error);
                    alert(
                      error instanceof Error
                        ? error.message
                        : tr("alert.openFileFailed"),
                    );
                  }
                } else if (id === "export") {
                  downloadFile(widgetFileName, widgetContent);
                } else if (id === "history") {
                  onHistoryClick();
                }
              };
              const openInExternalEditor = async () => {
                if (!externalEditorPath || !widgetFilePath) return;
                try {
                  await openExternalEditor(externalEditorPath, widgetFilePath);
                } catch (error) {
                  console.error(error);
                  alert(tr("alert.externalEditorFailed"));
                }
              };
              const openInBrowser = async () => {
                const targetPath = fileReadPathFromConfig(widget.config);
                if (!fileIsBrowserHtml || !targetPath) return;
                try {
                  // Flush the current editor state before the external browser
                  // reads the file from disk.
                  await writeFile(targetPath, widgetContent);
                  await openHTMLInBrowser(targetPath);
                } catch (error) {
                  console.error(error);
                  alert(
                    error instanceof Error
                      ? error.message
                      : "ブラウザでHTMLを開けませんでした。",
                  );
                }
              };
              const convertMarkdownToHTML = async () => {
                const sourcePath = fileReadPathFromConfig(widget.config);
                if (!fileIsMarkdown || !sourcePath) return;
                try {
                  await writeFile(sourcePath, widgetContent);
                  const title =
                    widgetFileName.replace(/\.(?:md|markdown)$/i, "") ||
                    "document";
                  const exportedPath = await saveHTMLExport(
                    sourcePath,
                    renderMarkdownToPrintableHTML(widgetContent, title),
                  );
                  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
                  await navigateWidgetToPath(widget.id, exportedPath);
                } catch (error) {
                  console.error(error);
                  alert(
                    error instanceof Error
                      ? error.message
                      : "HTMLへ変換できませんでした。",
                  );
                }
              };
              const reloadFromDisk = async () => {
                if (!widgetFilePath) return;
                try {
                  onHistoryCheckpoint("reload");
                  const result = await readLocalFile(widgetFilePath);
                  if (!result) return;
                  const content = await prepareOpenedContent(
                    result.fileName,
                    result.content,
                  );
                  openFileInWidget(
                    widget.id,
                    result.fileName,
                    content,
                    readFileMode(result.fileName),
                    result.path,
                  );
                  onDeferredHistoryCheckpoint("reload");
                } catch (error) {
                  console.error(error);
                  alert(tr("alert.reloadFailed"));
                }
              };
              const beginMove = (
                event: ReactPointerEvent<HTMLButtonElement>,
              ) => {
                if (isMaximized) return;
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging({
                  id: widget.id,
                  mode: "move",
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  breakpoint: smallGrid ? "sm" : "lg",
                  origin: displayLayout,
                  dx: 0,
                  dy: 0,
                  next: displayLayout,
                });
              };

              return (
                <article
                  key={widget.id}
                  data-widget-id={widget.id}
                  className={`dashboard-widget ${
                    isFileWidgetType(widget.type)
                      ? "file-widget"
                      : "content-widget"
                  } ${activeWidgetId === widget.id ? "active" : ""} ${
                    isMaximized ? "maximized" : ""
                  } ${dragging?.id === widget.id ? "interacting" : ""}`}
                  style={{
                    gridColumn: isMaximized
                      ? undefined
                      : `${displayLayout.x + 1} / span ${displayLayout.w}`,
                    gridRow: isMaximized
                      ? undefined
                      : `${displayLayout.y + 1} / span ${displayLayout.h}`,
                    transform: !isMaximized && dragging?.id === widget.id &&
                        dragging.mode === "move"
                      ? `translate(${dragging.dx}px, ${dragging.dy}px)`
                      : undefined,
                    width: !isMaximized && dragging?.id === widget.id &&
                        dragging.mode === "resize"
                      ? `${
                        dragging.next.w * getGridMetrics().cellW +
                        (dragging.next.w - 1) * gap
                      }px`
                      : undefined,
                    height: !isMaximized && dragging?.id === widget.id &&
                        dragging.mode === "resize"
                      ? `${
                        dragging.next.h * getGridMetrics().cellH +
                        (dragging.next.h - 1) * gap
                      }px`
                      : undefined,
                    touchAction: dragging?.id === widget.id
                      ? "none"
                      : undefined,
                  }}
                >
                  <header
                    className="dashboard-widget-header"
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveWidgetId(widget.id);
                    }}
                  >
                    {isFileWidgetType(widget.type) &&
                        widget.config.showHeader !== false
                      ? (
                        <div className="markdown-widget-header-main">
                          {(canNavigateBack || canNavigateForward) && (
                            <div className="widget-navigation-buttons">
                              <button
                                type="button"
                                onClick={() =>
                                  void navigateWidgetHistory(widget.id, "back")}
                                disabled={!canNavigateBack}
                                title={tr("widget.back")}
                              >
                                <ArrowLeft size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void navigateWidgetHistory(
                                    widget.id,
                                    "forward",
                                  )}
                                disabled={!canNavigateForward}
                                title={tr("widget.forward")}
                              >
                                <ArrowRight size={15} />
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            className={`widget-memo-toggle ${
                              memoPanelOpen ? "active" : ""
                            }`}
                            onClick={toggleMemoPanel}
                            title={tr("widget.memoTimeline")}
                          >
                            <SquarePen size={13} />
                          </button>
                          <span
                            className="widget-filename-label"
                            title={widgetFilePath || widgetFileName}
                          >
                            {widgetFilePath || widgetFileName}
                          </span>
                        </div>
                      )
                      : <span />}
                    {isFileWidgetType(widget.type) &&
                      widget.config.showHeader !== false && (
                      <div className="markdown-widget-controls">
                        {fileIsMarkdown && (
                          <div className="widget-mode-group">
                            {markdownModes.map((item) => {
                              const Icon = item.icon;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  className={`widget-header-button ${
                                    widgetMode === item.key ? "active" : ""
                                  }`}
                                  onClick={() =>
                                    updateFileConfig({ mode: item.key })}
                                  title={item.label}
                                >
                                  <Icon size={15} />
                                  <span>{item.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {canAdjustView && (
                          <div className="widget-font-group">
                            <button
                              type="button"
                              className="widget-icon-button"
                              onClick={() =>
                                updateFileConfig({
                                  viewFontScale: nextViewFontScale(
                                    viewFontScale,
                                    -1,
                                  ),
                                })}
                              title={tr("widget.decreaseFont")}
                              disabled={viewFontScale <= MIN_VIEW_FONT_SCALE}
                            >
                              <ZoomOut size={15} />
                            </button>
                            <button
                              type="button"
                              className="widget-icon-button"
                              onClick={() =>
                                updateFileConfig({
                                  viewFontScale: nextViewFontScale(
                                    viewFontScale,
                                    1,
                                  ),
                                })}
                              title={tr("widget.increaseFont")}
                              disabled={viewFontScale >= MAX_VIEW_FONT_SCALE}
                            >
                              <ZoomIn size={15} />
                            </button>
                            <button
                              type="button"
                              className="widget-icon-button"
                              onClick={() =>
                                updateFileConfig({
                                  viewWidthScale: nextViewWidthScale(
                                    viewWidthScale,
                                    -1,
                                  ),
                                })}
                              title={tr("widget.narrow")}
                              disabled={viewWidthScale <= MIN_VIEW_WIDTH_SCALE}
                            >
                              <span
                                className="widget-width-symbol"
                                aria-hidden="true"
                              >
                                →←
                              </span>
                            </button>
                            <button
                              type="button"
                              className="widget-icon-button"
                              onClick={() =>
                                updateFileConfig({
                                  viewWidthScale: nextViewWidthScale(
                                    viewWidthScale,
                                    1,
                                  ),
                                })}
                              title={tr("widget.widen")}
                              disabled={viewWidthScale >= MAX_VIEW_WIDTH_SCALE}
                            >
                              <span
                                className="widget-width-symbol"
                                aria-hidden="true"
                              >
                                ←→
                              </span>
                            </button>
                          </div>
                        )}
                        <div className="widget-action-group">
                          {fileIsBrowserHtml && (
                            <button
                              type="button"
                              className="widget-icon-button"
                              onClick={() => void openInBrowser()}
                              title={widgetFilePath
                                ? "ブラウザで開く（ブラウザの印刷からPDF保存できます）"
                                : tr("widget.openLocalFirst")}
                              disabled={!widgetFilePath}
                            >
                              <Globe2 size={15} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="widget-icon-button"
                            onClick={openInExternalEditor}
                            title={widgetFilePath
                              ? tr("widget.externalEditorOpen")
                              : tr("widget.openLocalFirst")}
                            disabled={!externalEditorPath || !widgetFilePath}
                          >
                            <ExternalLink size={15} />
                          </button>
                          <button
                            type="button"
                            className="widget-icon-button"
                            onClick={reloadFromDisk}
                            title={widgetFilePath
                              ? tr("widget.reload")
                              : tr("widget.openLocalFirst")}
                            disabled={!widgetFilePath}
                          >
                            <RefreshCw size={15} />
                          </button>
                          {markdownActions.map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className="widget-icon-button"
                                onClick={() => void handleAction(item.id)}
                                title={item.label}
                              >
                                <Icon size={15} />
                              </button>
                            );
                          })}
                        </div>
                        <div className="widget-more">
                          <button
                            type="button"
                            className="widget-icon-button"
                            onClick={() =>
                              setMoreOpenId((
                                id,
                              ) => (id === widget.id ? null : widget.id))}
                            title={tr("widget.more")}
                          >
                            <MoreHorizontal size={16} />
                          </button>
                          {moreOpenId === widget.id && (
                            <>
                              <button
                                type="button"
                                className="widget-more-scrim"
                                onClick={() => setMoreOpenId(null)}
                                aria-label="Close menu"
                              />
                              <div className="widget-more-menu">
                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleMemoPanel();
                                    setMoreOpenId(null);
                                  }}
                                >
                                  <SquarePen size={15} />
                                  <span>{tr("widget.memoTimeline")}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void openInExternalEditor();
                                    setMoreOpenId(null);
                                  }}
                                  disabled={!externalEditorPath ||
                                    !widgetFilePath}
                                >
                                  <ExternalLink size={15} />
                                  <span>{tr("widget.externalEditor")}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void reloadFromDisk();
                                    setMoreOpenId(null);
                                  }}
                                  disabled={!widgetFilePath}
                                >
                                  <RefreshCw size={15} />
                                  <span>{tr("widget.reloadShort")}</span>
                                </button>
                                {fileIsBrowserHtml && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void openInBrowser();
                                      setMoreOpenId(null);
                                    }}
                                    disabled={!widgetFilePath}
                                  >
                                    <Globe2 size={15} />
                                    <span>ブラウザで開く</span>
                                  </button>
                                )}
                                {fileIsMarkdown && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void convertMarkdownToHTML();
                                      setMoreOpenId(null);
                                    }}
                                    disabled={!widgetFilePath}
                                  >
                                    <FileCode2 size={15} />
                                    <span>HTMLに変換</span>
                                  </button>
                                )}
                                {canAdjustView && (
                                  <>
                                    <div className="widget-more-separator" />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateFileConfig({
                                          viewFontScale: nextViewFontScale(
                                            viewFontScale,
                                            -1,
                                          ),
                                        })}
                                      disabled={viewFontScale <=
                                        MIN_VIEW_FONT_SCALE}
                                    >
                                      <ZoomOut size={15} />
                                      <span>{tr("widget.decreaseFont")}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateFileConfig({
                                          viewFontScale: nextViewFontScale(
                                            viewFontScale,
                                            1,
                                          ),
                                        })}
                                      disabled={viewFontScale >=
                                        MAX_VIEW_FONT_SCALE}
                                    >
                                      <ZoomIn size={15} />
                                      <span>{tr("widget.increaseFont")}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateFileConfig({
                                          viewWidthScale: nextViewWidthScale(
                                            viewWidthScale,
                                            -1,
                                          ),
                                        })}
                                      disabled={viewWidthScale <=
                                        MIN_VIEW_WIDTH_SCALE}
                                    >
                                      <span
                                        className="widget-width-symbol"
                                        aria-hidden="true"
                                      >
                                        →←
                                      </span>
                                      <span>{tr("widget.narrow")}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateFileConfig({
                                          viewWidthScale: nextViewWidthScale(
                                            viewWidthScale,
                                            1,
                                          ),
                                        })}
                                      disabled={viewWidthScale >=
                                        MAX_VIEW_WIDTH_SCALE}
                                    >
                                      <span
                                        className="widget-width-symbol"
                                        aria-hidden="true"
                                      >
                                        ←→
                                      </span>
                                      <span>{tr("widget.widen")}</span>
                                    </button>
                                  </>
                                )}
                                <div className="widget-more-separator" />
                                {fileIsMarkdown && markdownModes.map((item) => {
                                  const Icon = item.icon;
                                  return (
                                    <button
                                      key={item.key}
                                      type="button"
                                      onClick={() => {
                                        updateFileConfig({ mode: item.key });
                                        setMoreOpenId(null);
                                      }}
                                    >
                                      <Icon size={15} />
                                      <span>{item.label}</span>
                                    </button>
                                  );
                                })}
                                {fileIsMarkdown && (
                                  <div className="widget-more-separator" />
                                )}
                                {markdownActions.map((item) => {
                                  const Icon = item.icon;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => {
                                        void handleAction(item.id);
                                        setMoreOpenId(null);
                                      }}
                                    >
                                      <Icon size={15} />
                                      <span>{item.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    <div
                      className="dashboard-widget-chrome"
                      style={chromeOffsets[widget.id]
                        ? {
                          transform: `translateX(-50%) translate(${
                            chromeOffsets[widget.id].x
                          }px, ${chromeOffsets[widget.id].y}px)`,
                        }
                        : undefined}
                    >
                      <button
                        type="button"
                        className="dashboard-chrome-mover"
                        title="Move toolbar"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          const origin = chromeOffsets[widget.id] ||
                            { x: 0, y: 0 };
                          setChromeDragging({
                            id: widget.id,
                            pointerId: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                            originX: origin.x,
                            originY: origin.y,
                          });
                        }}
                        onPointerMove={(event) => {
                          if (
                            !chromeDragging ||
                            chromeDragging.id !== widget.id ||
                            chromeDragging.pointerId !== event.pointerId
                          ) return;
                          const cell = event.currentTarget.closest<HTMLElement>(
                            ".dashboard-widget",
                          )?.getBoundingClientRect();
                          const chrome = event.currentTarget.parentElement
                            ?.getBoundingClientRect();
                          if (!cell || !chrome) return;
                          const maxX = Math.max(
                            0,
                            (cell.width - chrome.width) / 2,
                          );
                          const x = Math.max(
                            -maxX,
                            Math.min(
                              maxX,
                              chromeDragging.originX + event.clientX -
                                chromeDragging.x,
                            ),
                          );
                          const y = Math.max(
                            -4,
                            Math.min(
                              Math.max(-4, cell.height - chrome.height - 4),
                              chromeDragging.originY + event.clientY -
                                chromeDragging.y,
                            ),
                          );
                          setChromeOffsets((current) => ({
                            ...current,
                            [widget.id]: { x, y },
                          }));
                        }}
                        onPointerUp={(event) => {
                          if (
                            chromeDragging?.id !== widget.id ||
                            chromeDragging.pointerId !== event.pointerId
                          ) return;
                          if (
                            event.currentTarget.hasPointerCapture(
                              event.pointerId,
                            )
                          ) {event.currentTarget.releasePointerCapture(
                              event.pointerId,
                            );}
                          setChromeDragging(null);
                        }}
                        onPointerCancel={() => setChromeDragging(null)}
                      >
                        <GripVertical size={10} />
                      </button>
                      <div className="dashboard-widget-tools">
                        <button
                          type="button"
                          onClick={() =>
                            setMaximizedWidgetId((
                              id,
                            ) => (id === widget.id ? null : widget.id))}
                          title={isMaximized
                            ? tr("widget.restoreSize")
                            : tr("widget.maximize")}
                        >
                          {isMaximized
                            ? <Minimize2 size={15} />
                            : <Maximize2 size={15} />}
                        </button>
                        {dashboardWidgetHasSettings(widget.type) && (
                          <button
                            type="button"
                            onClick={() => setSettingsWidgetId(widget.id)}
                            title="Widget settings"
                          >
                            <Settings2 size={14} />
                          </button>
                        )}
                        {(pluginBackingPath || pluginExternalURL) && (
                          <button
                            type="button"
                            onClick={() => {
                              if (pluginExternalURL) {
                                window.open(
                                  pluginExternalURL,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              } else if (pluginBackingPath) {
                                void openKnownPathInLastActiveWidget(
                                  pluginBackingPath,
                                );
                              }
                            }}
                            title="Open"
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}
                        {!isMaximized && (
                          <button
                            type="button"
                            className="dashboard-move-handle"
                            onPointerDown={beginMove}
                            title={tr("widget.move")}
                          >
                            <GripVertical size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm("Delete this widget?")) return;
                            setMaximizedWidgetId((
                              id,
                            ) => (id === widget.id ? null : id));
                            setActiveWidgetId((
                              id,
                            ) => (id === widget.id ? null : id));
                            navigationHistoryRef.current.delete(widget.id);
                            onChange({
                              ...data,
                              widgets: data.widgets.filter((item) =>
                                item.id !== widget.id
                              ),
                            });
                          }}
                          title={tr("widget.close")}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </header>
                  <div className="dashboard-widget-body">
                    {isFileWidgetType(widget.type) && (
                      <FileWidgetBody
                        widget={widget}
                        fallbackFileName={fileName}
                        fallbackContent={documentMarkdown}
                        isDark={isDark}
                        onConfigChange={(config) =>
                          updateFileWidget(widget.id, config)}
                        memoDirPath={memoDirPath}
                        memoSyncTimeline={memoSyncTimeline}
                        onOpenPath={(path) => void openPathAsWidget(path)}
                        onNavigatePath={(path) =>
                          void navigateWidgetToPath(widget.id, path)}
                        onActivate={() => setActiveWidgetId(widget.id)}
                        onSelectionChange={onActiveSelectionChange}
                        aiAvailable={aiEnabled &&
                          configuredChatProviders(chatSettings).length > 0}
                        onAskAI={onAskAI}
                        onAskMemoAI={onAskMemoAI}
                      />
                    )}
                    {widget.type === "workflow" && (
                      <WorkflowWidget
                        widgetId={widget.id}
                        cacheScope={dashboardPath || "local"}
                        config={widget.config}
                        settings={chatSettings}
                        directoryBase={directoryBase}
                        isDark={isDark}
                        onChange={(config) =>
                          updateWidget({ ...widget, config })}
                      />
                    )}
                    {widget.type === "web" && (
                      <WebDashboardWidget config={widget.config} />
                    )}
                    {widget.type === "memo-list" && (
                      <MemoListDashboardWidget
                        memoDirPath={memoDirPath}
                        onOpenPath={(path) =>
                          void openMemoListPath(widget.id, path)}
                      />
                    )}
                    {widget.type === "timeline" && (
                      <TimelineDashboardWidget
                        config={widget.config}
                        isDark={isDark}
                        settings={chatSettings}
                        onOpenPath={(path) => void openPathAsWidget(path)}
                        onExternalPathOpened={onExternalPathOpened}
                        onChange={(config) =>
                          updateWidget({ ...widget, config })}
                      />
                    )}
                    {widget.type === "calendar" && (
                      <CalendarDashboardWidget
                        config={widget.config}
                        isDark={isDark}
                      />
                    )}
                    {widget.type === "kanban" && (
                      <KanbanDashboardWidget
                        config={widget.config}
                        isDark={isDark}
                        onChange={(config) =>
                          updateWidget({ ...widget, config })}
                        onOpenPath={(path) =>
                          void openKnownPathInLastActiveWidget(path)}
                      />
                    )}
                    {widget.type === "base" && (
                      <BaseDashboardWidget
                        config={widget.config}
                        settings={chatSettings}
                        isDark={isDark}
                        onChange={(config) =>
                          updateWidget({ ...widget, config })}
                        onOpenPath={(path) =>
                          void openKnownPathInLastActiveWidget(path)}
                      />
                    )}
                    {widget.type === "secret-manager" && (
                      <SecretManagerDashboardWidget
                        config={widget.config}
                        managerId={`${dashboardPath || "local"}:${widget.id}`}
                      />
                    )}
                    {pluginRender?.(widget.config, {
                      host: "dashboard",
                      size: { w: displayLayout.w, h: displayLayout.h },
                      widgetId: widget.id,
                      dashboardFileName: dashboardPath || undefined,
                      onConfigChange: (config) => {
                        if (
                          config && typeof config === "object" &&
                          !Array.isArray(config)
                        ) {
                          updateWidget({
                            ...widget,
                            config: config as Record<string, unknown>,
                          });
                        }
                      },
                    })}
                    {!pluginRender && pluginWidget && (() => {
                      const PluginWidget = pluginWidget;
                      return (
                        <PluginWidget
                          config={widget.config}
                          onChange={(config) =>
                            updateWidget({ ...widget, config })}
                        />
                      );
                    })()}
                    {!pluginRender && !pluginWidget &&
                      !isFileWidgetType(widget.type) &&
                      ![
                        "workflow",
                        "web",
                        "memo-list",
                        "timeline",
                        "kanban",
                        "base",
                        "secret-manager",
                      ].includes(widget.type) && (
                      <UnknownDashboardWidget widget={widget} />
                    )}
                  </div>
                  {!isMaximized && (
                    <button
                      type="button"
                      className="dashboard-resize"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setDragging({
                          id: widget.id,
                          mode: "resize",
                          pointerId: event.pointerId,
                          x: event.clientX,
                          y: event.clientY,
                          breakpoint: smallGrid ? "sm" : "lg",
                          origin: displayLayout,
                          dx: 0,
                          dy: 0,
                          next: displayLayout,
                        });
                      }}
                      title={tr("widget.resize")}
                    >
                      <Maximize2 size={13} />
                    </button>
                  )}
                </article>
              );
            })()
          ))}
        </div>
      </div>

      {(filePickerTargetId || filePickerCreatesWidget) && (
        <FilePickerDialog
          query={filePickerQuery}
          recentFiles={recentFiles}
          onQueryChange={setFilePickerQuery}
          onBrowse={browseLocalFile}
          onSelect={async (file) => {
            if (file.filePath) {
              setFilePickerTargetId(null);
              setFilePickerCreatesWidget(false);
              setFilePickerCreateDirection(activeLayoutDirection);
              setFilePickerQuery("");
              const result = await readKnownPath(file.filePath);
              if (!result) return;
              const content = await prepareOpenedContent(
                result.fileName,
                result.content,
              );
              applyPickedFile(
                result.fileName,
                content,
                readFileMode(result.fileName),
                result.path,
              );
              return;
            }
            applyPickedFile(
              file.fileName,
              file.content,
              file.mode,
              file.filePath,
            );
          }}
          onSelectPath={async (path) => {
            const result = await readKnownPath(path);
            if (!result) return;
            const content = await prepareOpenedContent(
              result.fileName,
              result.content,
            );
            applyPickedFile(
              result.fileName,
              content,
              readFileMode(result.fileName),
              result.path,
            );
          }}
          onClose={() => {
            setFilePickerTargetId(null);
            setFilePickerCreatesWidget(false);
            setFilePickerCreateDirection(activeLayoutDirection);
          }}
        />
      )}
      {paletteOpen && (
        <WidgetPalette
          onClose={() => setPaletteOpen(false)}
          onSelect={(type) => {
            setPaletteOpen(false);
            addWidget(type, activeLayoutDirection);
          }}
        />
      )}
      {settingsWidgetId && (() => {
        const widget = data.widgets.find((item) =>
          item.id === settingsWidgetId
        );
        return widget
          ? (
            <WidgetSettingsPanel
              widget={widget}
              chatSettings={chatSettings}
              directoryBase={directoryBase}
              onChange={(config) => {
                if (
                  isFileWidgetType(widget.type) &&
                  typeof config.path === "string" &&
                  config.path !== filePathFromConfig(widget.config)
                ) {
                  updateWidget({
                    ...widget,
                    config: {
                      ...config,
                      filePath: config.path,
                      fileName: config.path.split("/").pop() || config.path,
                      content: "",
                    },
                  });
                } else updateWidget({ ...widget, config });
              }}
              onTitleChange={(title) => updateWidget({ ...widget, title })}
              dashboardFileName={dashboardPath}
              onTypeChange={(type, config) =>
                updateWidget({ ...widget, type, config })}
              onDelete={() => {
                if (!confirm("Delete this widget?")) return;
                onChange({
                  ...data,
                  widgets: data.widgets.filter((item) => item.id !== widget.id),
                });
                setSettingsWidgetId(null);
                setPendingNewWidgetId(null);
              }}
              onClose={closeWidgetSettings}
            />
          )
          : null;
      })()}
    </section>
  );
}
