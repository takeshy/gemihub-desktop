import type { FileTreeNode } from "./wailsBackend";

export type FileTreeScope = "project" | "files";

const MANAGED_PROJECT_ROOTS = new Set([
  "Dashboards",
  "Memos",
  "Secrets",
  "skills",
  "workflows",
]);

export function isProtectedProjectRoot(
  node: FileTreeNode,
  depth: number,
): boolean {
  return depth === 0 && node.isDir && MANAGED_PROJECT_ROOTS.has(node.name);
}

export function scopedTreePath(scope: FileTreeScope, path: string): string {
  if (scope === "files") return `workspace://${path}`;
  const root = path.split("/", 1)[0];
  return MANAGED_PROJECT_ROOTS.has(root) ? path : `project://${path}`;
}
