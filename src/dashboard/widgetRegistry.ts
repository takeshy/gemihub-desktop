import type { DashboardWidget } from "./types";
import type { ComponentType, FC, ReactNode } from "react";

export interface DashboardWidgetContext {
  host: "dashboard" | "canvas";
  size: { w: number; h: number };
  widgetId?: string;
  dashboardFileId?: string;
  dashboardFileName?: string;
  onConfigChange?: (config: unknown) => void;
}

export interface DashboardWidgetConfigEditorProps {
  config: unknown;
  onChange: (next: unknown) => void;
  setDoneAction?: (action: (() => unknown | Promise<unknown>) | null) => void;
  widgetType?: string;
  onTypeChange?: (nextType: string, nextConfig: Record<string, unknown>) => void;
  widgetId?: string;
  dashboardFileId?: string;
  dashboardFileName?: string;
}

/** Web-compatible contract exposed through PluginAPI.registerWidget. */
export interface PluginWidgetDefinition {
  type: string;
  label: string;
  hiddenFromPalette?: boolean;
  icon?: ReactNode;
  defaultConfig: unknown;
  render: (config: unknown, ctx: DashboardWidgetContext) => ReactNode;
  defaultSize?: { w: number; h: number };
  ConfigEditor?: FC<DashboardWidgetConfigEditorProps>;
  filePathOf?: (config: unknown) => string | undefined;
  externalUrlOf?: (config: unknown) => string | undefined;
}

export interface DashboardWidgetDefinition {
  type: string;
  label: string;
  description: string;
  defaultConfig: Record<string, unknown>;
  defaultSize: { w: number; h: number };
  hidden?: boolean;
  filePathKey?: string;
  component?: ComponentType<{ config: Record<string, unknown>; onChange: (config: Record<string, unknown>) => void }>;
  configComponent?: ComponentType<{ config: Record<string, unknown>; onChange: (config: Record<string, unknown>) => void }>;
  configurable?: boolean;
  /** Web-compatible plugin widget fields. */
  render?: PluginWidgetDefinition["render"];
  ConfigEditor?: PluginWidgetDefinition["ConfigEditor"];
  filePathOf?: PluginWidgetDefinition["filePathOf"];
  externalUrlOf?: PluginWidgetDefinition["externalUrlOf"];
  hiddenFromPalette?: boolean;
  icon?: ReactNode;
}

const core: DashboardWidgetDefinition[] = [
  { type: "base", label: "Base", description: "Table, cards, or list view from a .base query", defaultConfig: { base: "", view: "" }, defaultSize: { w: 6, h: 5 }, filePathKey: "base", configurable: true },
  { type: "file", label: "File", description: "Markdown, text, HTML, EPUB, PDF, or image", defaultConfig: { path: "", showHeader: true, showProperties: true }, defaultSize: { w: 6, h: 4 }, filePathKey: "path", configurable: true },
  { type: "markdown", label: "File", description: "Legacy File widget alias", defaultConfig: { path: "", showHeader: true, showProperties: true }, defaultSize: { w: 6, h: 4 }, hidden: true, filePathKey: "path", configurable: true },
  { type: "kanban", label: "Kanban", description: "Board backed by a .kanban definition and Markdown folder", defaultConfig: { kanban: "", folder: "", statusProperty: "status", titleProperty: "title", columns: [{ value: "todo", label: "To do" }, { value: "doing", label: "Doing" }, { value: "done", label: "Done" }] }, defaultSize: { w: 8, h: 5 }, filePathKey: "kanban", configurable: true },
  { type: "timeline", label: "Timeline", description: "Personal Markdown microblog", defaultConfig: { name: "", latestCount: 20, composerMode: "raw" }, defaultSize: { w: 6, h: 6 }, configurable: true },
  { type: "calendar", label: "Calendar", description: "Timeline events and locally created files", defaultConfig: { timelineName: "Timeline", showCreatedFiles: true }, defaultSize: { w: 6, h: 6 }, configurable: true },
  { type: "workflow", label: "Workflow", description: "Run a workflow and display one output variable", defaultConfig: { workflow: "", outputVariable: "result", output: "table", limit: 50, showHeader: true }, defaultSize: { w: 6, h: 5 }, filePathKey: "workflow", configurable: true },
  { type: "web", label: "Web Embed", description: "Embed an external HTTPS page", defaultConfig: { url: "", showHeader: true }, defaultSize: { w: 6, h: 4 }, configurable: true },
  { type: "memo-list", label: "Memo List", description: "Browse all document memo files", defaultConfig: {}, defaultSize: { w: 4, h: 5 } },
  { type: "secret-manager", label: "Secret Manager", description: "Create, unlock, copy, and update encrypted files", defaultConfig: { folder: "" }, defaultSize: { w: 5, h: 5 }, configurable: true },
];

const pluginDefinitions = new Map<string, DashboardWidgetDefinition>();

export function registerDashboardWidget(definition: DashboardWidgetDefinition): void {
  pluginDefinitions.set(definition.type, definition);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("llm-hub:dashboard-widgets-changed"));
}

export function registerPluginWidget(definition: PluginWidgetDefinition): void {
  const normalized: DashboardWidgetDefinition = {
    ...definition,
    description: "",
    defaultConfig: definition.defaultConfig as Record<string, unknown>,
    defaultSize: definition.defaultSize ?? { w: 4, h: 4 },
    hidden: definition.hiddenFromPalette,
    configurable: !!definition.ConfigEditor,
  };
  registerDashboardWidget(normalized);
}

export function dashboardWidgetDefinitions(): DashboardWidgetDefinition[] { return [...core, ...pluginDefinitions.values()]; }
export function dashboardWidgetDefinition(type: string): DashboardWidgetDefinition | null { return dashboardWidgetDefinitions().find((item) => item.type === type) ?? null; }

export function dashboardWidgetFilePath(widget: DashboardWidget): string | undefined {
  const definition = dashboardWidgetDefinition(widget.type);
  const resolved = definition?.filePathOf?.(widget.config);
  if (resolved) return resolved;
  const key = definition?.filePathKey;
  if (!key) return undefined;
  const value = widget.config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function dashboardWidgetHasSettings(type: string): boolean {
  const definition = dashboardWidgetDefinition(type);
  return definition?.configurable === true || !!definition?.configComponent || !!definition?.ConfigEditor;
}

/** Whether a newly-added widget has its primary selection configured. */
export function isDashboardWidgetConfigured(widget: DashboardWidget): boolean {
  const stringValue = (key: string): string => {
    const value = widget.config?.[key];
    return typeof value === "string" ? value.trim() : "";
  };
  switch (widget.type) {
    case "file":
    case "markdown":
      return stringValue("path").length > 0 || stringValue("filePath").length > 0;
    case "timeline":
      return stringValue("name").length > 0 || stringValue("path").length > 0;
    case "calendar":
      return stringValue("timelineName").length > 0;
    case "web":
      return stringValue("url").length > 0;
    case "workflow":
      return stringValue("workflow").length > 0;
    case "kanban":
      return stringValue("kanban").length > 0
        || (stringValue("folder").length > 0 && stringValue("title").length > 0);
    default:
      return true;
  }
}
