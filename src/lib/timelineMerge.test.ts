import test from "node:test";
import assert from "node:assert/strict";
import { parseTimeline, timelineBlock } from "./timelineFormat.ts";
import { mergeTimelineEntry } from "./timelineMerge.ts";
import { buildEntryBlock } from "./memoTimeline.ts";

const entry = (content: string, deleted = false) => parseTimeline(buildEntryBlock({
  id: "post", createdAt: "2026-10-12T00:00:00.000Z", body: content,
  metadata: { speaker: "user", ...(deleted ? { deleted: "true" } : {}), "kakeratta-revision": "rev" },
}), "day.md")[0];
const base = { content: "original", deleted: false };

test("local-only edit uploads and remote-only edit is adopted", () => {
  const local = mergeTimelineEntry(entry("local"), entry("original"), base, "conflict");
  assert.equal(local.entry.content, "local");
  assert.equal(local.upload, true);
  assert.equal(local.conflict, undefined);
  const remote = mergeTimelineEntry(entry("original"), entry("remote"), base, "conflict");
  assert.equal(remote.entry.content, "remote");
  assert.equal(remote.upload, false);
});

test("concurrent edits preserve both versions as a single deterministically identified reply", () => {
  const ours = entry("local");
  ours.pinned = true;
  const merged = mergeTimelineEntry(ours, entry("remote"), base, "conflict");
  assert.equal(merged.entry.content, "remote");
  assert.equal(merged.entry.pinned, true);
  assert.equal(merged.conflict?.content, "local");
  assert.equal(merged.conflict?.replyTo, "post");
  assert.equal(merged.conflict?.metadata["local-only"], "true");
  assert.equal(merged.conflict?.metadata["kakeratta-revision"], undefined);
  assert.deepEqual(merged, mergeTimelineEntry(ours, entry("remote"), base, "conflict"));
});

test("remote deletion preserves a concurrent local edit as an independent root", () => {
  const merged = mergeTimelineEntry(entry("local"), entry("original", true), base, "conflict");
  assert.equal(merged.entry.deleted, true);
  assert.equal(merged.conflict?.deleted, false);
  assert.equal(merged.conflict?.rootId, "conflict");
  assert.equal(merged.conflict?.replyTo, "");
});

test("local deletion does not remove a concurrent remote edit", () => {
  const merged = mergeTimelineEntry(entry("original", true), entry("remote"), base, "conflict");
  assert.equal(merged.entry.content, "remote");
  assert.equal(merged.entry.deleted, false);
  assert.equal(merged.upload, false);
  assert.equal(merged.conflict?.metadata["conflict-operation"], "delete");
  assert.equal(merged.conflict?.metadata["local-only"], "true");
  assert.equal(merged.conflict?.content, "original");
  assert.equal(parseTimeline(timelineBlock(merged.entry), "day.md")[0].deleted, false);
});

test("matching bodies reconcile a lost upload acknowledgment without sending again", () => {
  const merged = mergeTimelineEntry(entry("same"), entry("same"), base, "conflict");
  assert.equal(merged.upload, false);
  assert.equal(merged.conflict, undefined);
});

test("unknown ancestry and mismatching IDs cannot silently overwrite remote data", () => {
  const merged = mergeTimelineEntry(entry("ours"), entry("theirs"), null, "conflict");
  assert.equal(merged.conflict?.content, "ours");
  assert.equal(merged.upload, false);
  assert.throws(() => mergeTimelineEntry(entry("ours"), { ...entry("theirs"), id: "other" }, base, "conflict"));
});
