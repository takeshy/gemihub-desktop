import type { FileTreeNode } from "./wailsBackend";

export type FileTreeScope = "workspace" | "files";

const MANAGED_PROJECT_ROOTS = [
  "Dashboards",
  "Memos",
  "Secrets",
  "skills",
  "workflows",
];

function isWorkspaceResourcePath(path: string): boolean {
  const root = path.split("/", 1)[0];
  return MANAGED_PROJECT_ROOTS.some((name) =>
    name.toLowerCase() === root.toLowerCase()
  );
}

export function isProtectedWorkspaceRoot(
  node: FileTreeNode,
  depth: number,
): boolean {
  return depth === 0 && node.isDir && isWorkspaceResourcePath(node.name);
}

export function scopedTreePath(scope: FileTreeScope, path: string): string {
  if (scope === "files") return `files://${path}`;
  return `workspace://${path}`;
}
