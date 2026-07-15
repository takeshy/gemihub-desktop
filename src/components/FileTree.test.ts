import { assertEquals } from "jsr:@std/assert";
import { projectTreeNodes } from "./FileTree.tsx";
import type { FileTreeNode } from "../lib/wailsBackend.ts";

const node = (name: string, isDir = true): FileTreeNode => ({ name, path: name, isDir, size: 0, modTime: 0 });

Deno.test("ProjectTree contains only project-managed resource roots in stable order", () => {
  const result = projectTreeNodes([node("notes"), node("skills"), node("workflows"), node("Dashboards"), node("Memos"), node("Secrets"), node("loose.md", false)]);
  assertEquals(result.map((item) => item.name), ["Dashboards", "Secrets", "skills", "workflows"]);
});
