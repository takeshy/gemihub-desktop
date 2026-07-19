import type { FileTreeNode } from "./wailsBackend";

export type FileTreeScope = "project" | "files";

const MANAGED_PROJECT_ROOTS = [
  "Dashboards",
  "Memos",
  "Secrets",
  "skills",
  "workflows",
];

function isProjectResourcePath(path: string): boolean {
  const root = path.split("/", 1)[0];
  return MANAGED_PROJECT_ROOTS.some((name) =>
    name.toLowerCase() === root.toLowerCase()
  );
}

export function isProtectedProjectRoot(
  node: FileTreeNode,
  depth: number,
): boolean {
  return depth === 0 && node.isDir && isProjectResourcePath(node.name);
}

export function scopedTreePath(scope: FileTreeScope, path: string): string {
  if (scope === "files") return `workspace://${path}`;
  return isProjectResourcePath(path) ? path : `project://${path}`;
}
