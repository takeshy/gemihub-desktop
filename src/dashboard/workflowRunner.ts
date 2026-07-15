import { readFile, writeFile } from "../lib/wailsBackend";
import type { ChatSettings } from "../llm/settings";
import { executeWorkflow } from "../workflow/executor";
import { parseWorkflowFile } from "../workflow/parser";

export interface WorkflowCacheRecord { ranAt: number; status: "ok" | "error"; text?: string; error?: string }
let saveQueue = Promise.resolve();

export function workflowCachePath(scope = "local"): string {
  const safe = encodeURIComponent(scope || "local").replaceAll("%", "_");
  return `Dashboards/Data/${safe}.json`;
}

async function loadAll(scope: string): Promise<Record<string, WorkflowCacheRecord>> {
  try { return JSON.parse((await readFile(workflowCachePath(scope)))?.content || "{}") as Record<string, WorkflowCacheRecord>; } catch { return {}; }
}

export async function loadWorkflowWidgetCache(widgetId: string, scope = "local"): Promise<WorkflowCacheRecord | null> {
  return (await loadAll(scope))[widgetId] ?? null;
}

export async function saveWorkflowWidgetCache(widgetId: string, record: WorkflowCacheRecord, scope = "local"): Promise<void> {
  saveQueue = saveQueue.catch(() => undefined).then(async () => {
    const all = await loadAll(scope);
    all[widgetId] = record;
    await writeFile(workflowCachePath(scope), JSON.stringify(all, null, 2));
  });
  await saveQueue;
}

export function extractWorkflowText(variables: Record<string, string | number>, outputVariable?: string): string | null {
  if (outputVariable) return variables[outputVariable] === undefined ? null : String(variables[outputVariable]);
  if (variables.result !== undefined) return String(variables.result);
  for (const [key, value] of Object.entries(variables)) if (!key.startsWith("_") && String(value)) return String(value);
  return null;
}

export async function runWorkflowText(settings: ChatSettings, workflowPath: string, outputVariable: string | undefined, signal: AbortSignal): Promise<string> {
  const file = await readFile(workflowPath);
  if (!file) throw new Error(`Workflow not found: ${workflowPath}`);
  const workflow = parseWorkflowFile(file.content, workflowPath);
  const run = await executeWorkflow(workflow, workflowPath, { chatSettings: settings, signal, interactionMode: "headless" });
  if (run.status !== "completed") throw new Error(run.error || `Workflow ${run.status}`);
  const text = extractWorkflowText(run.variables, outputVariable);
  if (text === null) throw new Error("Workflow output is not a string. Store output in result or configure Output variable.");
  return text;
}
