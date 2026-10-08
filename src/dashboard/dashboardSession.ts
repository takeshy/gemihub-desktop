import { type DashboardData, defaultDashboard } from "./types";

/** A virtual dashboard; never a path passed to the workspace backend. */
export const SINGLE_DASHBOARD = "single";

export function initialDashboardSession(
  startupPaths: string[],
  lastDashboard: string | null,
  startupAlreadyHandled: boolean,
) {
  const associatedLaunch = !startupAlreadyHandled && startupPaths.length > 0;
  return {
    associatedLaunch,
    restoreSingle: !associatedLaunch && lastDashboard === SINGLE_DASHBOARD,
  };
}

export function dashboardSessionKeys(workspaceId: string) {
  const scope = encodeURIComponent(workspaceId || "local");
  return {
    last: `gemihub-desktop:last-dashboard:${scope}`,
    home: `gemihub-desktop:home-dashboard:${scope}`,
    single: `gemihub-desktop:single-dashboard:${scope}`,
  };
}

export function singleDashboard(data = defaultDashboard()): DashboardData {
  return { ...data, widgets: data.widgets.slice(0, 1) };
}

/** Carry the single file into a regular dashboard without sharing widget IDs. */
export function carrySingleFile(
  target: DashboardData,
  single: DashboardData,
): DashboardData {
  const source = single.widgets[0];
  if (!source) return target;
  const widgets = structuredClone(target.widgets);
  const y = widgets.reduce(
    (end, widget) => Math.max(end, widget.layout.y + widget.layout.h),
    0,
  );
  const widget = structuredClone(source);
  widget.id = crypto.randomUUID();
  widget.layout = { ...widget.layout, x: 0, y, w: target.grid.cols };
  delete widget.layoutBreakpoints;
  return { ...target, widgets: [...widgets, widget] };
}
