import { assertEquals } from "jsr:@std/assert";
import {
  fileTreeDecorationFor,
  registerFileTreeDecorationProvider,
  unregisterFileTreeDecorationProviders,
} from "./fileTreeExtensions.ts";

Deno.test("FileTree decorations resolve plugin state and unregister cleanly", async () => {
  unregisterFileTreeDecorationProviders();
  const dispose = registerFileTreeDecorationProvider(
    "sync",
    ({ path }) =>
      path === "notes/changed.md"
        ? { color: "#eab308", title: "Modified" }
        : null,
  );

  assertEquals(
    await fileTreeDecorationFor({
      scope: "workspace",
      path: "notes/changed.md",
      isDirectory: false,
    }),
    { color: "#eab308", title: "Modified" },
  );
  assertEquals(
    await fileTreeDecorationFor({
      scope: "workspace",
      path: "notes/clean.md",
      isDirectory: false,
    }),
    null,
  );

  dispose();
  assertEquals(
    await fileTreeDecorationFor({
      scope: "workspace",
      path: "notes/changed.md",
      isDirectory: false,
    }),
    null,
  );
});
