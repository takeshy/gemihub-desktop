import { assertEquals } from "jsr:@std/assert";
import {
  isProtectedWorkspaceRoot,
  scopedTreePath,
} from "../lib/fileTreePaths.ts";
import type { FileTreeNode } from "../lib/wailsBackend.ts";

const node = (name: string, isDir = true): FileTreeNode => ({
  name,
  path: name,
  isDir,
  size: 0,
  modTime: 0,
});

Deno.test("only managed workspace roots are protected", () => {
  assertEquals(isProtectedWorkspaceRoot(node("skills"), 0), true);
  assertEquals(isProtectedWorkspaceRoot(node("notes"), 0), false);
  assertEquals(isProtectedWorkspaceRoot(node("loose.md", false), 0), false);
  assertEquals(isProtectedWorkspaceRoot(node("skills"), 1), false);
});

Deno.test("workspace files retain their filesystem scope", () => {
  assertEquals(
    scopedTreePath("workspace", "readme.md"),
    "workspace://readme.md",
  );
  assertEquals(
    scopedTreePath("workspace", "notes/readme.md"),
    "workspace://notes/readme.md",
  );
  assertEquals(
    scopedTreePath("workspace", "Memos/today.md"),
    "workspace://Memos/today.md",
  );
  assertEquals(scopedTreePath("files", "readme.md"), "files://readme.md");
});
