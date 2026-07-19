import yaml from "js-yaml";
import { createDirectory, deleteFile, listProjectFiles, readFile, renameFile, writeFile } from "../lib/wailsBackend";
import { DASHBOARD_EXT, DASHBOARD_FOLDER, DEFAULT_DASHBOARD_GRID, emptyDashboard, type DashboardData, type DashboardFileEntry, type DashboardGrid, type DashboardWidget, type LayoutPos } from "./types";

const dumpOptions = { lineWidth: -1, noRefs: true, sortKeys: false } as const;

function number(value: unknown, fallback: number): number { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function layout(value: unknown, fallback: LayoutPos): LayoutPos {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...fallback };
  const item = value as Record<string, unknown>;
  return { x: number(item.x, fallback.x), y: number(item.y, fallback.y), w: Math.max(1, number(item.w, fallback.w)), h: Math.max(1, number(item.h, fallback.h)) };
}
function grid(value: unknown): DashboardGrid {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_DASHBOARD_GRID };
  const item = value as Record<string, unknown>;
  return { cols: Math.max(1, number(item.cols, 12)), rowHeight: Math.max(20, number(item.rowHeight, 80)), gap: Math.max(0, number(item.gap, 8)) };
}

export function dashboardName(path: string): string {
  const base = path.replaceAll("\\", "/").split("/").pop() || "Dashboard";
  return base.toLowerCase().endsWith(DASHBOARD_EXT) ? base.slice(0, -DASHBOARD_EXT.length) : base;
}

export function safeDashboardPath(name: string): string | null {
  const clean = name.trim().replace(/\.dashboard$/i, "");
  if (!clean || /[\\/]|^\.+$/.test(clean)) return null;
  return `${DASHBOARD_FOLDER}/${clean}${DASHBOARD_EXT}`;
}

/** Parse GemiHub version-1 YAML while retaining unknown keys and widget types. */
export function parseDashboard(content: string): DashboardData | null {
  if (!content.trim()) return null;
  try {
    const value = yaml.load(content, { schema: yaml.JSON_SCHEMA });
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const root = value as Record<string, unknown>;
    const parsedGrid = grid(root.grid);
    const widgets: DashboardWidget[] = Array.isArray(root.widgets) ? root.widgets.flatMap((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
      const record = raw as Record<string, unknown>;
      const rawLayout = record.layout && typeof record.layout === "object" && !Array.isArray(record.layout) ? record.layout as Record<string, unknown> : {};
      const looksFlat = ["x", "y", "w", "h"].some((key) => key in rawLayout);
      const fallback = { x: 0, y: index * 3, w: 6, h: 3 };
      const lg = layout(looksFlat ? rawLayout : rawLayout.lg, fallback);
      const sm = !looksFlat && rawLayout.sm ? layout(rawLayout.sm, { x: 0, y: index * lg.h, w: parsedGrid.cols, h: lg.h }) : undefined;
      const config = record.config && typeof record.config === "object" && !Array.isArray(record.config) ? record.config as Record<string, unknown> : {};
      return [{ ...record, id: typeof record.id === "string" && record.id ? record.id : crypto.randomUUID(), type: typeof record.type === "string" ? record.type : "unknown", title: typeof record.title === "string" ? record.title : widgetLabel(typeof record.type === "string" ? record.type : "unknown"), layout: lg, layoutBreakpoints: { ...(!looksFlat ? rawLayout : {}), lg, ...(sm ? { sm } : {}) }, config } as DashboardWidget];
    }) : [];
    return { ...root, version: number(root.version, 1), grid: parsedGrid, widgets } as DashboardData;
  } catch { return null; }
}

export function serializeDashboard(data: DashboardData): string {
  const widgets = data.widgets.map((widget) => {
    const { layoutBreakpoints, ...stored } = widget;
    return { ...stored, layout: { ...(layoutBreakpoints || {}), lg: widget.layout } };
  });
  return yaml.dump({ ...data, widgets }, dumpOptions);
}

export function deriveSmallLayout(data: DashboardData): DashboardData {
  let y = 0;
  const cols = Math.max(1, data.grid?.cols || DEFAULT_DASHBOARD_GRID.cols);
  const ordered = [...data.widgets].sort((left, right) => left.layout.y - right.layout.y || left.layout.x - right.layout.x);
  const positions = new Map<string, LayoutPos>();
  for (const widget of ordered) {
    const existing = widget.layoutBreakpoints?.sm;
    if (existing) { positions.set(widget.id, existing); y = Math.max(y, existing.y + existing.h); }
    else { const next = { x: 0, y, w: cols, h: widget.layout.h }; positions.set(widget.id, next); y += next.h; }
  }
  return { ...data, widgets: data.widgets.map((widget) => ({ ...widget, layoutBreakpoints: { ...(widget.layoutBreakpoints || {}), lg: widget.layout, sm: positions.get(widget.id)! } })) };
}

export function widgetLabel(type: string): string {
  return ({ file: "File", markdown: "File", workflow: "Workflow", web: "Web Embed", "memo-list": "Memo List", timeline: "Timeline", kanban: "Kanban", base: "Base", "secret-manager": "Secret Manager" } as Record<string, string>)[type] || `Unknown (${type})`;
}

export async function listDashboardFiles(): Promise<DashboardFileEntry[]> {
  return (await listProjectFiles()).filter((entry) => entry.path.toLowerCase().endsWith(DASHBOARD_EXT) && !/(?:^|\/)(?:trash|history)\//i.test(entry.path))
    .map((entry) => ({ path: entry.path, name: dashboardName(entry.path), modTime: entry.modTime })).sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadDashboard(path: string): Promise<DashboardData | null> {
  const file = await readFile(`project://${path}`);
  return file ? parseDashboard(file.content) : null;
}

export async function saveDashboard(path: string, data: DashboardData): Promise<void> {
  await createDirectory(`project://${DASHBOARD_FOLDER}`);
  await writeFile(`project://${path}`, serializeDashboard(data));
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
}

export async function createDashboard(name: string): Promise<{ path: string; data: DashboardData }> {
  const path = safeDashboardPath(name);
  if (!path) throw new Error("Dashboard name must not contain path separators.");
  if (await readFile(`project://${path}`)) throw new Error(`Dashboard already exists: ${name}`);
  const data = emptyDashboard();
  await saveDashboard(path, data);
  return { path, data };
}

export async function renameDashboard(path: string, name: string): Promise<string> {
  const next = safeDashboardPath(name);
  if (!next) throw new Error("Dashboard name must not contain path separators.");
  if (next !== path && await readFile(`project://${next}`)) throw new Error(`Dashboard already exists: ${name}`);
  if (next !== path) await renameFile(`project://${path}`, `project://${next}`);
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  return next;
}

export async function removeDashboard(path: string): Promise<void> {
  await deleteFile(`project://${path}`);
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
}
