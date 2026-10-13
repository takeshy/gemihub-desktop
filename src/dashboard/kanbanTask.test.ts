import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import {
  isCompletionColumn,
  parseKanbanTaskBody,
  serializeKanbanTaskBody,
} from "./kanbanTask.ts";

test("Kanban task body round-trips rich task fields", () => {
  const source = serializeKanbanTaskBody({
    description: "**Important** details",
    checklist: [{ text: "First step", completed: true }],
    attachments: [{ path: "Tasks/Attachments/spec.pdf", label: "Spec" }],
  });
  assertEquals(parseKanbanTaskBody(source), {
    description: "**Important** details",
    checklist: [{ text: "First step", completed: true }],
    attachments: [{ path: "Tasks/Attachments/spec.pdf", label: "Spec" }],
  });
});

test("completion columns recognize English and Japanese labels", () => {
  assertEquals(isCompletionColumn("done", "Done"), true);
  assertEquals(isCompletionColumn("closed", "完了"), true);
  assertEquals(isCompletionColumn("doing", "Doing"), false);
});
