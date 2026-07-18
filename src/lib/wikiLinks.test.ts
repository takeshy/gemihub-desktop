import { assertEquals } from "jsr:@std/assert";
import { isLocalDocumentHref, localHrefToPathCandidates, pathDirName, wikiTargetToPath } from "./wikiLinks.ts";

Deno.test("wiki links remain relative for logical workspace files", () => {
  assertEquals(wikiTargetToPath("", "Note"), "Note.md");
  assertEquals(wikiTargetToPath("folder", "Note"), "folder/Note.md");
});

Deno.test("wiki links preserve workspace URI roots", () => {
  assertEquals(pathDirName("workspace://current.md"), "workspace://");
  assertEquals(pathDirName("workspace://folder/current.md"), "workspace://folder");
  assertEquals(pathDirName("project://current.md"), "project://");
  assertEquals(pathDirName("project://folder/current.md"), "project://folder");
  assertEquals(wikiTargetToPath("workspace://", "Note"), "workspace://Note.md");
  assertEquals(wikiTargetToPath("workspace://folder", "Note"), "workspace://folder/Note.md");
});

Deno.test("root-relative markdown links resolve from the workspace root", () => {
  assertEquals(localHrefToPathCandidates("task", "/task/cron-parent.md"), [
    "task/cron-parent.md",
    "task/task/cron-parent.md",
  ]);
  assertEquals(
    localHrefToPathCandidates("task", "http://wails.localhost/task/cron-parent.md")[0],
    "task/cron-parent.md",
  );
});

Deno.test("root-relative links in local documents search parent document roots", () => {
  assertEquals(
    localHrefToPathCandidates("/docs/sample-project/meetings", "/assets/screenshots/rooms.png").slice(0, 4),
    [
      "assets/screenshots/rooms.png",
      "/docs/sample-project/meetings/assets/screenshots/rooms.png",
      "/docs/sample-project/assets/screenshots/rooms.png",
      "/docs/assets/screenshots/rooms.png",
    ],
  );
});

Deno.test("links from a Windows absolute source stay local", () => {
  const base = "C:\\Users\\adac_t.m_Mws20382\\work\\lisa";
  assertEquals(localHrefToPathCandidates(base, "task/research-addition.md"), [
    "C:\\Users\\adac_t.m_Mws20382\\work\\lisa\\task/research-addition.md",
  ]);
  assertEquals(wikiTargetToPath(base, "research-addition"),
    "C:\\Users\\adac_t.m_Mws20382\\work\\lisa\\research-addition.md");
  assertEquals(isLocalDocumentHref("C:\\Users\\adac_t.m_Mws20382\\work\\lisa\\task.md"), true);
  assertEquals(isLocalDocumentHref("file:///C:/Users/adac_t.m_Mws20382/work/lisa/task.md"), true);
  assertEquals(localHrefToPathCandidates(base, "file:///C:/Users/adac_t.m_Mws20382/work/lisa/task.md"), [
    "C:/Users/adac_t.m_Mws20382/work/lisa/task.md",
  ]);
});
