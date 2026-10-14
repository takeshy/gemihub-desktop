import assert from "node:assert/strict";
import { test } from "vitest";
import { buildEntryBlock } from "./memoTimeline.ts";
import { parseTimeline } from "./timelineFormat.ts";
import { syncKakerattaTimeline, type KakerattaTimelineRecord } from "./kakerattaTimeline.ts";
import type { KakerattaCall } from "./kakerattaWorker.ts";

const at = "2026-10-12T10:00:00.000Z";
const directory = "Dashboards/Timeline/Timeline";
const record = (id: string, text: string, replyTo = ""): KakerattaTimelineRecord => ({
  entry: { id, text, at, speaker: "user", kind: replyTo ? "reply" : "post", ...(replyTo ? { root: replyTo, replyTo } : {}) },
  authorName: "担当者",
});
const local = (id: string, text: string, metadata: Record<string, string> = {}) => parseTimeline(buildEntryBlock({ id, createdAt: at, body: text, metadata }), `${directory}/2026-10-12.md`)[0];
const response = (rows: KakerattaTimelineRecord[], ids?: string[]) => ({
  entries: rows.map(row => row.entry),
  authors: Object.fromEntries(rows.map(row => [row.entry.speaker, row.authorName])),
  ...(ids ? { missing: ids.filter(id => !rows.some(row => row.entry.id === id)) } : {}),
});
function backend(initial: KakerattaTimelineRecord[] = []) {
  const rows = new Map(initial.map(row => [row.entry.id, row]));
  const calls: Record<string, unknown>[] = [];
  // Importing is read-only: any call carrying entries would be a write.
  const writes: Record<string, unknown>[] = [];
  const call: KakerattaCall = async (name, args) => {
    assert.equal(name, "get_timeline");
    calls.push(args);
    if ("entries" in args) writes.push(args);
    return response([...rows.values()], (args.ids ?? []) as string[]);
  };
  return { call, calls, writes, rows };
}
const options = { connection: "connection-a", directory, signal: new AbortController().signal };

test("local posts and replies stay local while remote threads import with stable IDs", async () => {
  const remote = backend([record("remote-root", "remote post"), record("remote-reply", "remote reply", "remote-root")]);
  const root = local("root", "post");
  const reply = local("reply", "reply", { "root-id": "root", "reply-to": "root" });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [reply, root] });
  assert.equal(remote.writes.length, 0);
  assert.deepEqual(result.entries.slice(0, 2), [reply, root]);
  const importedRoot = result.entries.find(entry => entry.metadata["kakeratta-id"] === "remote-root")!;
  const importedReply = result.entries.find(entry => entry.metadata["kakeratta-id"] === "remote-reply")!;
  assert.equal(importedReply.replyTo, importedRoot.id);
  assert.equal(importedReply.authorName, "担当者");
  const retry = await syncKakerattaTimeline({ ...options, call: remote.call, entries: result.entries, cursor: result.cursor });
  assert.deepEqual(retry.entries.map(entry => entry.id), result.entries.map(entry => entry.id));
  assert.ok(remote.calls.every(call => !("entries" in call)));
});

test("simultaneous edits keep Kakeratta and archive the local edit without uploading it", async () => {
  const remote = backend([record("remote", "Kakeratta edit")]);
  const entry = local("ours", "GemiHub edit", { "kakeratta-id": "remote", "kakeratta-connection": options.connection, "kakeratta-revision": "r1", "kakeratta-base": JSON.stringify({ content: "original", deleted: false }) });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [entry] });
  assert.equal(remote.writes.length, 0);
  assert.equal(result.entries.find(entry => entry.id === "ours")?.content, "Kakeratta edit");
  const archive = result.entries.find(entry => entry.metadata["conflict-of"] === "ours")!;
  assert.equal(archive.content, "GemiHub edit");
  assert.equal(archive.metadata["local-only"], "true");
  const retry = await syncKakerattaTimeline({ ...options, call: remote.call, entries: result.entries, cursor: result.cursor });
  assert.equal(retry.entries.filter(entry => entry.metadata["conflict-of"] === "ours").length, 1);
  assert.equal(remote.writes.length, 0);
});

test("verified remote deletion preserves a concurrent local edit as a local root", async () => {
  const remote = backend();
  const entry = local("ours", "local edit", { "kakeratta-id": "missing", "kakeratta-connection": options.connection, "kakeratta-base": JSON.stringify({ content: "original", deleted: false }) });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [entry] });
  assert.equal(result.entries[0].deleted, true);
  assert.equal(result.entries[1].content, "local edit");
  assert.equal(result.entries[1].rootId, result.entries[1].id);
  assert.equal(remote.writes.length, 0);
});

test("connection changes archive previous bound content instead of sending it elsewhere", async () => {
  const remote = backend();
  const old = local("old", "private old post", { "kakeratta-id": "old-remote", "kakeratta-connection": "connection-old" });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [old] });
  assert.equal(result.entries[0].metadata["connection-archived"], "true");
  assert.equal(remote.writes.length, 0);
  assert.ok(remote.calls.every(call => !(call.ids as string[]).includes("old-remote")));
});

test("legacy local edits and deletions never mutate unchanged remote posts", async () => {
  for (const deleted of [false, true]) {
    const remote = backend([record("remote", "original")]);
    const entry = local("ours", deleted ? "original" : "local edit", {
      deleted: String(deleted), "kakeratta-id": "remote", "kakeratta-connection": options.connection,
      "kakeratta-base": JSON.stringify({ content: "original", deleted: false }),
    });
    const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [entry] });
    assert.equal(remote.writes.length, 0);
    assert.equal(result.entries[0].content, "original");
    assert.equal(result.entries[0].deleted, false);
    assert.equal(result.entries[1].metadata["conflict-operation"], deleted ? "delete" : "edit");
  }
});

test("history scanning continues after backfill to discover older new imports", async () => {
  const requests: Record<string, unknown>[] = [];
  const call: KakerattaCall = async (_name, args) => {
    requests.push(args);
    return response(args.before === "old-page" ? [record("old-import", "older imported post")] : []);
  };
  const result = await syncKakerattaTimeline({ ...options, call, entries: [], cursor: { connection: options.connection, complete: true, before: "old-page" } });
  assert.equal(requests[0].before, "old-page");
  assert.equal(requests[1].before, undefined);
  assert.equal(result.entries[0].content, "older imported post");
});

test("replies to local conflict copies remain local and never reach Kakeratta", async () => {
  const remote = backend();
  const archive = local("conflict", "preserved local content", { "local-only": "true" });
  const reply = local("reply", "reply to preserved content", { "reply-to": "conflict", "root-id": "conflict" });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [reply, archive] });
  assert.equal(remote.writes.length, 0);
  assert.equal(result.entries[0].metadata["local-only"], "true");
});

test("legacy unacknowledged local posts become plain local posts when Kakeratta lacks them", async () => {
  const remote = backend();
  const entry = local("uncertain", "retained content", { "kakeratta-id": "gh-legacy", "kakeratta-connection": options.connection });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [entry] });
  assert.equal(remote.writes.length, 0);
  assert.ok((remote.calls[0].ids as string[]).includes("gh-legacy"));
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].content, "retained content");
  assert.equal(result.entries[0].metadata["kakeratta-id"], undefined);
  assert.equal(result.entries[0].metadata["kakeratta-connection"], undefined);
});

test("legacy unacknowledged posts that did reach Kakeratta are imported", async () => {
  const remote = backend([record("gh-arrived", "same content")]);
  const entry = local("arrived", "same content", { "kakeratta-id": "gh-arrived", "kakeratta-connection": options.connection });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [entry] });
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].id, "arrived");
  assert.ok(result.entries[0].metadata["kakeratta-base"]);
});
