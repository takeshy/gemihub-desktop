export type WorkflowEventType = "create" | "modify" | "delete" | "rename" | "file-open";

export interface WorkflowEventTrigger {
  workflowId: string;
  events: WorkflowEventType[];
  filePattern?: string;
}

export interface WorkflowAutomationSettings {
  hotkeys: Record<string, string>;
  triggers: WorkflowEventTrigger[];
}

export const workflowAutomationKey = "gemihub-desktop:workflow-automation";
export const workflowAutomationChangedEvent = "llm-hub:workflow-automation-changed";

function scopedKey(directoryBase: string): string {
  return directoryBase ? `${workflowAutomationKey}:${encodeURIComponent(directoryBase)}` : workflowAutomationKey;
}

export function loadWorkflowAutomationSettings(directoryBase = ""): WorkflowAutomationSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey(directoryBase)) || "{}") as Partial<WorkflowAutomationSettings>;
    return {
      hotkeys: parsed.hotkeys && typeof parsed.hotkeys === "object" ? parsed.hotkeys : {},
      triggers: Array.isArray(parsed.triggers) ? parsed.triggers.filter((trigger) => trigger && typeof trigger.workflowId === "string" && Array.isArray(trigger.events)) : [],
    };
  } catch { return { hotkeys: {}, triggers: [] }; }
}

export function saveWorkflowAutomationSettings(settings: WorkflowAutomationSettings, directoryBase = ""): void {
  localStorage.setItem(scopedKey(directoryBase), JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(workflowAutomationChangedEvent, { detail: { directoryBase, settings } }));
}

export function matchWorkflowFilePattern(pattern: string | undefined, path: string): boolean {
  if (!pattern?.trim()) return true;
  let source = pattern.trim().replace(/[.+^$()|\\]/g, "\\$&");
  source = source.replace(/\{([^{}]+)\}/g, (_, values: string) => `(${values.split(",").map((value) => value.trim().replace(/[.+^$()|\\]/g, "\\$&")).join("|")})`);
  source = source.replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0001/g, "(?:.*/)?").replace(/\u0000/g, ".*");
  try { return new RegExp(`^${source}$`, "i").test(path); } catch { return false; }
}

export function keyboardEventShortcut(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!["Control", "Meta", "Alt", "Shift"].includes(key)) parts.push(key);
  return parts.join("+");
}
