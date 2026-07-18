import { assertEquals } from "jsr:@std/assert";
import { isProtectedProjectRoot, scopedTreePath } from "../lib/fileTreePaths.ts";
import type { FileTreeNode } from "../lib/wailsBackend.ts";

const node = (name: string, isDir = true): FileTreeNode => ({ name, path: name, isDir, size: 0, modTime: 0 });

Deno.test("only managed workspace roots are protected", () => {
  assertEquals(isProtectedProjectRoot(node("skills"), 0), true);
  assertEquals(isProtectedProjectRoot(node("notes"), 0), false);
  assertEquals(isProtectedProjectRoot(node("loose.md", false), 0), false);
  assertEquals(isProtectedProjectRoot(node("skills"), 1), false);
});

Deno.test("workspace files retain their filesystem scope", () => {
  assertEquals(scopedTreePath("project", "readme.md"), "project://readme.md");
  assertEquals(scopedTreePath("project", "notes/readme.md"), "project://notes/readme.md");
  assertEquals(scopedTreePath("project", "Memos/today.md"), "Memos/today.md");
  assertEquals(scopedTreePath("files", "readme.md"), "workspace://readme.md");
});
