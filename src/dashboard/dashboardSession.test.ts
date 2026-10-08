import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import {
  carrySingleFile,
  dashboardSessionKeys,
  initialDashboardSession,
  singleDashboard,
} from "./dashboardSession.ts";
import { type DashboardWidget, defaultDashboard } from "./types.ts";
import { parseDashboard, serializeDashboard } from "./dashboardFile.ts";

const fileWidget = (id: string): DashboardWidget => ({
  id,
  type: "file",
  title: "File",
  layout: { x: 0, y: 0, w: 12, h: 6 },
  config: {
    file: { scope: "files", path: "example.md" },
    content: "unsaved edit",
    mode: "wysiwyg",
  },
});

Deno.test("single session survives serialization with its file and keeps only one widget", () => {
  const data = {
    ...defaultDashboard(),
    widgets: [fileWidget("file"), fileWidget("other")],
  };
  const restored = parseDashboard(serializeDashboard(singleDashboard(data)))!;
  assertEquals(restored.widgets.length, 1);
  assertEquals(restored.widgets[0].config, data.widgets[0].config);
  assertEquals(data.widgets.length, 2);
});

Deno.test("moving a single file preserves existing widgets and avoids duplicate IDs", () => {
  const target = { ...defaultDashboard(), widgets: [fileWidget("file")] };
  const single = singleDashboard({
    ...defaultDashboard(),
    widgets: [fileWidget("file")],
  });
  const moved = carrySingleFile(target, single);
  assertEquals(moved.widgets[0], target.widgets[0]);
  assertNotEquals(moved.widgets[1].id, "file");
  assertEquals(moved.widgets[1].config, single.widgets[0].config);
  assertEquals(moved.widgets[1].layout.y, 6);
  moved.widgets[1].config.content = "changed";
  assertEquals(single.widgets[0].config.content, "unsaved edit");
  assertEquals(target.widgets.length, 1);
});

Deno.test("new dashboard receives the open single file", () => {
  const single = singleDashboard({
    ...defaultDashboard(),
    widgets: [fileWidget("file")],
  });
  const created = carrySingleFile(defaultDashboard(), single);
  assertEquals(created.widgets.length, 1);
  assertEquals(created.widgets[0].config.file, single.widgets[0].config.file);
  assertEquals(created.widgets[0].layout.y, 0);
});

Deno.test("single sessions are scoped per workspace including launches without a workspace", () => {
  assertNotEquals(
    dashboardSessionKeys("first").single,
    dashboardSessionKeys("second").single,
  );
  assertEquals(
    dashboardSessionKeys("").last,
    "gemihub-desktop:last-dashboard:local",
  );
  assertEquals(
    dashboardSessionKeys("first").last,
    "gemihub-desktop:last-dashboard:first",
  );
});

Deno.test("associated launch starts fresh even when a regular or single dashboard was saved", () => {
  for (const last of ["Dashboards/research.dashboard", "single", null]) {
    assertEquals(initialDashboardSession(["/notes/new.md"], last, false), {
      associatedLaunch: true,
      restoreSingle: false,
    });
  }
});

Deno.test("ordinary launch restores the previous single or regular dashboard", () => {
  assertEquals(initialDashboardSession([], "single", false), {
    associatedLaunch: false,
    restoreSingle: true,
  });
  assertEquals(
    initialDashboardSession([], "Dashboards/research.dashboard", false),
    {
      associatedLaunch: false,
      restoreSingle: false,
    },
  );
});

Deno.test("workspace changes do not replay the associated launch", () => {
  assertEquals(
    initialDashboardSession(
      ["/notes/new.md"],
      "Dashboards/other.dashboard",
      true,
    ),
    {
      associatedLaunch: false,
      restoreSingle: false,
    },
  );
});
