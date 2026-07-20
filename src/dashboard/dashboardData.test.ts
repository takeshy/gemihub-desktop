import { assertEquals } from "jsr:@std/assert";
import {
  basePropertyLabel,
  type DashboardDataRow,
  filterBaseRows,
  folderFromBaseFilters,
  formatBaseCellValue,
  loadDashboardRows,
  parseBaseDefinition,
  parseKanbanDefinition,
  searchBaseRows,
  sortBaseRows,
} from "./dashboardData.ts";

const row = (
  path: string,
  status: string,
  tags: string[] = [],
): DashboardDataRow => ({
  id: path,
  path,
  name: path.split("/").pop()!,
  mtime: 0,
  ctime: 0,
  content: "",
  frontmatter: { status },
  cells: { status, "file.path": path, "file.tags": tags },
});

Deno.test("workspace Kanban rows load from the selected folder", async () => {
  const target = globalThis as unknown as Record<string, unknown>;
  const original = target.go;
  const originalWindow = target.window;
  target.window = target;
  target.go = {
    main: {
      App: {
        ListWorkspaceDirectoryEntries: async (folder: string) => {
          assertEquals(folder, "projects/kanban_test");
          return [
            {
              path: "projects/kanban_test/Task 1.md",
              binary: false,
              modTime: 2000,
              createdTime: 1000,
              size: 10,
            },
            {
              path: "projects/kanban_test/Task 2.md",
              binary: false,
              modTime: 4000,
              createdTime: 3000,
              size: 10,
            },
          ];
        },
        ReadWorkspaceFile: async (path: string) => ({
          path,
          fileName: path.split("/").pop(),
          content: path.endsWith("Task 1.md")
            ? "---\nstatus: todo\ntitle: First\ntags: [kanban-test]\n---\nBody"
            : "---\nstatus: done\ntitle: Second\n---\nBody",
        }),
      },
    },
  };
  try {
    const rows = await loadDashboardRows("projects/kanban_test", "workspace");
    assertEquals(rows.length, 2);
    assertEquals(rows[0].frontmatter.status, "todo");
    assertEquals(rows[0].cells["file.tags"], ["kanban-test"]);
    assertEquals(rows[0].cells["file.content"], "Body");
    assertEquals(rows[0].cells["file.ctime"], 1000);
  } finally {
    target.go = original;
    if (originalWindow === undefined) delete target["window"];
    else target["window"] = originalWindow;
  }
});

Deno.test("base definitions parse views and filter DirectoryBase rows", () => {
  const base = parseBaseDefinition(
    `filters:\n  and:\n    - 'file.inFolder("Projects")'\nviews:\n  - type: table\n    name: Active\n    filters:\n      - 'status != "done"'\n    order: [file.name, status]\n`,
  )!;
  assertEquals(base.views[0].name, "Active");
  assertEquals(folderFromBaseFilters(base.filters), "Projects");
  const rows = [
    row("Projects/a.md", "todo"),
    row("Projects/b.md", "done"),
    row("Other/c.md", "todo"),
  ];
  assertEquals(
    filterBaseRows(filterBaseRows(rows, base.filters), base.views[0].filters)
      .map((item) => item.path),
    ["Projects/a.md"],
  );
});

Deno.test("kanban files preserve tolerant board definitions", () => {
  const parsed = parseKanbanDefinition(
    `version: 1\nfolder: Tasks\nstatusProperty: stage\ncolumns:\n  - { value: todo, label: To do }\nfuture: keep\n`,
  )!;
  assertEquals(parsed.folder, "Tasks");
  assertEquals(parsed.columns?.length, 1);
  assertEquals(parsed.future, "keep");
});

Deno.test("base rows support configured sorting, view search, and display names", () => {
  const rows = [
    {
      ...row("Projects/b.md", "todo"),
      name: "b",
      frontmatter: { status: "todo", priority: 2 },
      cells: { status: "todo", priority: 2, "file.name": "b" },
    },
    {
      ...row("Projects/a.md", "done"),
      name: "a",
      frontmatter: { status: "done", priority: 1 },
      cells: { status: "done", priority: 1, "file.name": "a" },
    },
  ];
  assertEquals(
    sortBaseRows(rows, [{ property: "note.priority", direction: "DESC" }]).map((
      item,
    ) => item.name),
    ["b", "a"],
  );
  assertEquals(searchBaseRows(rows, "done").map((item) => item.name), ["a"]);
  assertEquals(
    filterBaseRows(rows, [{ property: "priority", op: "gte", value: 2 }]).map((
      item,
    ) => item.name),
    ["b"],
  );
  assertEquals(
    basePropertyLabel({
      views: [],
      properties: { status: { displayName: "State" } },
    }, "status"),
    "State",
  );
  assertEquals(basePropertyLabel(null, "file.name"), "name");
  assertEquals(basePropertyLabel(null, "note.status"), "status");
  assertEquals(basePropertyLabel(null, "formula.total"), "total");
});

Deno.test("Base filesystem timestamps render as localized date and time", () => {
  const item = row("notes/example.md", "open");
  item.ctime = new Date(2024, 0, 15, 10, 30).getTime();
  item.mtime = new Date(2024, 1, 20, 12, 45).getTime();
  item.cells["file.ctime"] = new Date(2024, 0, 15, 10, 30).getTime();
  item.cells["file.mtime"] = new Date(2024, 1, 20, 12, 45).getTime();

  assertEquals(
    formatBaseCellValue(item, "file.ctime", "en-US"),
    "Jan 15, 10:30 AM",
  );
  assertEquals(
    formatBaseCellValue(item, "file.mtime", "en-US"),
    "Feb 20, 12:45 PM",
  );
  assertEquals(formatBaseCellValue(item, "ctime", "en-US"), "Jan 15, 10:30 AM");
});
