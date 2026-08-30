import type { KanbanChecklistItem } from "./kanbanTask";

export interface KanbanAiTask {
  title: string;
  description: string;
  due: string;
  checklist: KanbanChecklistItem[];
}

export const KANBAN_AI_SOURCE =
  `Convert the user's request into one or more actionable tasks.
Today is {{today}}.
Return ONLY a JSON array. Each item must have this exact shape:
{"title":"short task title","description":"helpful detail or empty string","due":"YYYY-MM-DD or empty string","checklist":[{"text":"subtask","completed":false}]}
Resolve relative dates from today. Do not invent a deadline. Keep the user's language.`;

function validIsoDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    ? value
    : "";
}

export function parseKanbanAiTasks(value: string): KanbanAiTask[] {
  const parsed = JSON.parse(
    value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  ) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("AI response must be a JSON array.");
  }
  const tasks = parsed.flatMap((item): KanbanAiTask[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) return [];
    const checklist = Array.isArray(record.checklist)
      ? record.checklist.flatMap((entry): KanbanChecklistItem[] => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return [];
        }
        const row = entry as Record<string, unknown>;
        const text = String(row.text ?? "").trim();
        return text ? [{ text, completed: Boolean(row.completed) }] : [];
      })
      : [];
    return [{
      title,
      description: typeof record.description === "string"
        ? record.description.trim()
        : "",
      due: validIsoDate(record.due),
      checklist,
    }];
  });
  if (tasks.length === 0) throw new Error("AI did not return any valid tasks.");
  return tasks.slice(0, 20);
}
