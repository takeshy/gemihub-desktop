import type { KakerattaCall } from "./kakerattaWorker";
import { type TimelineEntry } from "./timelineFormat";
import { mergeTimelineEntry, timelineVersion, type TimelineVersion } from "./timelineMerge";

export interface KakerattaTimelineRecord {
  entry: { id: string; text: string; at: string; speaker: string; root?: string; replyTo?: string; kind: string; [key: string]: unknown };
  revision: string;
  deleteRevision: string;
  authorName: string;
}
export interface TimelineSyncCursor { connection: string; before: string; complete: boolean }
interface SyncResponse {
  records: KakerattaTimelineRecord[];
  missing: string[];
  next: string;
  results: { id: string; status: string }[];
}
interface Change { id: string; text?: string; at?: string; replyTo?: string; revision?: string; deleteRevision?: string; deleted?: boolean; react?: boolean; language?: string }

export async function timelineFingerprint(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function baseOf(entry: TimelineEntry): TimelineVersion | null {
  try {
    const value = JSON.parse(entry.metadata["kakeratta-base"] ?? "null");
    return value && typeof value.content === "string" && typeof value.deleted === "boolean" ? value : null;
  } catch { return null; }
}

function parseResponse(value: Record<string, unknown>): SyncResponse {
  if (!Array.isArray(value.records) || !Array.isArray(value.missing) || !Array.isArray(value.results) || typeof value.next !== "string") throw new Error("Invalid Timeline sync response");
  for (const row of value.records as KakerattaTimelineRecord[]) {
    if (!row?.entry || typeof row.entry.id !== "string" || typeof row.entry.text !== "string" || typeof row.entry.speaker !== "string" || typeof row.entry.at !== "string" || !Number.isFinite(Date.parse(row.entry.at)) || typeof row.revision !== "string" || !row.revision || typeof row.deleteRevision !== "string" || typeof row.authorName !== "string") throw new Error("Invalid Timeline record");
  }
  if (!(value.missing as unknown[]).every(id => typeof id === "string")) throw new Error("Invalid missing Timeline IDs");
  for (const result of value.results as { id: string; status: string }[]) {
    if (!result || typeof result.id !== "string" || !["applied", "conflict", "missing"].includes(result.status)) throw new Error("Invalid Timeline mutation result");
  }
  return value as unknown as SyncResponse;
}

/** One bounded backfill page per tick; known IDs also retrieve their old threads. */
export async function syncKakerattaTimeline(options: {
  entries: TimelineEntry[];
  call: KakerattaCall;
  connection: string;
  directory: string;
  enabledAt: string;
  language: string;
  cursor?: TimelineSyncCursor;
  signal: AbortSignal;
}): Promise<{ entries: TimelineEntry[]; cursor: TimelineSyncCursor; conflicts: number; pending: number }> {
  const { call, connection, directory, signal } = options;
  const entries = options.entries.map(entry => ({ ...entry, metadata: { ...entry.metadata } }));
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error("Duplicate Timeline post IDs must be resolved before synchronizing");
  const byLocal = new Map(entries.map(entry => [entry.id, entry]));
  for (const entry of entries) {
    let parent = entry.replyTo ? byLocal.get(entry.replyTo) : undefined;
    const visited = new Set([entry.id]);
    while (parent && !visited.has(parent.id)) {
      if (parent.metadata["local-only"] === "true" || parent.metadata["kakeratta-connection"] && parent.metadata["kakeratta-connection"] !== connection) {
        entry.metadata["local-only"] = "true";
        break;
      }
      visited.add(parent.id);
      parent = parent.replyTo ? byLocal.get(parent.replyTo) : undefined;
    }
  }
  const byRemote = new Map<string, TimelineEntry>();
  for (const entry of entries) {
    const bound = entry.metadata["kakeratta-connection"];
    if (bound && bound !== connection) {
      // A changed URL/key is a new authority. Old bound content stays local.
      entry.metadata["local-only"] = "true";
      entry.metadata["connection-archived"] = "true";
      continue;
    }
    if (entry.metadata["local-only"] === "true") continue;
    if (!entry.metadata["kakeratta-id"] && entry.speaker === "user" && !entry.deleted) {
      entry.metadata["kakeratta-id"] = `gh-${(await timelineFingerprint(`${connection}\n${directory}\n${entry.id}`)).slice(0, 48)}`;
      entry.metadata["kakeratta-connection"] = connection;
    }
    const id = entry.metadata["kakeratta-id"];
    if (id) byRemote.set(id, entry);
  }
  const remoteId = (id: string) => entries.find(entry => entry.id === id)?.metadata["kakeratta-id"];
  const localId = async (id: string) => byRemote.get(id)?.id ?? `k_${(await timelineFingerprint(`${connection}\n${id}`)).slice(0, 48)}`;
  const records = new Map<string, KakerattaTimelineRecord>();
  const missing = new Set<string>();
  const knownIDs = [...byRemote.keys()].filter(id => !!byRemote.get(id)?.metadata["kakeratta-base"]);
  const cursor = options.cursor?.connection === connection ? options.cursor : { connection, before: "", complete: false };
  const fetchPage = async (ids: string[], before: string) => {
    signal.throwIfAborted();
    const response = parseResponse(await call("sync_timeline", { ids, before, limit: 50 }));
    for (const row of response.records) { records.set(row.entry.id, row); missing.delete(row.entry.id); }
    for (const id of response.missing) if (!records.has(id)) missing.add(id);
    return response;
  };
  const page = await fetchPage(knownIDs.slice(0, 200), cursor.before);
  if (cursor.before) await fetchPage([], "");
  for (let offset = 200; offset < knownIDs.length; offset += 200) await fetchPage(knownIDs.slice(offset, offset + 200), "");
  const nextCursor = { connection, before: page.next, complete: cursor.complete || !page.next };
  const fromRemote = async (row: KakerattaTimelineRecord): Promise<TimelineEntry> => {
    const id = await localId(row.entry.id);
    const rootId = await localId(row.entry.root || row.entry.id);
    const replyTo = row.entry.replyTo ? await localId(row.entry.replyTo) : "";
    const at = new Date(row.entry.at).toISOString();
    const sourcePath = byRemote.get(row.entry.id)?.sourcePath ?? `${directory}/${at.slice(0, 10)}.md`;
    return {
      id, rootId, replyTo, createdAt: at, sourcePath, index: 0, pinned: false,
      content: row.entry.text, speaker: row.entry.speaker, authorName: row.authorName, deleted: false,
      metadata: { speaker: row.entry.speaker, "author-name": row.authorName, "root-id": rootId, ...(replyTo ? { "reply-to": replyTo } : {}),
        "kakeratta-id": row.entry.id, "kakeratta-connection": connection, "kakeratta-revision": row.revision,
        "kakeratta-delete-revision": row.deleteRevision, "kakeratta-base": JSON.stringify({ content: row.entry.text, deleted: false }),
        // Preserve images, links, sources, places and original kinds losslessly.
        "kakeratta-entry": JSON.stringify(row.entry),
      },
    };
  };
  let conflicts = 0;
  let pending = 0;
  const changes: Change[] = [];
  const merged: TimelineEntry[] = [];
  for (const local of entries) {
    const id = local.metadata["kakeratta-id"];
    if (!id || local.metadata["local-only"] === "true") { merged.push(local); continue; }
    const row = records.get(id);
    const base = baseOf(local);
    let remote = row ? await fromRemote(row) : undefined;
    if (!remote && missing.has(id) && base) {
      remote = { ...local, content: base.content, deleted: true, metadata: { ...local.metadata, deleted: "true", "kakeratta-base": JSON.stringify({ content: base.content, deleted: true }) } };
    }
    let upload = !base && !local.deleted;
    if (remote) {
      const conflictId = `conflict_${(await timelineFingerprint(`${connection}\n${local.id}\n${JSON.stringify(timelineVersion(local))}`)).slice(0, 48)}`;
      const result = mergeTimelineEntry(local, remote, base, conflictId);
      merged.push(result.entry);
      upload = result.upload;
      if (result.conflict && !entries.some(entry => entry.id === result.conflict!.id)) { merged.push(result.conflict); conflicts++; }
    } else { merged.push(local); }
    if (!upload || (local.speaker !== "user" && !local.deleted)) continue;
    const react = Number.isFinite(Date.parse(options.enabledAt)) && Date.parse(local.createdAt) >= Date.parse(options.enabledAt);
    if (local.deleted) {
      const revision = local.metadata["kakeratta-delete-revision"];
      if (!revision) continue;
      changes.push({ id, deleted: true, deleteRevision: revision });
    } else {
      const parent = local.replyTo ? remoteId(local.replyTo) : undefined;
      if (local.replyTo && !parent) { pending++; continue; }
      changes.push({ id, text: local.content, at: local.createdAt, ...(parent ? { replyTo: parent } : {}), ...(base ? { revision: row?.revision ?? local.metadata["kakeratta-revision"] } : {}), react, language: options.language });
    }
  }
  for (const [id, row] of records) if (!byRemote.has(id)) merged.push(await fromRemote(row));
  // Parents must be submitted before their replies, regardless of source-day ordering.
  const remaining = [...changes];
  const attempted = new Set<string>();
  while (remaining.length) {
    const remainingIDs = new Set(remaining.map(change => change.id));
    const ready = remaining.filter(change => !change.replyTo || !remainingIDs.has(change.replyTo) || attempted.has(change.replyTo)).slice(0, 50);
    if (!ready.length) { pending += remaining.length; break; }
    signal.throwIfAborted();
    const response = parseResponse(await call("sync_timeline", { entries: ready, ids: ready.map(change => change.id), limit: 1 }));
    if (response.results.length !== ready.length || new Set(response.results.map(result => result.id)).size !== ready.length || response.results.some(result => !ready.some(change => change.id === result.id))) throw new Error("Incomplete Timeline mutation acknowledgment");
    for (const change of ready) { attempted.add(change.id); remaining.splice(remaining.indexOf(change), 1); }
    const after = new Map(response.records.map(row => [row.entry.id, row]));
    for (const result of response.results) {
      const local = merged.find(entry => entry.metadata["kakeratta-id"] === result.id && entry.metadata["local-only"] !== "true");
      if (!local) continue;
      const row = after.get(result.id);
      if (result.status === "applied" && row) {
        const remote = await fromRemote(row);
        // Only the acknowledged snapshot becomes the new base.
        Object.assign(local, { ...remote, pinned: local.pinned, metadata: { ...local.metadata, ...remote.metadata, deleted: "false" } });
      } else if ((result.status === "applied" || result.status === "missing") && local.deleted) {
        local.metadata["kakeratta-base"] = JSON.stringify(timelineVersion(local));
      } else if (result.status === "conflict" || result.status === "missing") {
        const remote = row ? await fromRemote(row) : { ...local, content: baseOf(local)?.content ?? local.content, deleted: true, metadata: { ...local.metadata, deleted: "true", "kakeratta-base": JSON.stringify({ content: baseOf(local)?.content ?? local.content, deleted: true }) } };
        const conflictId = `conflict_${(await timelineFingerprint(`${connection}\n${local.id}\n${JSON.stringify(timelineVersion(local))}`)).slice(0, 48)}`;
        const result = mergeTimelineEntry(local, remote, null, conflictId);
        Object.assign(local, result.entry);
        if (result.conflict && !merged.some(entry => entry.id === result.conflict!.id)) { merged.push(result.conflict); conflicts++; }
      } else { pending++; }
    }
    // Replies or other actors can arrive while mutations are being accepted.
    for (const row of response.records) if (!merged.some(entry => entry.metadata["kakeratta-id"] === row.entry.id)) merged.push(await fromRemote(row));
  }
  return { entries: merged, cursor: nextCursor, conflicts, pending };
}
