import type { FileTreeNode } from "./wailsBackend";
import { type FileRef, fileRef } from "./fileRef";

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

export function scopedTreeRef(scope: FileTreeScope, path: string): FileRef {
  return fileRef(scope, path);
}

export function absoluteFilesPath(base: string, relative: string): string {
  const normalizedBase = base.replace(/[\\/]+$/, "");
  const normalizedRelative = relative.replace(/^\.\/?/, "");
  return normalizedRelative
    ? `${normalizedBase}/${normalizedRelative}`
    : normalizedBase;
}

export function filesystemParentPath(path: string): string {
  const separator = path.includes("\\") && !path.includes("/") ? "\\" : "/";
  const trimmed = path.replace(/[\\/]+$/, "");
  if (!trimmed || /^[a-z]:$/i.test(trimmed)) return "";
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index < 0) return "";
  if (index === 0) return separator;
  if (index === 2 && /^[a-z]:/i.test(trimmed)) {
    return `${trimmed.slice(0, 2)}${separator}`;
  }
  return trimmed.slice(0, index);
}

export function focusedExternalTree(
  nodes: FileTreeNode[],
  directoryBase: string,
  focusPath: string,
): FileTreeNode[] {
  if (!focusPath) return nodes;
  const normalize = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase();
  const base = normalize(directoryBase);
  const focus = normalize(focusPath);
  if (!base || !focus.startsWith(`${base}/`)) return nodes;
  const relative = focus.slice(base.length + 1);
  if (!relative || relative.includes("/")) return nodes;
  const match = nodes.filter((node) => normalize(node.path) === relative);
  return match.length ? match : nodes;
}

function normalizedTreePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function workspaceMoveTarget(
  sourcePath: string,
  destinationDirectory: string,
): string {
  const source = normalizedTreePath(sourcePath);
  const destination = normalizedTreePath(destinationDirectory);
  const name = source.split("/").pop() ?? "";
  return destination ? `${destination}/${name}` : name;
}

export function canMoveWorkspacePath(
  sourcePath: string,
  sourceIsDirectory: boolean,
  destinationDirectory: string,
): boolean {
  const source = normalizedTreePath(sourcePath).toLocaleLowerCase();
  const destination = normalizedTreePath(destinationDirectory)
    .toLocaleLowerCase();
  const target = workspaceMoveTarget(sourcePath, destinationDirectory)
    .toLocaleLowerCase();
  if (!source || !target || source === target) return false;
  return !sourceIsDirectory ||
    (destination !== source && !destination.startsWith(`${source}/`));
}
