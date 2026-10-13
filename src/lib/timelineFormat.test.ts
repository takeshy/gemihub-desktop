import assert from "node:assert/strict";
import { test } from "vitest";
import { buildEntryBlock } from "./memoTimeline.ts";
import { parseTimeline, changeTimelineEntry, timelineThreads } from "./timelineFormat.ts";

const at = "2026-10-12T10:00:00.000Z";
const block = (id: string, metadata: Record<string, string> = {}, body = "text") => buildEntryBlock({ id, createdAt: at, metadata, body });

test("thread, author, and sync metadata survive editing and pinning", () => {
  const source = block("reply", { "root-id": "root", "reply-to": "parent", "author-name": "担当A", speaker: "persona-a", "kakeratta-revision": "abc" });
  const edited = changeTimelineEntry(source, "day.md", "reply", entry => ({ ...entry, content: "edited", pinned: true }))!;
  const [entry] = parseTimeline(edited, "day.md");
  assert.equal(entry.content, "edited");
  assert.equal(entry.pinned, true);
  assert.equal(entry.authorName, "担当A");
  assert.equal(entry.rootId, "root");
  assert.equal(entry.replyTo, "parent");
  assert.equal(entry.metadata["kakeratta-revision"], "abc");
  assert.equal(entry.speaker, "persona-a");
});

test("cross-day nested replies are ordered together and keep their root", () => {
  const root = parseTimeline(block("root"), "yesterday.md");
  const replies = parseTimeline([block("r1", { "reply-to": "root" }), block("r2", { "reply-to": "r1" })].join("\n\n---\n\n"), "today.md");
  const threads = timelineThreads([...replies, ...root]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].root.id, "root");
  assert.deepEqual(threads[0].replies.map(entry => entry.id), ["r1", "r2"]);
});

test("deleted or missing parents leave a thread placeholder rather than hiding replies", () => {
  const entries = parseTimeline([block("root", { deleted: "true" }), block("r1", { "root-id": "root", "reply-to": "root" })].join("\n\n---\n\n"), "today.md");
  for (const input of [entries, entries.slice(1)]) {
    const [thread] = timelineThreads(input);
    assert.equal(thread.root.id, "root");
    assert.equal(thread.root.deleted, true);
    assert.deepEqual(thread.replies.map(entry => entry.id), ["r1"]);
  }
});

test("legacy HTML marker and date headers do not become post body", () => {
  for (const source of [`<!-- timeline-post: ${at} -->\n${at}\nid: old\n\nbody`, `<!-- timeline-post: ${at} -->\nid: old\n\nbody`]) {
    const [entry] = parseTimeline(source, "old.md");
    assert.equal(entry.id, "old");
    assert.equal(entry.content, "body");
  }
});

test("editing a post leaves unrelated raw blocks and Markdown horizontal rules intact", () => {
  const raw = "Unstructured legacy note";
  const body = "Before\n---\nAfter";
  const source = [raw, block("post", {}, body)].join("\n\n---\n\n");
  const changed = changeTimelineEntry(source, "old.md", "post", entry => ({ ...entry, pinned: true }))!;
  assert.equal(parseTimeline(changed, "old.md")[0].content, raw);
  assert.equal(parseTimeline(changed, "old.md")[1].content, body);
});

test("a legacy-looking marker inside a message stays literal", () => {
  const body = `Example:\n<!-- timeline-post: ${at} -->\nend`;
  assert.equal(parseTimeline(block("post", {}, body), "day.md")[0].content, body);
});
