import type { ChatUsage, McpAppInfo } from "../lib/wailsBackend";

export const workflowNodeTypes = [
  "variable",
  "set",
  "if",
  "while",
  "command",
  "http",
  "json",
  "note",
  "note-read",
  "note-search",
  "note-list",
  "folder-list",
  "note-delete",
  "drive-delete",
  "open",
  "dialog",
  "prompt-value",
  "prompt-file",
  "prompt-selection",
  "workflow",
  "rag-sync",
  "file-explorer",
  "file-save",
  "gemihub-command",
  "mcp",
  "sleep",
  "script",
  "shell",
] as const;

export type WorkflowNodeType = typeof workflowNodeTypes[number];

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  properties: Record<string, string>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: "true" | "false";
}

export interface Workflow {
  name?: string;
  nodes: Map<string, WorkflowNode>;
  edges: WorkflowEdge[];
  startNode: string | null;
  options?: { showProgress?: boolean };
}

export interface WorkflowLog {
  nodeId: string;
  nodeType: WorkflowNodeType | "system";
  message: string;
  timestamp: string;
  status: "info" | "success" | "error";
  input?: Record<string, unknown>;
  output?: unknown;
  mcpAppInfo?: WorkflowMcpAppInfo;
  usage?: ChatUsage;
  elapsedMs?: number;
  variablesSnapshot?: Record<string, string | number>;
}

export type WorkflowMcpAppInfo = McpAppInfo;

export interface WorkflowRun {
  id: string;
  workflowPath: string;
  workflowName?: string;
  startTime: string;
  endTime?: string;
  status: "running" | "completed" | "error" | "cancelled";
  logs: WorkflowLog[];
  variables: Record<string, string | number>;
  error?: string;
}

export function isWorkflowNodeType(value: unknown): value is WorkflowNodeType {
  return typeof value === "string" &&
    (workflowNodeTypes as readonly string[]).includes(value);
}

export function normalizeWorkflowValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
