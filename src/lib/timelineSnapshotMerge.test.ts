import { test } from "vitest";
import assert from "node:assert/strict";
import { mergeTimelineSnapshots } from "./timelineSnapshotMerge.ts";
import { parseTimeline } from "./timelineFormat.ts";
import { buildEntryBlock } from "./memoTimeline.ts";
const post = (id: string, body: string) => parseTimeline(buildEntryBlock({ id, body, createdAt: "2026-10-12T00:00:00.000Z" }), "day.md")[0];

test("an edit and a new post arriving during sync both survive the response", async () => {
  const merged = await mergeTimelineSnapshots([post("first", "edited while waiting"), post("second", "new while waiting")], [post("first", "original")], [post("first", "original")], "connection");
  assert.deepEqual(merged.map(entry => entry.content), ["edited while waiting", "new while waiting"]);
});

test("concurrent local and Kakeratta edits preserve the remote main and local archive", async () => {
  const merged = await mergeTimelineSnapshots([post("first", "local edit")], [post("first", "remote edit")], [post("first", "original")], "connection");
  assert.equal(merged[0].content, "remote edit");
  assert.equal(merged[1].content, "local edit");
  assert.equal(merged[1].metadata["local-only"], "true");
});

test("edits and deletions during first upload retain the acknowledged remote identity", async () => {
  const original = post("first", "original");
  const acknowledged = {
    ...original,
    metadata: {
      "kakeratta-id": "remote-first",
      "kakeratta-base": JSON.stringify({ content: "original", deleted: false }),
      "kakeratta-delete-revision": "delete-r1",
    },
  };
  for (const current of [
    { ...original, content: "edited while waiting" },
    { ...original, deleted: true, metadata: { deleted: "true" } },
  ]) {
    const [merged] = await mergeTimelineSnapshots([current], [acknowledged], [original], "connection");
    assert.equal(merged.content, current.content);
    assert.equal(merged.deleted, current.deleted);
    assert.equal(merged.metadata["kakeratta-id"], "remote-first");
    assert.equal(merged.metadata["kakeratta-base"], acknowledged.metadata["kakeratta-base"]);
    assert.equal(merged.metadata["kakeratta-delete-revision"], "delete-r1");
  }
});
