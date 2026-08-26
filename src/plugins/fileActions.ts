export interface PluginFileActionTarget {
  scope: "workspace" | "files";
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface PluginFileAction {
  id: string;
  label: string;
  when?: (target: PluginFileActionTarget) => boolean;
  onClick: (target: PluginFileActionTarget) => void | Promise<void>;
}

interface RegisteredFileAction extends PluginFileAction {
  pluginId: string;
}

const treeActions = new Map<string, RegisteredFileAction>();
const viewerActions = new Map<string, RegisteredFileAction>();

function notifyChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("llm-hub:plugin-file-actions-changed"));
  }
}

function register(
  collection: Map<string, RegisteredFileAction>,
  pluginId: string,
  action: PluginFileAction,
): () => void {
  const key = `${pluginId}:${action.id}`;
  collection.set(key, { ...action, pluginId });
  notifyChanged();
  return () => {
    collection.delete(key);
    notifyChanged();
  };
}

export function registerFileTreeContextMenuItem(
  pluginId: string,
  action: PluginFileAction,
): () => void {
  return register(treeActions, pluginId, action);
}

export function registerFileViewerAction(
  pluginId: string,
  action: PluginFileAction,
): () => void {
  return register(viewerActions, pluginId, action);
}

function available(
  collection: Map<string, RegisteredFileAction>,
  target: PluginFileActionTarget,
): RegisteredFileAction[] {
  return [...collection.values()].filter((action) => {
    try {
      return action.when?.(target) ?? true;
    } catch (error) {
      console.warn("Plugin file action predicate failed", error);
      return false;
    }
  });
}

export function fileTreeContextMenuItemsFor(
  target: PluginFileActionTarget,
): RegisteredFileAction[] {
  return available(treeActions, target);
}

export function fileViewerActionsFor(
  target: PluginFileActionTarget,
): RegisteredFileAction[] {
  return available(viewerActions, target);
}

export function unregisterPluginFileActions(pluginId?: string): void {
  for (const collection of [treeActions, viewerActions]) {
    for (const [key, action] of collection) {
      if (!pluginId || action.pluginId === pluginId) collection.delete(key);
    }
  }
  notifyChanged();
}
