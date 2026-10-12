import { timelineFolder } from "../dashboard/timelineEvents";
import {
  listWorkspaceDirectoryFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "./wailsBackend";
import {
  syncKakerattaTimeline,
  type TimelineSyncCursor,
} from "./kakerattaTimeline";
import type { KakerattaCall } from "./kakerattaWorker";
import type { KakerattaSettings } from "./kakerattaSettings";
import { parseTimeline, serializeTimeline } from "./timelineFormat";
import { withTimelineFileLock } from "./timelineLocalLock";
import { mergeTimelineSnapshots } from "./timelineSnapshotMerge";

export interface LocalTimelineSyncResult {
  files: number;
  conflicts: number;
  pending: number;
  backfillPending: boolean;
}

const DAY_FILE = /\/\d{4}-\d{2}-\d{2}\.md$/;
const STATE_FILE = "_kakeratta-sync.json";

async function readText(path: string): Promise<string> {
  return (await readWorkspaceFile(path))?.content ?? "";
}

/**
 * Synchronize the named Timeline's daily files in the Workspace. Edits that
 * land while the MCP exchange is in flight are merged, not overwritten.
 */
export async function syncTimelineLocal(
  config: KakerattaSettings,
  call: KakerattaCall,
  connection: string,
  language: string,
  signal: AbortSignal,
): Promise<LocalTimelineSyncResult> {
  const folder = timelineFolder(config.timelineSync.name);
  const paths = (await listWorkspaceDirectoryFiles(folder)).filter((path) =>
    DAY_FILE.test(path)
  );
  const originals = new Map<string, string>();
  const entries = [];
  for (const path of paths) {
    signal.throwIfAborted();
    // Wait out an in-progress post so its content is part of the snapshot.
    const content = await withTimelineFileLock(path, () => readText(path));
    originals.set(path, content);
    entries.push(...parseTimeline(content, path));
  }

  const statePath = `${folder}/${STATE_FILE}`;
  let cursor: TimelineSyncCursor | undefined;
  try {
    const raw = await readText(statePath);
    if (raw) cursor = JSON.parse(raw) as TimelineSyncCursor;
  } catch { /* Backfill again; IDs remain stable. */ }

  const result = await syncKakerattaTimeline({
    entries,
    call,
    connection,
    directory: folder,
    enabledAt: config.timelineSync.enabledAt,
    language,
    cursor,
    signal,
  });

  const source = `timeline:${config.timelineSync.name}`;
  const byPath = new Map<string, typeof result.entries>();
  for (const entry of result.entries) {
    const group = byPath.get(entry.sourcePath) ?? [];
    group.push(entry);
    byPath.set(entry.sourcePath, group);
  }
  let written = 0;
  for (const [path, group] of byPath) {
    signal.throwIfAborted();
    await withTimelineFileLock(path, async () => {
      const current = await readText(path);
      let desired = serializeTimeline(group, source);
      const original = originals.get(path) ?? "";
      if (current !== original) {
        const merged = await mergeTimelineSnapshots(
          parseTimeline(current, path),
          parseTimeline(desired, path),
          parseTimeline(original, path),
          connection,
        );
        desired = serializeTimeline(merged, source);
      }
      if (desired !== current) {
        await writeWorkspaceFile(path, desired);
        written++;
      }
    });
  }
  // The cursor follows durable entry writes, so a lost response replays safely.
  const nextState = JSON.stringify(result.cursor);
  if (nextState !== (await readText(statePath))) {
    await writeWorkspaceFile(statePath, nextState);
  }
  if (written > 0) {
    window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
    window.dispatchEvent(new Event("llm-hub:dashboard-data-changed"));
  }
  return {
    files: written,
    conflicts: result.conflicts,
    pending: result.pending,
    backfillPending: !result.cursor.complete,
  };
}
