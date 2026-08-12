import { sameFileReference } from "./fileReference.ts";

export function fileWidgetHydrationReady(
  scope: unknown,
  directoryBase: string,
  workspaceBase: string,
): boolean {
  if (scope === "workspace") return !!workspaceBase;
  // Legacy persisted widgets without an explicit FileRef are Files-scoped.
  return !!directoryBase;
}

export function fileWidgetViewerState(
  extraConfig: Record<string, unknown>,
): Record<string, unknown> {
  return { externalOnly: false, ...extraConfig };
}

export function fileChangeMatchesWidget(
  widgetPaths: string[],
  changedPath: string,
): boolean {
  return !!changedPath && widgetPaths.some((path) =>
    !!path && sameFileReference(path, changedPath)
  );
}

export function resetFileHydrationForDashboard(
  hydratedPaths: Set<string>,
  previousDashboardPath: string | undefined,
  dashboardPath: string | undefined,
): string | undefined {
  if (previousDashboardPath !== dashboardPath) hydratedPaths.clear();
  return dashboardPath;
}

export function resolvedFileWidgetContent(
  configuredContent: unknown,
  filePath: string,
  fallbackContent: string,
): string {
  if (typeof configuredContent === "string") return configuredContent;
  return filePath ? "" : fallbackContent;
}
