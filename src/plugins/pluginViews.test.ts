import { assertEquals } from "jsr:@std/assert";
import { normalizeDesktopPluginView, pluginViewForPath } from "./pluginViews.ts";
import type { PluginView } from "./types.ts";

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
  assertEquals(pluginViewForPath(views, "project/SONG.MID")?.id, "audio:main");
  assertEquals(pluginViewForPath(views, "project/song.audioscore")?.id, "audio:main");
  assertEquals(pluginViewForPath(views, "project/readme.md"), undefined);
});
