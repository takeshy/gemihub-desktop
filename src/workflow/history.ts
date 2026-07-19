import type { WorkflowRun } from "./types";
import { isEncryptedFile } from "../lib/hybridEncryption";
import { readWorkspaceStateFile, writeWorkspaceStateFile } from "../lib/wailsBackend";
import { decryptHistoryPayload, encryptHistoryPayload, historyEncryptionPreferences, historyEncryptionUnlocked } from "../lib/historyEncryption";

export const workflowHistoryStateFile = "workflow-history";
const cache = new Map<string, WorkflowRun[]>();
const writeQueues = new Map<string, Promise<void>>();
const mutationQueues = new Map<string, Promise<WorkflowRun[]>>();

function scopeKey(workspaceBase: string): string {
  return workspaceBase || "__session__";
}

function notify(workspaceBase: string, records: WorkflowRun[]): void {
  window.dispatchEvent(new CustomEvent("llm-hub:workflow-history-changed", { detail: { workspaceBase, records } }));
}

async function persistHistory(records: WorkflowRun[], workspaceBase: string): Promise<void> {
  const key = scopeKey(workspaceBase);
  cache.set(key, records);
  notify(workspaceBase, records);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(async () => {
    const json = JSON.stringify(records);
    const content = historyEncryptionPreferences().workflow ? await encryptHistoryPayload(json, "workflow-log") : json;
    await writeWorkspaceStateFile(workflowHistoryStateFile, content);
  });
  writeQueues.set(key, queued);
  try {
    await queued;
  } finally {
    if (writeQueues.get(key) === queued) writeQueues.delete(key);
  }
}

export function truncateWorkflowHistoryData(value: unknown): unknown {
  if (typeof value === "string" && value.length > 1000) {
    if (/^[A-Za-z0-9+/=]+$/.test(value.slice(0, 100))) return `[Binary data: ${value.length} chars]`;
    return `${value.slice(0, 400)}...[truncated ${value.length - 800} chars]...${value.slice(-400)}`;
  }
  if (Array.isArray(value)) return value.map(truncateWorkflowHistoryData);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, truncateWorkflowHistoryData(item)]));
  return value;
}

function persistedRun(run: WorkflowRun, keepSnapshots: boolean): WorkflowRun {
  return {
    ...run,
    variables: truncateWorkflowHistoryData(run.variables) as WorkflowRun["variables"],
    logs: run.logs.map((log) => ({
      ...log,
      input: truncateWorkflowHistoryData(log.input) as typeof log.input,
      output: truncateWorkflowHistoryData(log.output),
      variablesSnapshot: keepSnapshots ? log.variablesSnapshot : undefined,
    })),
  };
}

export async function loadWorkflowHistory(workspaceBase = "", force = false): Promise<WorkflowRun[]> {
  const key = scopeKey(workspaceBase);
  if (!force && cache.has(key)) return cache.get(key)!;
  try {
    const raw = await readWorkspaceStateFile(workflowHistoryStateFile);
    if (!raw) {
      cache.set(key, []);
      return [];
    }
    if (isEncryptedFile(raw) && !historyEncryptionUnlocked()) return [];
    const records = JSON.parse(isEncryptedFile(raw) ? await decryptHistoryPayload(raw) : raw) as WorkflowRun[];
    const normalized = Array.isArray(records) ? records : [];
    cache.set(key, normalized);
    return normalized;
  } catch {
    return [];
  }
}

export async function appendWorkflowHistory(run: WorkflowRun, workspaceBase = ""): Promise<WorkflowRun[]> {
  return mutateHistory(workspaceBase, (stored) => {
    const current = persistedRun(run, true);
    const older = stored.filter((item) => item.id !== run.id).map((item) => persistedRun(item, item.workflowPath !== run.workflowPath));
    return [current, ...older].slice(0, 50);
  });
}

export async function clearWorkflowHistory(workflowPath: string | undefined, workspaceBase = ""): Promise<WorkflowRun[]> {
  return mutateHistory(workspaceBase, (stored) => workflowPath ? stored.filter((item) => item.workflowPath !== workflowPath) : []);
}

export async function removeWorkflowHistory(id: string, workspaceBase = ""): Promise<WorkflowRun[]> {
  return mutateHistory(workspaceBase, (stored) => stored.filter((item) => item.id !== id));
}

function mutateHistory(workspaceBase: string, change: (records: WorkflowRun[]) => WorkflowRun[]): Promise<WorkflowRun[]> {
  const key = scopeKey(workspaceBase);
  const previous = mutationQueues.get(key) ?? Promise.resolve(cache.get(key) ?? []);
  const task = previous.catch(() => []).then(async () => {
    const stored = cache.has(key) ? cache.get(key)! : await loadWorkflowHistory(workspaceBase);
    const next = change(stored);
    await persistHistory(next, workspaceBase);
    return next;
  });
  mutationQueues.set(key, task);
  void task.then(
    () => { if (mutationQueues.get(key) === task) mutationQueues.delete(key); },
    () => { if (mutationQueues.get(key) === task) mutationQueues.delete(key); },
  );
  return task;
}
