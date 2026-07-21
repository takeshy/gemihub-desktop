import { assertEquals } from "jsr:@std/assert";
import { docKindFor, isFileWidgetFileName } from "./documentKind.ts";
import { memoChatDraft, memoEntryChatDraft } from "./memoChat.ts";

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

Deno.test("File widget picker includes all supported media, office, data, and workflow formats", () => {
  for (
    const path of [
      "clip.mp4",
      "audio.flac",
      "report.xlsx",
      "slides.pptx",
      "data.json",
      "workflow.yaml",
      "page.htm",
    ]
  ) {
    assertEquals(isFileWidgetFileName(path), true, path);
  }
  assertEquals(isFileWidgetFileName("program.exe"), false);
});

Deno.test("memo AI chat draft passes paths without file contents", () => {
  assertEquals(
    memoChatDraft("Memos/source.md", "Notes/source.md"),
    "Memo file:\nMemos/source.md\n\nSource file:\nNotes/source.md",
  );
});

Deno.test("memo entry AI draft includes its unchanged body and quote context", () => {
  assertEquals(
    memoEntryChatDraft("Notes/source.md", {
      id: "entry-1",
      createdAt: "2026-07-21T12:00:00.000Z",
      pinned: false,
      anchor: "page=2",
      quotePrefix: "before text",
      quoteSuffix: "after text",
      quote: "quoted line",
      body: "First line\n\n- unchanged body",
      raw: "",
      index: 0,
      parsed: true,
    }),
    `Source file:
Notes/source.md

Quote information:
Anchor: page=2
Before: before text
Quote:
quoted line
After: after text

Memo content:
First line

- unchanged body`,
  );
});
