import { assertEquals } from "jsr:@std/assert";
import { docKindFor } from "./documentKind.ts";
import { memoChatDraft } from "./memoChat.ts";

Deno.test("File widgets route .base files to the Base editor", () => {
  assertEquals(docKindFor("Dashboards/Bases/Projects.base"), "base");
  assertEquals(docKindFor("NOTES.BASE"), "base");
});

Deno.test("File widgets route .kanban files to the Kanban editor", () => {
  assertEquals(docKindFor("Dashboards/Kanbans/Tasks.kanban"), "kanban");
  assertEquals(docKindFor("BOARD.KANBAN"), "kanban");
});

Deno.test("File widgets route .canvas files to the visual Canvas editor", () => {
  assertEquals(docKindFor("Boards/Planning.canvas"), "canvas");
  assertEquals(docKindFor("MAP.CANVAS"), "canvas");
});

Deno.test("File widgets route YAML files to the visual Workflow editor", () => {
  assertEquals(docKindFor("workflow.yaml"), "workflow");
  assertEquals(docKindFor("workflows/daily-report.yml"), "workflow");
});

Deno.test("File widgets route office and archive files to external-app view", () => {
  assertEquals(docKindFor("report.xlsx"), "external");
  assertEquals(docKindFor("proposal.docx"), "external");
  assertEquals(docKindFor("assets.zip"), "external");
});

Deno.test("memo AI chat draft passes paths without file contents", () => {
  assertEquals(
    memoChatDraft("Memos/source.md", "Notes/source.md"),
    "Memo file:\nMemos/source.md\n\nSource file:\nNotes/source.md",
  );
});
