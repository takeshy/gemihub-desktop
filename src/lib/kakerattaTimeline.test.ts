import assert from "node:assert/strict";
import { test } from "vitest";
import { buildEntryBlock } from "./memoTimeline.ts";
import { parseTimeline } from "./timelineFormat.ts";
import { syncKakerattaTimeline, type KakerattaTimelineRecord } from "./kakerattaTimeline.ts";
import type { KakerattaCall } from "./kakerattaWorker.ts";

const at = "2026-10-12T10:00:00.000Z";
const directory = "Dashboards/Timeline/Timeline";
const record = (id: string, text: string, revision = "r1", replyTo = ""): KakerattaTimelineRecord => ({
  entry: { id, text, at, speaker: "user", kind: replyTo ? "reply" : "post", ...(replyTo ? { root: replyTo, replyTo } : {}) },
  revision, deleteRevision: `delete-${revision}`, authorName: "担当者",
});
const local = (id: string, text: string, metadata: Record<string, string> = {}) => parseTimeline(buildEntryBlock({ id, createdAt: at, body: text, metadata }), `${directory}/2026-10-12.md`)[0];
function backend(initial: KakerattaTimelineRecord[] = []) {
  const rows = new Map(initial.map(row => [row.entry.id, row]));
  const calls: Record<string, unknown>[] = [];
  const writes: Record<string, unknown>[] = [];
  const call: KakerattaCall = async (name, args) => {
    assert.equal(name, "sync_timeline");
    calls.push(args);
    const results: { id: string; status: string }[] = [];
    for (const value of (args.entries ?? []) as Record<string, unknown>[]) {
      writes.push(value);
      const id = value.id as string;
      const current = rows.get(id);
      if (value.deleted) {
        if (current && current.deleteRevision === value.deleteRevision) { rows.delete(id); results.push({ id, status: "applied" }); }
        else results.push({ id, status: current ? "conflict" : "missing" });
      } else if (current && value.revision !== current.revision && current.entry.text !== value.text) results.push({ id, status: "conflict" });
      else {
        assert.ok(!value.replyTo || rows.has(value.replyTo as string), "parent must exist first");
        rows.set(id, record(id, value.text as string, "r2", value.replyTo as string));
        results.push({ id, status: "applied" });
      }
    }
    return { records: [...rows.values()], missing: ((args.ids ?? []) as string[]).filter(id => !rows.has(id)), results, next: "" };
  };
  return { call, calls, writes, rows };
}
const options = { connection: "connection-a", directory, enabledAt: "2026-10-12T09:00:00.000Z", language: "ja", signal: new AbortController().signal };

test("new posts and cross-day replies synchronize with stable IDs and parent ordering", async () => {
  const remote = backend();
  const root = local("root", "post");
  const reply = local("reply", "reply", { "root-id": "root", "reply-to": "root" });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [reply, root] });
  assert.equal(remote.writes.length, 2);
  assert.equal(remote.writes[0].text, "post");
  assert.equal(remote.writes[1].replyTo, remote.writes[0].id);
  assert.equal(result.entries.find(entry => entry.id === "reply")?.replyTo, "root");
  assert.equal(result.entries.find(entry => entry.id === "root")?.authorName, "担当者");
  await syncKakerattaTimeline({ ...options, call: remote.call, entries: result.entries, cursor: result.cursor });
  assert.equal(remote.writes.length, 2, "an acknowledged retry must not submit again");
});

test("simultaneous edits keep Kakeratta and archive the local edit without uploading it", async () => {
  const remote = backend([record("remote", "Kakeratta edit", "r2")]);
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

test("historical imports are silent and new posts request ordinary persona routing", async () => {
  const remote = backend();
  await syncKakerattaTimeline({ ...options, enabledAt: "2026-10-12T11:00:00.000Z", call: remote.call, entries: [local("old", "historical")] });
  assert.equal(remote.writes[0].react, false);
  await syncKakerattaTimeline({ ...options, call: remote.call, entries: [local("new", "new")] });
  assert.equal(remote.writes[1].react, true);
});

test("local deletion uses its acknowledged subtree revision, preserving replies added remotely", async () => {
  const remote = backend([record("remote", "original", "r2")]);
  const entry = local("ours", "original", { deleted: "true", "kakeratta-id": "remote", "kakeratta-connection": options.connection, "kakeratta-delete-revision": "delete-r1", "kakeratta-base": JSON.stringify({ content: "original", deleted: false }) });
  const result = await syncKakerattaTimeline({ ...options, call: remote.call, entries: [entry] });
  assert.equal(remote.writes[0].deleteRevision, "delete-r1");
  assert.equal(result.entries[0].deleted, false);
  assert.equal(result.entries[1].metadata["conflict-operation"], "delete");
});

test("a lost creation response is reconciled without another creation", async () => {
  const remote = backend();
  let lost = false;
  const call: KakerattaCall = async (name, args) => {
    const result = await remote.call(name, args);
    if (args.entries && !lost) { lost = true; throw new Error("Response lost"); }
    return result;
  };
  const original = local("post", "content");
  await assert.rejects(syncKakerattaTimeline({ ...options, call, entries: [original] }));
  const retried = await syncKakerattaTimeline({ ...options, call, entries: [original] });
  assert.equal(remote.rows.size, 1);
  assert.equal(remote.writes.length, 1);
  assert.ok(retried.entries[0].metadata["kakeratta-base"]);
});

test("history scanning continues after backfill to discover older new imports", async () => {
  const requests: Record<string, unknown>[] = [];
  const call: KakerattaCall = async (_name, args) => {
    requests.push(args);
    return { records: args.before === "old-page" ? [record("old-import", "older imported post")] : [], missing: [], results: [], next: "" };
  };
  const result = await syncKakerattaTimeline({ ...options, call, entries: [], cursor: { connection: options.connection, complete: true, before: "old-page" } });
  assert.equal(requests[0].before, "old-page");
  assert.equal(requests[1].before, "");
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

test("a definitive missing creation is acknowledged as deleted and its content is retained", async () => {
  const call: KakerattaCall = async (_name, args) => ({ records: [], missing: [], next: "", results: ((args.entries ?? []) as { id: string }[]).map(change => ({ id: change.id, status: "missing" })) });
  const result = await syncKakerattaTimeline({ ...options, call, entries: [local("uncertain", "retained content")] });
  assert.equal(result.entries[0].deleted, true);
  assert.equal(JSON.parse(result.entries[0].metadata["kakeratta-base"]).deleted, true);
  assert.equal(result.entries[1].content, "retained content");
  assert.equal(result.entries[1].metadata["local-only"], "true");
});
