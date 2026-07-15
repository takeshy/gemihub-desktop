import { assertEquals } from "jsr:@std/assert";
import { queryBaseFiles } from "./baseEngine.ts";

Deno.test("ported Base engine evaluates formulas, filters, and sort", () => {
  const queried = queryBaseFiles(
    `
version: 1
formulas:
  score: priority * 10
views:
  - type: table
    name: Active
    filters:
      and:
        - file.inFolder("Projects")
        - status != "done"
    order: [file.name, status, formula.score]
    sort:
      - property: formula.score
        direction: DESC
`,
    "Active",
    [
      {
        id: "a",
        name: "Projects/A.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-01-01T00:00:00Z",
        content: "---\nstatus: doing\npriority: 2\n---\n",
      },
      {
        id: "b",
        name: "Projects/B.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-01-01T00:00:00Z",
        content: "---\nstatus: todo\npriority: 3\n---\n",
      },
      {
        id: "c",
        name: "Projects/C.md",
        mimeType: "text/markdown",
        modifiedTime: "2026-01-01T00:00:00Z",
        content: "---\nstatus: done\npriority: 9\n---\n",
      },
    ],
  );

  assertEquals(queried.rows.map((row) => row.path), [
    "Projects/B.md",
    "Projects/A.md",
  ]);
  assertEquals(queried.rows.map((row) => row.cells["formula.score"]), [30, 20]);
});
