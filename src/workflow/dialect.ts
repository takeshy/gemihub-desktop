import type { RawWorkflowNode } from "./document";

export type WorkflowDialect = "desktop" | "web";

const webToDesktop: Record<string, string> = {
  "drive-file": "note",
  "drive-read": "note-read",
  "drive-search": "note-search",
  "drive-list": "note-list",
  "drive-folder-list": "folder-list",
  "drive-file-picker": "file-explorer",
  "drive-save": "file-save",
};

const desktopToWeb = Object.fromEntries(
  Object.entries(webToDesktop).map(([web, desktop]) => [desktop, web]),
) as Record<string, string>;

export function workflowDialectForPath(path: string): WorkflowDialect {
  if (!path || /\.workflow(?:\.ya?ml)?$/i.test(path)) return "desktop";
  return /\.ya?ml$/i.test(path) ? "web" : "desktop";
}

export function workflowNodeTypeForDesktop(type: unknown): unknown {
  return typeof type === "string" ? webToDesktop[type] ?? type : type;
}

export function convertWorkflowNodes(
  nodes: RawWorkflowNode[],
  dialect: WorkflowDialect,
): RawWorkflowNode[] {
  return nodes.map((node) => ({
    ...structuredClone(node),
    type: typeof node.type === "string"
      ? dialect === "desktop"
        ? webToDesktop[node.type] ?? node.type
        : desktopToWeb[node.type] ?? node.type
      : node.type,
  }));
}
