import type { KakerattaCall } from "./kakerattaWorker";
import { type TimelineEntry } from "./timelineFormat";
import { mergeTimelineEntry, timelineVersion, type TimelineVersion } from "./timelineMerge";

export interface KakerattaTimelineRecord {
  entry: { id: string; text: string; at: string; speaker: string; root?: string; replyTo?: string; kind: string; [key: string]: unknown };
  authorName: string;
}
export interface TimelineSyncCursor { connection: string; before: string; complete: boolean }
interface TimelineResponse {
  records: KakerattaTimelineRecord[];
  missing: string[];
  next: string;
}

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

function parseResponse(value: Record<string, unknown>): TimelineResponse {
  const authors = value.authors;
  if (!Array.isArray(value.entries) || !authors || typeof authors !== "object" || (value.next !== undefined && typeof value.next !== "string") || (value.missing !== undefined && !Array.isArray(value.missing))) throw new Error("Invalid Timeline response");
  const records = (value.entries as KakerattaTimelineRecord["entry"][]).map(entry => {
    if (!entry || typeof entry.id !== "string" || typeof entry.text !== "string" || typeof entry.speaker !== "string" || typeof entry.at !== "string" || !Number.isFinite(Date.parse(entry.at))) throw new Error("Invalid Timeline entry");
    const authorName = (authors as Record<string, unknown>)[entry.speaker];
    return { entry, authorName: typeof authorName === "string" ? authorName : entry.speaker };
  });
  const missing = (value.missing ?? []) as unknown[];
  if (!missing.every(id => typeof id === "string")) throw new Error("Invalid missing Timeline IDs");
  return { records, missing: missing as string[], next: (value.next as string | undefined) ?? "" };
}

/** Import only: one bounded backfill page per tick, with known threads refreshed. */
export async function syncKakerattaTimeline(options: {
  entries: TimelineEntry[];
  call: KakerattaCall;
  connection: string;
  directory: string;
  cursor?: TimelineSyncCursor;
  signal: AbortSignal;
}): Promise<{ entries: TimelineEntry[]; cursor: TimelineSyncCursor; conflicts: number }> {
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
    const id = entry.metadata["kakeratta-id"];
    if (id) byRemote.set(id, entry);
  }
  const localId = async (id: string) => byRemote.get(id)?.id ?? `k_${(await timelineFingerprint(`${connection}\n${id}`)).slice(0, 48)}`;
  const records = new Map<string, KakerattaTimelineRecord>();
  const missing = new Set<string>();
  // Unacknowledged legacy uploads are rechecked too, to settle what they are.
  const knownIDs = [...byRemote.keys()];
  const cursor = options.cursor?.connection === connection ? options.cursor : { connection, before: "", complete: false };
  const fetchPage = async (ids: string[], before: string) => {
    signal.throwIfAborted();
    const response = parseResponse(await call("get_timeline", { ids, ...(before ? { before } : {}), limit: 50 }));
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
        "kakeratta-id": row.entry.id, "kakeratta-connection": connection,
        "kakeratta-base": JSON.stringify({ content: row.entry.text, deleted: false }),
        // Preserve images, links, sources, places and original kinds losslessly.
        "kakeratta-entry": JSON.stringify(row.entry),
      },
    };
  };
  let conflicts = 0;
  const merged: TimelineEntry[] = [];
  for (const local of entries) {
    const id = local.metadata["kakeratta-id"];
    if (!id || local.metadata["local-only"] === "true") { merged.push(local); continue; }
    const row = records.get(id);
    const base = baseOf(local);
    let remote = row ? await fromRemote(row) : undefined;
    if (!remote && missing.has(id) && !base) {
      // Never reached Kakeratta: it is an ordinary local post again.
      const metadata = { ...local.metadata };
      delete metadata["kakeratta-id"];
      delete metadata["kakeratta-connection"];
      merged.push({ ...local, metadata });
      continue;
    }
    if (!remote && missing.has(id) && base) {
      remote = { ...local, content: base.content, deleted: true, metadata: { ...local.metadata, deleted: "true", "kakeratta-base": JSON.stringify({ content: base.content, deleted: true }) } };
    }
    if (remote) {
      const conflictId = `conflict_${(await timelineFingerprint(`${connection}\n${local.id}\n${JSON.stringify(timelineVersion(local))}`)).slice(0, 48)}`;
      // Imported posts follow Kakeratta; preserve legacy local edits as copies.
      const initial = mergeTimelineEntry(local, remote, base, conflictId);
      const result = initial.upload ? mergeTimelineEntry(local, remote, null, conflictId) : initial;
      merged.push(result.entry);
      if (result.conflict && !entries.some(entry => entry.id === result.conflict!.id)) { merged.push(result.conflict); conflicts++; }
    } else { merged.push(local); }
  }
  for (const [id, row] of records) if (!byRemote.has(id)) merged.push(await fromRemote(row));
  return { entries: merged, cursor: nextCursor, conflicts };
}
