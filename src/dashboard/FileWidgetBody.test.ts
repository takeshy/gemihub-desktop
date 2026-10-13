import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import { docKindFor, isFileWidgetFileName } from "./documentKind.ts";
import { memoChatDraft, memoEntryChatDraft } from "./memoChat.ts";
import {
  fileChangeMatchesWidget,
  fileWidgetHydrationReady,
  fileWidgetViewerState,
  resetFileHydrationForDashboard,
  resolvedFileWidgetContent,
} from "./fileWidgetHydration.ts";

test("opening Markdown clears stale external-document state", () => {
  assertEquals(fileWidgetViewerState({ file: { scope: "workspace", path: "note.md" } }), {
    externalOnly: false,
    file: { scope: "workspace", path: "note.md" },
  });
  assertEquals(fileWidgetViewerState({ externalOnly: true }), {
    externalOnly: true,
  });
});

test("Markdown document kind is authoritative over stale viewer state", () => {
  assertEquals(docKindFor("メモ.md"), "markdown");
  assertEquals(docKindFor("report.docx"), "external");
});

test("restored file widgets wait for their backend path context", () => {
  assertEquals(fileWidgetHydrationReady("files", "", "Workspace"), false);
  assertEquals(fileWidgetHydrationReady(undefined, "", "Workspace"), false);
  assertEquals(fileWidgetHydrationReady("files", "/Files", ""), true);
  assertEquals(fileWidgetHydrationReady("workspace", "/Files", ""), false);
  assertEquals(
    fileWidgetHydrationReady("workspace", "", "/Workspace"),
    true,
  );
});

test("Chat file changes match the open file widget path", () => {
  assertEquals(
    fileChangeMatchesWidget(
      ["Notes/Current.md", "workspace://Notes/Current.md"],
      "Notes/Current.md",
    ),
    true,
  );
  assertEquals(
    fileChangeMatchesWidget(["Notes/Other.md"], "Notes/Current.md"),
    false,
  );
});

test("file-backed widgets do not show the local document while hydration is pending", () => {
  assertEquals(
    resolvedFileWidgetContent(undefined, "Books/example.epub", "# Default"),
    "",
  );
  assertEquals(
    resolvedFileWidgetContent(undefined, "", "# Default"),
    "# Default",
  );
});

test("switching dashboards clears file hydration state", () => {
  const hydrated = new Set(["widget-1:Books/example.epub"]);
  let previous = resetFileHydrationForDashboard(
    hydrated,
    "Dashboards/first.dashboard",
    "Dashboards/second.dashboard",
  );
  assertEquals(hydrated.size, 0);

  hydrated.add("widget-1:Books/example.epub");
  previous = resetFileHydrationForDashboard(
    hydrated,
    previous,
    "Dashboards/first.dashboard",
  );
  assertEquals(previous, "Dashboards/first.dashboard");
  assertEquals(hydrated.size, 0);
});

test("File widgets route .base files to the Base editor", () => {
  assertEquals(docKindFor("Dashboards/Bases/Projects.base"), "base");
  assertEquals(docKindFor("NOTES.BASE"), "base");
});

test("File widgets route .kanban files to the Kanban editor", () => {
  assertEquals(docKindFor("Dashboards/Kanbans/Tasks.kanban"), "kanban");
  assertEquals(docKindFor("BOARD.KANBAN"), "kanban");
});

test("File widgets route .canvas files to the visual Canvas editor", () => {
  assertEquals(docKindFor("Boards/Planning.canvas"), "canvas");
  assertEquals(docKindFor("MAP.CANVAS"), "canvas");
});

test("File widgets route YAML files to the visual Workflow editor", () => {
  assertEquals(docKindFor("workflow.yaml"), "workflow");
  assertEquals(docKindFor("workflows/daily-report.yml"), "workflow");
});

test("File widgets route office and archive files to external-app view", () => {
  assertEquals(docKindFor("report.xlsx"), "external");
  assertEquals(docKindFor("proposal.docx"), "external");
  assertEquals(docKindFor("assets.zip"), "external");
});

test("File widget picker includes all supported media, office, data, and workflow formats", () => {
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

test("memo AI chat draft passes paths without file contents", () => {
  assertEquals(
    memoChatDraft("Memos/source.md", "Notes/source.md"),
    "Memo file:\nMemos/source.md\n\nSource file:\nNotes/source.md",
  );
});

test("memo entry AI draft includes its unchanged body and quote context", () => {
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
