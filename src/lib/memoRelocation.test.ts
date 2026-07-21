import { assertEquals } from "jsr:@std/assert";
import { relocatedMemoSource, replaceMemoSource } from "./memoRelocation.ts";

Deno.test("memo source follows file and directory moves", () => {
  assertEquals(
    relocatedMemoSource("Notes/today.md", [{
      sourcePaths: ["Notes/today.md"],
      destinationPath: "Archive/today.md",
      isDirectory: false,
    }]),
    "Archive/today.md",
  );
  assertEquals(
    relocatedMemoSource("Notes/project/today.md", [{
      sourcePaths: ["Notes/project"],
      destinationPath: "Archive/project",
      isDirectory: true,
    }]),
    "Archive/project/today.md",
  );
});

Deno.test("memo frontmatter source changes without rewriting entries", () => {
  const content = "---\nsource: Notes/today.md\nkind: memo\n---\n\nbody\n";
  assertEquals(
    replaceMemoSource(content, "Archive/today.md"),
    "---\nsource: Archive/today.md\nkind: memo\n---\n\nbody\n",
  );
});
