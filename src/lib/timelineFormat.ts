import { parseMemoFile, buildEntryBlock, serializeMemoFile } from "./memoTimeline";

export interface TimelineEntry {
  id: string;
  createdAt: string;
  pinned: boolean;
  content: string;
  index: number;
  sourcePath: string;
  metadata: Record<string, string>;
  rootId: string;
  replyTo: string;
  speaker: string;
  authorName: string;
  deleted: boolean;
}

function normalizeLegacy(content: string): string {
  const normalized = content.replace(/\r\n?/g, "\n");
  const frontmatter = normalized.match(/^(---\n[\s\S]*?\n---(?:\n|$))/)?.[1] ?? "";
  const rest = normalized.slice(frontmatter.length);
  const blocks = rest.split(/\n[ \t]*\n---[ \t]*\n[ \t]*\n/).filter(block => block.trim());
  return frontmatter + blocks.map((raw, index) => {
    let block = raw.trim();
    const marker = block.match(/^<!--\s*timeline-post:\s*([^>]+?)\s*-->/);
    if (marker) {
      const at = new Date(marker[1].trim());
      block = block.slice(marker[0].length).trimStart();
      if (Number.isFinite(at.getTime()) && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z(?:\n|$)/.test(block)) block = `${at.toISOString()}\n${block}`;
    }
    const lines = block.split("\n");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(lines[0]) && !/^id:/.test(lines[1] ?? "")) {
      lines.splice(1, 0, `id: ${lines[0]}-${index}`);
    }
    return lines.join("\n");
  }).join("\n\n---\n\n");
}

export function parseTimeline(content: string, sourcePath: string): TimelineEntry[] {
  const normalized = normalizeLegacy(content);
  return parseMemoFile(normalized).entries.map(entry => {
    const metadata = entry.metadata ?? {};
    const id = entry.parsed ? entry.id : `${new Date(0).toISOString()}-${entry.index}`;
    return {
      id, createdAt: entry.createdAt || new Date(0).toISOString(), pinned: entry.pinned,
      content: entry.body, index: entry.index, sourcePath, metadata,
      rootId: metadata["root-id"] || id, replyTo: metadata["reply-to"] || "",
      speaker: metadata.speaker || "user",
      authorName: metadata["author-name"] || metadata["author-email"] || (metadata.speaker && metadata.speaker !== "user" ? metadata.speaker : ""),
      deleted: metadata.deleted === "true",
    };
  });
}

export function timelineBlock(entry: TimelineEntry): string {
  return buildEntryBlock({ id: entry.id, createdAt: entry.createdAt, pinned: entry.pinned, metadata: entry.metadata, body: entry.content });
}

export function serializeTimeline(entries: TimelineEntry[], source = "timeline:Timeline"): string {
  return serializeMemoFile(source, entries.map(timelineBlock));
}

/** Preserve metadata when editing, pinning, or recording a deletion for sync. */
export function changeTimelineEntry(content: string, path: string, id: string, change: (entry: TimelineEntry) => TimelineEntry): string | null {
  const parsed = parseMemoFile(normalizeLegacy(content));
  const entries = parseTimeline(content, path);
  if (!entries.some(entry => entry.id === id)) return null;
  return serializeMemoFile(parsed.source, entries.map((entry, index) => {
    if (entry.id === id) return timelineBlock(change(entry));
    return parsed.entries[index].raw;
  }));
}

export function timelineThreads(entries: TimelineEntry[]): { root: TimelineEntry; replies: TimelineEntry[] }[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const groups = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    if (entry.deleted) continue;
    // Resolve legacy reply chains without looping on corrupt parent metadata.
    let rootId = entry.rootId;
    if (entry.replyTo && rootId === entry.id) {
      const visited = new Set([entry.id]);
      let parent = byId.get(entry.replyTo);
      while (parent && !visited.has(parent.id)) {
        visited.add(parent.id); rootId = parent.rootId;
        if (!parent.replyTo || parent.rootId !== parent.id) break;
        parent = byId.get(parent.replyTo);
      }
    }
    const group = groups.get(rootId) ?? [];
    group.push(entry); groups.set(rootId, group);
  }
  return [...groups.entries()].map(([id, group]) => {
    const root = byId.get(id) ?? {
      ...group[0], id, rootId: id, replyTo: "", deleted: true, content: "",
      metadata: { deleted: "true" },
    };
    return { root, replies: group.filter(entry => entry.id !== root.id).map(entry => ({ ...entry, rootId: id })).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id)) };
  });
}
