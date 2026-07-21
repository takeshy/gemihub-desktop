export type Breakpoint = "lg" | "sm";

export interface LayoutPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardGrid {
  cols: number;
  rowHeight: number;
  gap: number;
}

export interface DashboardWidget {
  id: string;
  type: string;
  title: string;
  /** Active (large-screen) layout used by the current grid renderer. */
  layout: LayoutPos;
  /** Original responsive layouts, retained for .dashboard round-trips. */
  layoutBreakpoints?: Partial<Record<Breakpoint, LayoutPos>>;
  config: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DashboardData {
  version: number;
  grid: DashboardGrid;
  widgets: DashboardWidget[];
  [key: string]: unknown;
}

export interface DashboardFileEntry {
  path: string;
  name: string;
  modTime: number;
}

export const DEFAULT_DASHBOARD_GRID: DashboardGrid = {
  cols: 12,
  rowHeight: 80,
  gap: 8,
};
export const DASHBOARD_FOLDER = "Dashboards";
export const DASHBOARD_EXT = ".dashboard";
export const DASHBOARD_STORAGE_KEY = "gemihub-desktop:legacy-dashboard";

export const defaultDashboard = (): DashboardData => ({
  version: 1,
  grid: { ...DEFAULT_DASHBOARD_GRID },
  widgets: [],
});

export const emptyDashboard = (): DashboardData => ({
  version: 1,
  grid: { ...DEFAULT_DASHBOARD_GRID },
  widgets: [],
});
