import type { FileScope } from "../lib/fileRef";

export interface FileTreeDecorationTarget {
  scope: FileScope;
  path: string;
  isDirectory: boolean;
}

export interface FileTreeDecoration {
  color?: string;
  title?: string;
}

export type FileTreeDecorationProvider = (
  target: FileTreeDecorationTarget,
) =>
  | FileTreeDecoration
  | null
  | undefined
  | Promise<FileTreeDecoration | null | undefined>;

const providers = new Map<string, Set<FileTreeDecorationProvider>>();

export function registerFileTreeDecorationProvider(
  pluginId: string,
  provider: FileTreeDecorationProvider,
): () => void {
  const pluginProviders = providers.get(pluginId) ?? new Set();
  pluginProviders.add(provider);
  providers.set(pluginId, pluginProviders);
  refreshFileTreeDecorations();
  return () => {
    pluginProviders.delete(provider);
    if (!pluginProviders.size) providers.delete(pluginId);
    refreshFileTreeDecorations();
  };
}

export function unregisterFileTreeDecorationProviders(pluginId?: string): void {
  if (pluginId) providers.delete(pluginId);
  else providers.clear();
  refreshFileTreeDecorations();
}

export function refreshFileTreeDecorations(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("llm-hub:file-tree-decorations-changed"));
  }
}

export async function fileTreeDecorationFor(
  target: FileTreeDecorationTarget,
): Promise<FileTreeDecoration | null> {
  for (const pluginProviders of providers.values()) {
    for (const provider of pluginProviders) {
      try {
        const decoration = await provider(target);
        if (decoration) return decoration;
      } catch (error) {
        console.warn("FileTree decoration provider failed", error);
      }
    }
  }
  return null;
}
