import assert from "node:assert/strict";
import { test } from "vitest";
import { withTimelineFileLock } from "./timelineLocalLock.ts";

test("sync waits for an in-progress post before reading its local snapshot", async () => {
  let content = "original";
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const edit = withTimelineFileLock("day.md", async () => { const old = content; await blocked; content = `${old}\nnew post`; });
  const sync = withTimelineFileLock("day.md", async () => { content += "\nremote reply"; });
  release();
  await Promise.all([edit, sync]);
  assert.equal(content, "original\nnew post\nremote reply");
});

test("a failed local operation does not block the next edit or another day", async () => {
  await assert.rejects(withTimelineFileLock("failed.md", async () => { throw new Error("failed"); }));
  assert.equal(await withTimelineFileLock("failed.md", async () => "recovered"), "recovered");
});
