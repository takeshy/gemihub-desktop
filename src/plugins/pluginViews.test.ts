import { assertEquals } from "jsr:@std/assert";
import {
  normalizeDesktopPluginView,
  pluginViewForPath,
  readPluginViewFile,
} from "./pluginViews.ts";
import type { PluginAPI, PluginView } from "./types.ts";

const component = () => null;

Deno.test("legacy extension sidebar views become Dashboard main views", () => {
  const legacy: PluginView = { id: "accounting:main", pluginId: "accounting", name: "Accounting", location: "sidebar", extensions: [".bean"], component };
  assertEquals(normalizeDesktopPluginView(legacy).location, "main");
  const sidebar: PluginView = { id: "accounting:panel", pluginId: "accounting", name: "Accounting", location: "sidebar", component };
  assertEquals(normalizeDesktopPluginView(sidebar).location, "sidebar");
});

Deno.test("plugin main views match registered file extensions", () => {
  const views: PluginView[] = [
    { id: "audio:panel", pluginId: "audio", name: "Audio", location: "sidebar", component },
    { id: "audio:main", pluginId: "audio", name: "Audio", location: "main", extensions: [".audioscore", ".mid", "midi"], component },
  ];
  assertEquals(pluginViewForPath(views, "workspace/SONG.MID")?.id, "audio:main");
  assertEquals(pluginViewForPath(views, "workspace/song.audioscore")?.id, "audio:main");
  assertEquals(pluginViewForPath(views, "workspace/readme.md"), undefined);
});

Deno.test("plugin file reads preserve scope while passing relative paths", async () => {
  const calls: string[] = [];
  const api = {
    workspaceFiles: {
      read: async (path: string) => {
        calls.push(`workspace:${path}`);
        return "workspace";
      },
    },
    files: {
      read: async (path: string) => {
        calls.push(`files:${path}`);
        return "files";
      },
    },
  } as unknown as PluginAPI;
  assertEquals(
    await readPluginViewFile(api, {
      scope: "workspace",
      path: "projects/task.bean",
    }),
    "workspace",
  );
  assertEquals(
    await readPluginViewFile(api, {
      scope: "files",
      path: "imports/task.bean",
    }),
    "files",
  );
  assertEquals(calls, [
    "workspace:projects/task.bean",
    "files:imports/task.bean",
  ]);
});
