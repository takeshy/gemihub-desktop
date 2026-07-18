import type { PluginView } from "./types";

/**
 * Older desktop plugin patches registered file-backed main views as sidebar
 * views. An extension list identifies those views and lets current hosts route
 * them through the dashboard widget path.
 */
export function normalizeDesktopPluginView(view: PluginView): PluginView {
  if (view.location === "sidebar" && view.extensions?.length) {
    return { ...view, location: "main" };
  }
  return view;
}

export function pluginViewForPath(
  views: PluginView[],
  filePath: string,
): PluginView | undefined {
  if (!filePath) return undefined;
  const normalizedPath = filePath.toLowerCase();
  return views.find((view) =>
    view.location === "main" &&
    view.extensions?.some((extension) =>
      normalizedPath.endsWith(extension.toLowerCase())
    )
  );
}
