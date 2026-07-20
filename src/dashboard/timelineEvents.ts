import {
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../lib/wailsBackend";
import {
  appendEntryBlock,
  buildEntryBlock,
  deleteEntry,
  parseMemoFile,
  replaceEntryBody,
  uniqueEntryId,
} from "../lib/memoTimeline";

export const TIMELINE_ROOT = "Dashboards/Timeline";
export const DEFAULT_TIMELINE_NAME = "Timeline";
const EVENT_MARKER_RE = /<!--\s*calendar-event:\s*(\d{4}-\d{2}-\d{2})\s*-->/i;

export interface TimelineCalendarPost {
  path: string;
  id: string;
  createdAt: string;
  content: string;
  pinned: boolean;
  isEvent: boolean;
  eventDate: string;
  eventTime: string;
  eventContent: string;
}

function calendarEventBody(
  date: string,
  time: string,
  content: string,
): string {
  const title = `Calendar event · ${date}${time ? ` ${time}` : ""}`;
  const callout = content.trim().split(/\r?\n/).map((line) => `> ${line}`).join(
    "\n",
  );
  return `<!-- calendar-event: ${date} -->\n> [!calendar] ${title}\n${callout}`;
}

function calendarEventFields(body: string): {
  date: string;
  time: string;
  content: string;
} {
  const marker = body.match(EVENT_MARKER_RE);
  const header = body.match(
    /^> \[!calendar\][^\n]*?·\s*\d{4}-\d{2}-\d{2}(?:\s+(\d{2}:\d{2}))?[^\n]*$/m,
  );
  const headerEnd = header?.index === undefined
    ? -1
    : header.index + header[0].length;
  const content = headerEnd < 0
    ? ""
    : body.slice(headerEnd).replace(/^\r?\n/, "")
      .split(/\r?\n/).map((line) => line.replace(/^> ?/, "")).join("\n")
      .trim();
  return {
    date: marker?.[1] || "",
    time: header?.[1] || "",
    content,
  };
}

export function sanitizeTimelineName(value: string): string {
  return value.trim().replace(/\.md$/i, "").replace(
    /[\\/:*?"<>|#[\]\n\r\t]+/g,
    "-",
  )
    .replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(
      0,
      80,
    ) || DEFAULT_TIMELINE_NAME;
}

export function localDayKey(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
    pad(date.getDate())
  }`;
}

export function timelineFolder(name: string): string {
  return `${TIMELINE_ROOT}/${sanitizeTimelineName(name)}`;
}

export function memoTimelineBody(
  filePath: string,
  fileName: string,
  quote: string,
  body: string,
): string {
  const linkTarget = filePath;
  const quoted = quote.trim()
    ? `\n> ${quote.trim().split(/\r?\n/).join("\n> ")}`
    : "";
  return `> [!quote] Memo · ${fileName}\n> [[${linkTarget}|${fileName}]]${quoted}${
    body.trim() ? `\n\n${body.trim()}` : ""
  }`;
}

export function parseTimelineCalendarPosts(
  path: string,
  content: string,
): TimelineCalendarPost[] {
  // Obsidian Timeline files may prefix blocks with a legacy timeline-post
  // marker. Desktop entries do not need it, but both formats stay readable.
  const normalized = content.replace(
    /^<!--\s*timeline-post:\s*[^>]+?\s*-->\s*\r?\n/gm,
    "",
  );
  return parseMemoFile(normalized).entries.map((entry) => {
    const body = entry.body || entry.quote;
    const event = body.match(EVENT_MARKER_RE);
    const eventFields = calendarEventFields(body);
    return {
      path,
      id: entry.id,
      createdAt: entry.createdAt,
      content: body,
      pinned: entry.pinned,
      isEvent: !!event,
      eventDate: event?.[1] || "",
      eventTime: eventFields.time,
      eventContent: eventFields.content,
    };
  });
}

export async function loadTimelineCalendarPosts(
  name: string,
): Promise<TimelineCalendarPost[]> {
  const folder = timelineFolder(name);
  const paths = (await listWorkspaceFiles()).filter((entry) =>
    entry.path.startsWith(`${folder}/`) &&
    /^\d{4}-\d{2}-\d{2}\.md$/i.test(entry.path.slice(folder.length + 1))
  ).map((entry) => entry.path).sort();
  const loaded = await Promise.all(
    paths.map(async (path) => ({ path, file: await readWorkspaceFile(path) })),
  );
  return loaded.flatMap(({ path, file }) =>
    file ? parseTimelineCalendarPosts(path, file.content) : []
  );
}

export async function appendTimelineEntry(
  name: string,
  body: string,
  date = new Date(),
): Promise<string> {
  const folder = timelineFolder(name);
  const path = `${folder}/${localDayKey(date)}.md`;
  const current = (await readWorkspaceFile(path))?.content || "";
  const now = new Date();
  const id = uniqueEntryId(current, now);
  await writeWorkspaceFile(
    path,
    appendEntryBlock(
      current,
      `timeline:${sanitizeTimelineName(name)}`,
      buildEntryBlock({
        createdAt: now.toISOString(),
        id,
        body: body.trim(),
      }),
    ),
  );
  window.dispatchEvent(
    new CustomEvent("llm-hub:dashboard-data-changed", { detail: { path } }),
  );
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  return id;
}

export async function appendCalendarEvent(
  name: string,
  date: string,
  time: string,
  content: string,
): Promise<string> {
  return appendTimelineEntry(
    name,
    calendarEventBody(date, time, content),
    new Date(`${date}T12:00:00`),
  );
}

export async function updateCalendarEvent(
  name: string,
  postId: string,
  nextDate: string,
  nextTime: string,
  nextContent: string,
): Promise<boolean> {
  const posts = await loadTimelineCalendarPosts(name);
  const post = posts.find((item) => item.id === postId && item.isEvent);
  if (!post) return false;
  const source = await readWorkspaceFile(post.path);
  if (!source) return false;
  const normalized = source.content.replace(
    /^<!--\s*timeline-post:\s*[^>]+?\s*-->\s*\r?\n/gm,
    "",
  );
  const body = calendarEventBody(nextDate, nextTime, nextContent);
  if (nextDate === post.eventDate) {
    const updated = replaceEntryBody(normalized, postId, body);
    if (updated === null) return false;
    await writeWorkspaceFile(post.path, updated);
  } else {
    const entry = parseMemoFile(normalized).entries.find((item) =>
      item.id === postId
    );
    const remaining = deleteEntry(normalized, postId);
    if (!entry?.parsed || remaining === null) return false;
    await writeWorkspaceFile(post.path, remaining);
    const targetPath = `${timelineFolder(name)}/${nextDate}.md`;
    const target = (await readWorkspaceFile(targetPath))?.content || "";
    await writeWorkspaceFile(
      targetPath,
      appendEntryBlock(
        target,
        `timeline:${sanitizeTimelineName(name)}`,
        buildEntryBlock({
          createdAt: entry.createdAt,
          id: entry.id,
          pinned: entry.pinned,
          body,
        }),
      ),
    );
  }
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  window.dispatchEvent(
    new CustomEvent("llm-hub:dashboard-data-changed", {
      detail: { path: post.path },
    }),
  );
  return true;
}

export async function deleteCalendarEvent(
  name: string,
  postId: string,
): Promise<boolean> {
  const posts = await loadTimelineCalendarPosts(name);
  const post = posts.find((item) => item.id === postId && item.isEvent);
  if (!post) return false;
  const source = await readWorkspaceFile(post.path);
  if (!source) return false;
  const normalized = source.content.replace(
    /^<!--\s*timeline-post:\s*[^>]+?\s*-->\s*\r?\n/gm,
    "",
  );
  const next = deleteEntry(normalized, postId);
  if (next === null) return false;
  await writeWorkspaceFile(post.path, next);
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  window.dispatchEvent(
    new CustomEvent("llm-hub:dashboard-data-changed", {
      detail: { path: post.path },
    }),
  );
  return true;
}

export async function moveCalendarEvent(
  name: string,
  postId: string,
  nextDate: string,
): Promise<boolean> {
  const posts = await loadTimelineCalendarPosts(name);
  const post = posts.find((item) => item.id === postId && item.isEvent);
  if (!post) return false;
  const source = await readWorkspaceFile(post.path);
  if (!source) return false;
  const normalized = source.content.replace(
    /^<!--\s*timeline-post:\s*[^>]+?\s*-->\s*\r?\n/gm,
    "",
  );
  const parsed = parseMemoFile(normalized);
  const entry = parsed.entries.find((item) => item.id === postId);
  if (!entry?.parsed) return false;
  const moved = entry.raw
    .replace(EVENT_MARKER_RE, `<!-- calendar-event: ${nextDate} -->`)
    .replace(/(> \[!calendar\][^\n]*?·\s*)\d{4}-\d{2}-\d{2}/, `$1${nextDate}`);
  const remaining = deleteEntry(normalized, postId);
  if (remaining === null) return false;
  await writeWorkspaceFile(post.path, remaining);
  const targetPath = `${timelineFolder(name)}/${nextDate}.md`;
  const target = (await readWorkspaceFile(targetPath))?.content || "";
  await writeWorkspaceFile(
    targetPath,
    appendEntryBlock(target, `timeline:${sanitizeTimelineName(name)}`, moved),
  );
  window.dispatchEvent(
    new CustomEvent("llm-hub:dashboard-data-changed", {
      detail: { path: targetPath },
    }),
  );
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  return true;
}
