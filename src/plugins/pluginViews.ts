import type { PluginView } from "./types";

/** Normalize the legacy Desktop representation of a companion main view. */
export function normalizeDesktopPluginView(view: PluginView): PluginView {
  return view.location === "sidebar" && view.extensions?.length
    ? { ...view, location: "main" }
    : view;
}

/** Find the plugin main view registered for a file extension. */
export function pluginViewForPath(
  views: PluginView[],
  path: string,
): PluginView | undefined {
  if (!path) return undefined;
  const lowerPath = path.toLowerCase();
  return views.find((view) =>
    view.location === "main" && view.extensions?.some((extension) => {
      const normalized = extension.startsWith(".") ? extension : `.${extension}`;
      return lowerPath.endsWith(normalized.toLowerCase());
    })
  );
}
