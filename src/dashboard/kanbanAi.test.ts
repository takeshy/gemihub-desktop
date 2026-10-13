import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { parseKanbanAiTasks } from "./kanbanAi.ts";

test("Kanban AI parser accepts fenced task arrays", () => {
  assertEquals(
    parseKanbanAiTasks(`\`\`\`json
[{"title":"Ship","description":"Check it","due":"2026-09-01","checklist":[{"text":"Test","completed":false}]}]
\`\`\``),
    [{
      title: "Ship",
      description: "Check it",
      due: "2026-09-01",
      checklist: [{ text: "Test", completed: false }],
    }],
  );
});
