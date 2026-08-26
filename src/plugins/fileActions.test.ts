import { assertEquals } from "jsr:@std/assert";
import {
  fileTreeContextMenuItemsFor,
  fileViewerActionsFor,
  registerFileTreeContextMenuItem,
  registerFileViewerAction,
  unregisterPluginFileActions,
} from "./fileActions.ts";

const markdown = {
  scope: "workspace" as const,
  path: "notes/example.md",
  name: "example.md",
  isDirectory: false,
};

Deno.test("plugin file actions filter targets and unregister by plugin", () => {
  unregisterPluginFileActions();
  registerFileTreeContextMenuItem("drive", {
    id: "compare",
    label: "Compare with Drive",
    when: (target) => !target.isDirectory && target.name.endsWith(".md"),
    onClick: () => undefined,
  });
  registerFileViewerAction("drive", {
    id: "compare",
    label: "Compare with Drive",
    onClick: () => undefined,
  });

  assertEquals(
    fileTreeContextMenuItemsFor(markdown).map((item) => item.label),
    [
      "Compare with Drive",
    ],
  );
  assertEquals(
    fileTreeContextMenuItemsFor({
      ...markdown,
      isDirectory: true,
    }),
    [],
  );
  assertEquals(fileViewerActionsFor(markdown).length, 1);

  unregisterPluginFileActions("drive");
  assertEquals(fileTreeContextMenuItemsFor(markdown), []);
  assertEquals(fileViewerActionsFor(markdown), []);
});

Deno.test("an old disposer does not remove a replacement action", () => {
  unregisterPluginFileActions();
  const removeOld = registerFileViewerAction("drive", {
    id: "compare",
    label: "Old action",
    onClick: () => undefined,
  });
  registerFileViewerAction("drive", {
    id: "compare",
    label: "Replacement action",
    onClick: () => undefined,
  });

  removeOld();

  assertEquals(fileViewerActionsFor(markdown).map((item) => item.label), [
    "Replacement action",
  ]);
  unregisterPluginFileActions();
});
