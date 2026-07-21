import { assertEquals } from "jsr:@std/assert";
import {
  absoluteFilesPath,
  canMoveWorkspacePath,
  filesystemParentPath,
  focusedExternalTree,
  isProtectedWorkspaceRoot,
  scopedTreeRef,
  workspaceMoveTarget,
} from "../lib/fileTreePaths.ts";
import type { FileTreeNode } from "../lib/wailsBackend.ts";

const node = (name: string, isDir = true): FileTreeNode => ({
  name,
  path: name,
  isDir,
  size: 0,
  modTime: 0,
});

Deno.test("outside Workspace drag paths are pinned to their absolute Files path", () => {
  assertEquals(
    absoluteFilesPath("C:\\Users\\takes\\Documents", "projects/Research"),
    "C:\\Users\\takes\\Documents/projects/Research",
  );
  assertEquals(
    absoluteFilesPath("C:\\Users\\takes\\Documents\\", "."),
    "C:\\Users\\takes\\Documents",
  );
});

Deno.test("outside Workspace can reveal one selected file and climb its parents", () => {
  const files = [node("one.md", false), node("two.md", false)];
  assertEquals(
    focusedExternalTree(
      files,
      "C:\\Users\\me\\docs",
      "C:\\Users\\me\\docs\\two.md",
    ),
    [files[1]],
  );
  assertEquals(
    filesystemParentPath("C:\\Users\\me\\docs\\two.md"),
    "C:\\Users\\me\\docs",
  );
  assertEquals(filesystemParentPath("C:\\Users\\me\\docs"), "C:\\Users\\me");
  assertEquals(filesystemParentPath("/Users/me/docs"), "/Users/me");
  assertEquals(filesystemParentPath("/"), "");
});

Deno.test("only managed workspace roots are protected", () => {
  assertEquals(isProtectedWorkspaceRoot(node("skills"), 0), true);
  assertEquals(isProtectedWorkspaceRoot(node("notes"), 0), false);
  assertEquals(isProtectedWorkspaceRoot(node("loose.md", false), 0), false);
  assertEquals(isProtectedWorkspaceRoot(node("skills"), 1), false);
});

Deno.test("workspace files retain their filesystem scope", () => {
  assertEquals(
    scopedTreeRef("workspace", "readme.md"),
    { scope: "workspace", path: "readme.md" },
  );
  assertEquals(
    scopedTreeRef("workspace", "notes/readme.md"),
    { scope: "workspace", path: "notes/readme.md" },
  );
  assertEquals(
    scopedTreeRef("workspace", "Memos/today.md"),
    { scope: "workspace", path: "Memos/today.md" },
  );
  assertEquals(scopedTreeRef("files", "readme.md"), {
    scope: "files",
    path: "readme.md",
  });
});

Deno.test("workspace drag targets preserve the item name", () => {
  assertEquals(
    workspaceMoveTarget("notes/today.md", "archive"),
    "archive/today.md",
  );
  assertEquals(workspaceMoveTarget("notes/today.md", ""), "today.md");
});

Deno.test("workspace drag rejects no-op and recursive directory moves", () => {
  assertEquals(canMoveWorkspacePath("notes/today.md", false, "archive"), true);
  assertEquals(canMoveWorkspacePath("notes/today.md", false, "notes"), false);
  assertEquals(canMoveWorkspacePath("notes", true, "notes/old"), false);
  assertEquals(canMoveWorkspacePath("notes", true, "notes"), false);
  assertEquals(canMoveWorkspacePath("notes", true, ""), false);
});
