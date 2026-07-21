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
