import { assertEquals } from "jsr:@std/assert";
import {
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
