import { readdir, readFile } from "node:fs/promises";
import { test } from "vitest";
import { assertEquals } from "../testing/assert";

async function sourceFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(path);
  }
  return result;
}

test("scoped backend path syntax stays inside the FileRef boundary", async () => {
  const violations: string[] = [];
  for (const path of await sourceFiles("src")) {
    if (path.endsWith("/fileRef.ts") || path.includes(".test.")) {
      continue;
    }
    const source = await readFile(path, "utf8");
    if (
      /(?:workspace|files):(?:\/\/|\\\/\\\/)/.test(source)
    ) violations.push(path);
  }
  assertEquals(violations, []);
});

test("removed path compatibility fields cannot return", async () => {
  const violations: string[] = [];
  for (const path of await sourceFiles("src")) {
    if (path.includes(".test.")) continue;
    const source = await readFile(path, "utf8");
    if (/\b(?:fileScope|workspaceOnly)\b/.test(source)) violations.push(path);
  }
  assertEquals(violations, []);
});
