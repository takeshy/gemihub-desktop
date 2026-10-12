import type { TimelineEntry } from "./timelineFormat";

/** The synchronized user-editable payload. Presentation metadata stays local. */
export interface TimelineVersion {
  content: string;
  deleted: boolean;
}

export interface TimelineMergeResult {
  entry: TimelineEntry;
  /** A preserved local version when both sides changed differently. */
  conflict?: TimelineEntry;
  /** The local version to send with an atomic expected-revision check. */
  upload: boolean;
}

export function timelineVersion(entry: TimelineEntry): TimelineVersion {
  return { content: entry.content, deleted: entry.deleted };
}

function same(a: TimelineVersion, b: TimelineVersion): boolean {
  return a.content === b.content && a.deleted === b.deleted;
}

/**
 * Three-way merge using an explicit acknowledged base, never timestamps.
 * Remote absence must be verified by ID and supplied as a deleted entry;
 * absence from a page is not a deletion.
 * conflictId must be deterministic for this local payload so a lost response
 * and retry preserve a single copy instead of creating repeated conflict posts.
 */
export function mergeTimelineEntry(
  local: TimelineEntry,
  remote: TimelineEntry,
  base: TimelineVersion | null,
  conflictId: string,
): TimelineMergeResult {
  if (local.id !== remote.id) throw new Error("Cannot merge unrelated Timeline entries");
  const ours = timelineVersion(local);
  const theirs = timelineVersion(remote);
  const adoptRemote = (): TimelineEntry => ({
    ...remote,
    sourcePath: local.sourcePath,
    index: local.index,
    pinned: local.pinned,
    metadata: {
      ...Object.fromEntries(Object.entries(local.metadata).filter(([key]) => key !== "deleted")),
      ...remote.metadata,
      ...(remote.deleted ? { deleted: "true" } : { deleted: "false" }),
    },
  });
  if (same(ours, theirs)) return { entry: adoptRemote(), upload: false };
  if (base && same(ours, base)) return { entry: adoptRemote(), upload: false };
  if (base && same(theirs, base)) return { entry: local, upload: true };

  // An unrecognized lineage is also a conflict. Equal IDs alone are not proof
  // that the current local or remote body was the acknowledged original.
  // Preserve a local edit even when the remote side deleted its conversation.
  // A local deletion never removes a concurrently edited remote post.
  if (!conflictId || conflictId === local.id) throw new Error("A distinct conflict ID is required");
  const rootId = remote.deleted ? conflictId : remote.rootId;
  const replyTo = remote.deleted ? "" : remote.id;
  // Never copy remote identity or base-revision metadata to a new local post.
  const metadata = Object.fromEntries(Object.entries(local.metadata).filter(([key]) =>
    !key.startsWith("kakeratta-") && !["id", "deleted", "root-id", "reply-to", "speaker", "author-name"].includes(key),
  ));
  metadata["conflict-of"] = local.id;
  metadata["conflict-source"] = "gemihub";
  metadata["conflict-operation"] = local.deleted ? "delete" : "edit";
  metadata["local-only"] = "true";
  metadata.speaker = "user";
  if (replyTo) {
    metadata["root-id"] = rootId;
    metadata["reply-to"] = replyTo;
  }
  return {
    entry: adoptRemote(),
    upload: false,
    conflict: {
      ...local, id: conflictId, rootId, replyTo, speaker: "user", deleted: false,
      metadata,
    },
  };
}
