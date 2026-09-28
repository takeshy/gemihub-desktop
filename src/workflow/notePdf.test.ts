import { assertEquals } from "jsr:@std/assert";
import type { ChatSettings } from "../llm/settings.ts";
import { executeWorkflow } from "./executor.ts";
import { parseWorkflowFile } from "./parser.ts";

type PdfCall = [string, number, number, string];

async function runWithPdfBackend(yaml: string) {
  const calls: PdfCall[] = [];
  const runtime = globalThis as unknown as {
    window?: { go?: { main: { App: Record<string, unknown> } } };
  };
  const previousWindow = runtime.window;
  runtime.window = {
    go: {
      main: {
        App: {
          CountWorkflowPDFPages: (path: string) => {
            calls.push([path, 0, 0, "count"]);
            return Promise.resolve(10);
          },
          ReadWorkflowPDFPages: (
            path: string,
            startPage: number,
            endPage: number,
            format: string,
          ) => {
            calls.push([path, startPage, endPage, format]);
            const from = startPage || 1, to = Math.min(endPage || 10, 10);
            return Promise.resolve(
              format === "pdf"
                ? {
                  fileName: `book (pages ${from}-${to}).pdf`,
                  totalPages: 10,
                  startPage: from,
                  endPage: to,
                  data: "JVBERi0=",
                }
                : {
                  fileName: "book.pdf",
                  totalPages: 10,
                  startPage: from,
                  endPage: to,
                  text: `[Page ${from}]\nbody`,
                },
            );
          },
        },
      },
    },
  };
  try {
    const run = await executeWorkflow(
      parseWorkflowFile(yaml, "workflows/pdf.workflow.yaml"),
      "workflows/pdf.workflow.yaml",
      { chatSettings: {} as ChatSettings, interactionMode: "headless" },
    );
    return { run, calls };
  } finally {
    runtime.window = previousWindow;
  }
}

Deno.test("note-read reads a PDF page range as text without adding .md", async () => {
  const { run, calls } = await runWithPdfBackend(`name: pdf
nodes:
  - id: start
    type: set
    name: page
    value: 3
    next: read
  - id: read
    type: note-read
    path: docs/book.pdf
    startPage: "{{page}}"
    endPage: 12
    saveTo: text
    savePageCountTo: total
    saveEndPageTo: lastPage
`);
  assertEquals(run.status, "completed");
  assertEquals(calls, [["docs/book.pdf", 3, 12, "text"]]);
  assertEquals(run.variables.text, "[Page 3]\nbody");
  assertEquals(run.variables.total, 10);
  assertEquals(run.variables.lastPage, 10);
});

Deno.test("note-read format pdf returns FileExplorerData for attachments", async () => {
  const { run, calls } = await runWithPdfBackend(`name: pdf
nodes:
  - id: read
    type: note-read
    path: book.PDF
    startPage: 2
    endPage: 4
    format: pdf
    saveTo: excerpt
`);
  assertEquals(run.status, "completed");
  assertEquals(calls, [["book.PDF", 2, 4, "pdf"]]);
  assertEquals(JSON.parse(String(run.variables.excerpt)), {
    path: "book.PDF",
    basename: "book (pages 2-4).pdf",
    name: "book (pages 2-4)",
    extension: "pdf",
    mimeType: "application/pdf",
    contentType: "binary",
    data: "JVBERi0=",
  });
  const output = run.logs.find((log) => log.nodeId === "read" && log.output)
    ?.output as Record<string, unknown> | undefined;
  assertEquals(output?.data, undefined);
});

Deno.test("note-read with only savePageCountTo counts pages without reading", async () => {
  const { run, calls } = await runWithPdfBackend(`name: pdf
nodes:
  - id: count
    type: note-read
    path: book.pdf
    savePageCountTo: total
`);
  assertEquals(run.status, "completed");
  assertEquals(calls, [["book.pdf", 0, 0, "count"]]);
  assertEquals(run.variables.total, 10);
});

Deno.test("note-read rejects a page that is not a positive integer", async () => {
  const { run, calls } = await runWithPdfBackend(`name: pdf
nodes:
  - id: read
    type: note-read
    path: book.pdf
    startPage: "1.5"
    saveTo: text
`);
  assertEquals(run.status, "error");
  assertEquals(calls, []);
});
