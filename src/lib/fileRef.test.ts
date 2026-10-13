import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { assert, assertEquals } from "../testing/assert";
import { fileRef, isFileRef, sameFileRef } from "./fileRef";

test("FileRef keeps storage scope separate from its path", () => {
  assertEquals(fileRef("workspace", "Notes\\one.md"), {
    scope: "workspace",
    path: "Notes/one.md",
  });
  assert(
    !sameFileRef(
      fileRef("workspace", "Notes/one.md"),
      fileRef("files", "Notes/one.md"),
    ),
  );
  assert(isFileRef({ scope: "workspace", path: "Notes/one.md" }));
  assert(!isFileRef("workspace://Notes/one.md"));
});

test("absolute FileRef comparison follows filesystem path semantics", () => {
  assert(sameFileRef(
    fileRef("absolute", "C:\\Notes\\One.md"),
    fileRef("absolute", "c:/notes/one.md"),
    "windows",
  ));
  assert(
    !sameFileRef(
      fileRef("absolute", "/data/Notes/One.md"),
      fileRef("absolute", "/data/notes/one.md"),
      "posix",
    ),
  );
  assert(
    !sameFileRef(
      fileRef("absolute", "//data/Notes/One.md"),
      fileRef("absolute", "//data/notes/one.md"),
      "posix",
    ),
  );
  assert(sameFileRef(
    fileRef("absolute", "\\\\server\\Share\\One.md"),
    fileRef("absolute", "//SERVER/share/one.md"),
    "windows",
  ));
});

test("Workspace-only dashboard flows do not serialize scope into paths", async () => {
  for (
    const path of [
      "../dashboard/dashboardFile.ts",
      "../dashboard/KanbanCardModal.tsx",
      "../dashboard/BaseFileView.tsx",
      "../dashboard/CalendarDashboardWidget.tsx",
    ]
  ) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert(!source.includes("workspace://"), `${path} contains workspace URI`);
  }
});
