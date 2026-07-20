import { assertEquals } from "jsr:@std/assert";

async function sourceFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory) result.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(path);
  }
  return result;
}

Deno.test("scoped backend path syntax stays inside the FileRef boundary", async () => {
  const violations: string[] = [];
  for (const path of await sourceFiles("src")) {
    if (path.endsWith("/fileRef.ts") || path.includes(".test.")) {
      continue;
    }
    const source = await Deno.readTextFile(path);
    if (
      /(?:workspace|files):(?:\/\/|\\\/\\\/)/.test(source)
    ) violations.push(path);
  }
  assertEquals(violations, []);
});

Deno.test("removed path compatibility fields cannot return", async () => {
  const violations: string[] = [];
  for (const path of await sourceFiles("src")) {
    if (path.includes(".test.")) continue;
    const source = await Deno.readTextFile(path);
    if (/\b(?:fileScope|workspaceOnly)\b/.test(source)) violations.push(path);
  }
  assertEquals(violations, []);
});
