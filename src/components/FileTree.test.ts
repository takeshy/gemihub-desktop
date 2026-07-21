import { assertEquals } from "jsr:@std/assert";
import {
  absoluteFilesPath,
  isProtectedWorkspaceRoot,
  scopedTreeRef,
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
