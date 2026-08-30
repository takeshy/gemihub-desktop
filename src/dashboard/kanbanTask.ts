export const TASK_DETAILS_START = "<!-- gemihub:task-details:start -->";
export const TASK_DETAILS_END = "<!-- gemihub:task-details:end -->";

export interface KanbanChecklistItem {
  text: string;
  completed: boolean;
}

export interface KanbanAttachment {
  path: string;
  label: string;
}

export interface KanbanTaskBody {
  description: string;
  checklist: KanbanChecklistItem[];
  attachments: KanbanAttachment[];
}

const escapeWikiLabel = (value: string) =>
  value.replace(/[\\|\]]/g, "-").trim();

export function parseKanbanTaskBody(content: string): KanbanTaskBody {
  const start = content.indexOf(TASK_DETAILS_START);
  const end = start >= 0
    ? content.indexOf(TASK_DETAILS_END, start + TASK_DETAILS_START.length)
    : -1;
  if (start < 0 || end < 0) {
    return { description: content.trim(), checklist: [], attachments: [] };
  }

  const managed = content.slice(start + TASK_DETAILS_START.length, end);
  const checklist = Array.from(
    managed.matchAll(/^\s*- \[([ xX])\]\s+(.+?)\s*$/gm),
  ).map((match) => ({
    completed: match[1].toLowerCase() === "x",
    text: match[2].trim(),
  }));
  const attachments = Array.from(
    managed.matchAll(/^\s*- \[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/gm),
  ).map((match) => ({
    path: match[1].trim(),
    label: (match[2] || match[1].split("/").pop() || match[1]).trim(),
  }));
  const description = `${content.slice(0, start)}${
    content.slice(end + TASK_DETAILS_END.length)
  }`.trim();
  return { description, checklist, attachments };
}

export function serializeKanbanTaskBody(task: KanbanTaskBody): string {
  const sections: string[] = [];
  if (task.checklist.length > 0) {
    sections.push(
      "## Checklist\n" + task.checklist
        .filter((item) => item.text.trim())
        .map((item) => `- [${item.completed ? "x" : " "}] ${item.text.trim()}`)
        .join("\n"),
    );
  }
  if (task.attachments.length > 0) {
    sections.push(
      "## Attachments\n" + task.attachments
        .filter((item) => item.path.trim())
        .map((item) =>
          `- [[${item.path.trim()}|${
            escapeWikiLabel(item.label) || item.path.split("/").pop()
          }]]`
        )
        .join("\n"),
    );
  }
  const description = task.description.trim();
  if (sections.length === 0) return description ? `${description}\n` : "";
  return [
    description,
    TASK_DETAILS_START,
    sections.join("\n\n"),
    TASK_DETAILS_END,
  ]
    .filter(Boolean)
    .join("\n\n") + "\n";
}

export function isCompletionColumn(value: string, label: string): boolean {
  const completion = /\b(done|complete|completed|finished)\b/i;
  return completion.test(value.trim()) || completion.test(label.trim()) ||
    /(完了|終了|済)/.test(`${value} ${label}`);
}
