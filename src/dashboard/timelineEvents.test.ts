import { assertEquals } from "jsr:@std/assert";
import {
  loadTimelineCalendarPosts,
  memoTimelineBody,
  parseTimelineCalendarPosts,
  sanitizeTimelineName,
  timelineFolder,
} from "./timelineEvents";

Deno.test("Calendar loads Timeline data without scanning DirectoryBase", async () => {
  const runtime = globalThis as unknown as {
    window?: { go?: { main: { App: Record<string, unknown> } } };
  };
  const previousWindow = runtime.window;
  runtime.window = {
    go: {
      main: {
        App: {
          FileInventory: () => {
            throw new Error("DirectoryBase must not be scanned");
          },
          ListWorkspaceFiles: () =>
            Promise.resolve([{
              path: "Dashboards/Timeline/Timeline/2026-07-20.md",
              name: "2026-07-20.md",
              size: 1,
              modTime: 1,
            }]),
          ReadWorkspaceFile: () =>
            Promise.resolve({
              path: "Dashboards/Timeline/Timeline/2026-07-20.md",
              fileName: "2026-07-20.md",
              content:
                "2026-07-20T01:02:03.000Z\nid: isolated\n\nWorkspace only\n",
            }),
        },
      },
    },
  };
  try {
    const posts = await loadTimelineCalendarPosts("Timeline");
    assertEquals(posts.map((post) => post.id), ["isolated"]);
  } finally {
    runtime.window = previousWindow;
  }
});

Deno.test("timeline calendar posts parse shared timeline and event markers", () => {
  const content = `<!-- timeline-post: 2026-07-18T01:02:03.000Z -->
2026-07-18T01:02:03.000Z
id: calendar-event-one
pinned: false

<!-- calendar-event: 2026-07-20 -->
> [!calendar] Calendar event · 2026-07-20 10:00
> Demo

---

2026-07-18T02:03:04.000Z
id: kanban-history

> [!info] Kanban · Tasks
> [[Tasks/Ship.md|Ship]]
> \`Doing\` → \`Done\`
`;
  const posts = parseTimelineCalendarPosts(
    "Dashboards/Timeline/Work/2026-07-18.md",
    content,
  );
  assertEquals(posts.length, 2);
  assertEquals({
    id: posts[0].id,
    isEvent: posts[0].isEvent,
    eventDate: posts[0].eventDate,
    eventTime: posts[0].eventTime,
    eventContent: posts[0].eventContent,
  }, {
    id: "calendar-event-one",
    isEvent: true,
    eventDate: "2026-07-20",
    eventTime: "10:00",
    eventContent: "Demo",
  });
  assertEquals({ id: posts[1].id, isEvent: posts[1].isEvent }, {
    id: "kanban-history",
    isEvent: false,
  });
});

Deno.test("timeline names use the shared portable folder convention", () => {
  assertEquals(sanitizeTimelineName(" Team / Launch.md "), "Team-Launch");
  assertEquals(sanitizeTimelineName(""), "Timeline");
  assertEquals(
    timelineFolder(" Team / Launch.md "),
    "Dashboards/Timeline/Team-Launch",
  );
  assertEquals(timelineFolder(""), "Dashboards/Timeline/Timeline");
});

Deno.test("memo Timeline history retains its source, quote, and body", () => {
  assertEquals(
    memoTimelineBody(
      "files://Research/Paper.pdf",
      "Paper.pdf",
      "first line\nsecond line",
      "My note",
    ),
    `> [!quote] Memo · Paper.pdf\n> [[Research/Paper.pdf|Paper.pdf]]\n> first line\n> second line\n\nMy note`,
  );
  assertEquals(
    memoTimelineBody("Notes/Idea.md", "Idea.md", "", ""),
    `> [!quote] Memo · Idea.md\n> [[Notes/Idea.md|Idea.md]]`,
  );
});
