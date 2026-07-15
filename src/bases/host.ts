// Host adapter implementations — test host (in-memory fixtures) and GemiHub host (IndexedDB).

import type {
  BasesHostAdapter,
  HostFile,
  HostLink,
  HostPropertyType,
  QuerySnapshot,
} from "./types";
import { parseFrontmatter } from "../components/FrontmatterEditor";

const isMarkdownFile = (name: string) => /\.md(?:own)?$/i.test(name);
import { sanitizeHtmlBasic } from "./functions";

// ---------------------------------------------------------------------------
// Test host — in-memory fixtures for conformance tests
// ---------------------------------------------------------------------------

export interface TestFixtureFile {
  path: string;
  stat: { size: number; ctimeMs: number; mtimeMs: number };
  frontmatter: Record<string, unknown> | null;
  propertyTypes: Record<string, string>;
  tags: string[];
  outgoingLinks: HostLink[];
  backlinks: string[]; // file paths
  embeds: HostLink[];
}

export interface TestFixtures {
  files: TestFixtureFile[];
  linkResolution?: {
    sourceRelativeFirst?: boolean;
    basenameFallback?: boolean;
    caseSensitivePaths?: boolean;
  };
}

export function createTestHost(
  fixtures: TestFixtures,
  clock: { now: string; timezone: string; locale: string },
  randomSequence: number[],
  displayContextPath?: string | null,
): { host: BasesHostAdapter; snapshot: QuerySnapshot } {
  const fileMap = new Map<string, TestFixtureFile>();
  for (const f of fixtures.files) {
    fileMap.set(f.path, f);
  }

  const nowMs = new Date(clock.now).getTime();

  const snapshot: QuerySnapshot = {
    nowMs,
    timezone: clock.timezone,
    locale: clock.locale,
    randomSequence: [...randomSequence],
    randomIndex: 0,
  };

  const linkRes = fixtures.linkResolution ?? {};

  function toHostFile(tf: TestFixtureFile): HostFile {
    const lastDot = tf.path.lastIndexOf(".");
    const name = tf.path.includes("/")
      ? tf.path.substring(tf.path.lastIndexOf("/") + 1)
      : tf.path;
    return {
      path: tf.path,
      name,
      basename: lastDot >= 0 ? name.substring(0, name.lastIndexOf(".")) : name,
      extension: lastDot >= 0 ? name.substring(name.lastIndexOf(".") + 1) : "",
      size: tf.stat.size,
      ctimeMs: tf.stat.ctimeMs,
      mtimeMs: tf.stat.mtimeMs,
    };
  }

  const host: BasesHostAdapter = {
    enumerateFiles(): HostFile[] {
      return fixtures.files.map(toHostFile);
    },

    getFile(path: string): HostFile | null {
      const tf = fileMap.get(path);
      return tf ? toHostFile(tf) : null;
    },

    getFrontmatter(file: HostFile): Record<string, unknown> | null {
      const tf = fileMap.get(file.path);
      return tf?.frontmatter ?? null;
    },

    getPropertyTypes(file: HostFile): Record<string, HostPropertyType> {
      const tf = fileMap.get(file.path);
      const result: Record<string, HostPropertyType> = {};
      if (tf?.propertyTypes) {
        for (const [k, v] of Object.entries(tf.propertyTypes)) {
          result[k] = v as HostPropertyType;
        }
      }
      return result;
    },

    getTags(file: HostFile): string[] {
      const tf = fileMap.get(file.path);
      return tf?.tags ?? [];
    },

    getOutgoingLinks(file: HostFile): HostLink[] {
      const tf = fileMap.get(file.path);
      return tf?.outgoingLinks ?? [];
    },

    getBacklinks(file: HostFile): HostFile[] {
      const tf = fileMap.get(file.path);
      if (!tf) return [];
      return tf.backlinks
        .map((p) => fileMap.get(p))
        .filter((f): f is TestFixtureFile => f !== undefined)
        .map(toHostFile);
    },

    getEmbeds(file: HostFile): HostLink[] {
      const tf = fileMap.get(file.path);
      return tf?.embeds ?? [];
    },

    resolveLink(target: string, sourcePath: string): HostFile | null {
      const caseSensitive = linkRes.caseSensitivePaths ?? true;

      // Strip subpath (heading/block)
      const hashIdx = target.indexOf("#");
      const cleanTarget = hashIdx >= 0 ? target.substring(0, hashIdx) : target;

      // Strip wikilink markers
      const wlTarget = cleanTarget.replace(/^\[\[/, "").replace(/\]\]$/, "");

      // 1. Source-relative first
      if (linkRes.sourceRelativeFirst !== false && sourcePath.includes("/")) {
        const sourceFolder = sourcePath.substring(
          0,
          sourcePath.lastIndexOf("/"),
        );
        const relativePath = `${sourceFolder}/${wlTarget}`;
        // Try with .md extension
        for (const candidate of [relativePath, `${relativePath}.md`]) {
          const tf = fileMap.get(
            caseSensitive ? candidate : findCaseInsensitive(fileMap, candidate),
          );
          if (tf) return toHostFile(tf);
        }
      }

      // 2. Exact path match
      const exact = fileMap.get(
        caseSensitive ? wlTarget : findCaseInsensitive(fileMap, wlTarget),
      );
      if (exact) return toHostFile(exact);

      // Try with .md extension
      const withMd = `${wlTarget}.md`;
      const exactMd = fileMap.get(
        caseSensitive ? withMd : findCaseInsensitive(fileMap, withMd),
      );
      if (exactMd) return toHostFile(exactMd);

      // 3. Basename fallback
      if (linkRes.basenameFallback !== false) {
        for (const f of fixtures.files) {
          const basename = f.path.includes("/")
            ? f.path.substring(f.path.lastIndexOf("/") + 1)
            : f.path;
          const baseNoExt = basename.includes(".")
            ? basename.substring(0, basename.lastIndexOf("."))
            : basename;
          if (
            caseSensitive
              ? baseNoExt === wlTarget
              : baseNoExt.toLowerCase() === wlTarget.toLowerCase()
          ) {
            return toHostFile(f);
          }
        }
      }

      return null;
    },

    getDisplayContext(): HostFile | null {
      if (displayContextPath === undefined) {
        // Default is Dashboard.md
        const tf = fileMap.get("Dashboard.md");
        return tf ? toHostFile(tf) : null;
      }
      if (displayContextPath === null) return null;
      const tf = fileMap.get(displayContextPath);
      return tf ? toHostFile(tf) : null;
    },

    now(): number {
      return nowMs;
    },

    random(): number {
      const idx = snapshot.randomIndex;
      const val = snapshot.randomSequence[idx] ?? Math.random();
      snapshot.randomIndex = idx + 1;
      return val;
    },

    sanitizeHtml(input: string): string {
      return sanitizeHtmlBasic(input);
    },

    isSupportedIcon(name: string): boolean {
      // In test mode, accept all non-empty icon names
      return name.length > 0;
    },
  };

  return { host, snapshot };
}

function findCaseInsensitive(map: Map<string, unknown>, path: string): string {
  const lower = path.toLowerCase();
  for (const key of map.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return path; // not found, return original
}

// ---------------------------------------------------------------------------
// GemiHub host — reads from IndexedDB (async pre-load, sync query)
// ---------------------------------------------------------------------------

export interface GemiHubHostData {
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    modifiedTime: string;
    createdTime?: string;
    content?: string;
    frontmatter?: Record<string, unknown>;
  }>;
  displayContextPath?: string | null;
  timezone?: string;
  locale?: string;
}

export function createGemiHubHost(
  data: GemiHubHostData,
  nowMs?: number,
  displayContextPath?: string | null,
): { host: BasesHostAdapter; snapshot: QuerySnapshot } {
  // Build in-memory file map
  const fileMap = new Map<string, {
    id: string;
    path: string;
    name: string;
    content: string;
    frontmatter: Record<string, unknown>;
    propertyTypes: Record<string, HostPropertyType>;
    tags: string[];
    outgoingLinks: HostLink[];
    embeds: HostLink[];
    ctimeMs: number;
    mtimeMs: number;
    size: number;
  }>();

  for (const f of data.files) {
    const path = f.name;
    const content = f.content ?? "";
    const isMd = isMarkdownFile(f.name);
    const fm = isMd
      ? (f.frontmatter ??
        (content ? parseFrontmatter(content).frontmatter : {}))
      : {};

    // Extract tags from frontmatter
    const tags: string[] = [];
    if (fm.tags) {
      if (Array.isArray(fm.tags)) {
        for (const t of fm.tags) {
          if (typeof t === "string") tags.push(canonicalizeTag(t));
        }
      } else if (typeof fm.tags === "string") {
        for (const t of fm.tags.split(/[\s,]+/).filter(Boolean)) {
          tags.push(canonicalizeTag(t));
        }
      }
    }

    const mtime = f.modifiedTime
      ? new Date(f.modifiedTime).getTime()
      : Date.now();
    const ctime = f.createdTime ? new Date(f.createdTime).getTime() : mtime;
    const size = content.length;

    fileMap.set(path, {
      id: f.id,
      path,
      name: f.name,
      content,
      frontmatter: fm,
      propertyTypes: inferPropertyTypes(fm),
      tags,
      outgoingLinks: [],
      embeds: [],
      ctimeMs: ctime,
      mtimeMs: mtime,
      size,
    });
  }

  // Extract outgoing links and embeds after all files are available for resolution.
  for (const [path, f] of fileMap) {
    if (!isMarkdownFile(path)) continue;
    const linkRe = /!?\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(f.content)) !== null) {
      const target = m[1].split("|")[0].split("#")[0].trim();
      const isEmbed = m[0].startsWith("!");
      const link: HostLink = { target };
      const resolved = resolvePath(target, path, fileMap);
      if (resolved) link.resolvedPath = resolved;
      if (isEmbed) {
        f.embeds.push(link);
      } else {
        f.outgoingLinks.push(link);
      }
    }
  }

  // Build backlinks
  const backlinksMap = new Map<string, string[]>();
  for (const [sourcePath, f] of fileMap) {
    for (const link of f.outgoingLinks) {
      const resolved = link.resolvedPath ??
        resolvePath(link.target, sourcePath, fileMap);
      if (resolved) {
        const bl = backlinksMap.get(resolved) ?? [];
        if (!bl.includes(sourcePath)) bl.push(sourcePath);
        backlinksMap.set(resolved, bl);
      }
    }
  }

  const tz = data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = data.locale ?? "en";

  const snapshot: QuerySnapshot = {
    nowMs: nowMs ?? Date.now(),
    timezone: tz,
    locale,
    randomSequence: [],
    randomIndex: 0,
  };

  function toHostFile(path: string): HostFile {
    const f = fileMap.get(path)!;
    const lastDot = f.name.lastIndexOf(".");
    const name = f.path.includes("/")
      ? f.path.substring(f.path.lastIndexOf("/") + 1)
      : f.path;
    return {
      path: f.path,
      name,
      basename: lastDot >= 0 ? name.substring(0, name.lastIndexOf(".")) : name,
      extension: lastDot >= 0 ? name.substring(name.lastIndexOf(".") + 1) : "",
      size: f.size,
      ctimeMs: f.ctimeMs,
      mtimeMs: f.mtimeMs,
    };
  }

  const host: BasesHostAdapter = {
    enumerateFiles(): HostFile[] {
      return [...fileMap.keys()].map(toHostFile);
    },

    getFile(path: string): HostFile | null {
      return fileMap.has(path) ? toHostFile(path) : null;
    },

    getFrontmatter(file: HostFile): Record<string, unknown> | null {
      return fileMap.get(file.path)?.frontmatter ?? null;
    },

    getPropertyTypes(file: HostFile): Record<string, HostPropertyType> {
      return fileMap.get(file.path)?.propertyTypes ?? {};
    },

    getTags(file: HostFile): string[] {
      return fileMap.get(file.path)?.tags ?? [];
    },

    getOutgoingLinks(file: HostFile): HostLink[] {
      return fileMap.get(file.path)?.outgoingLinks ?? [];
    },

    getBacklinks(file: HostFile): HostFile[] {
      const paths = backlinksMap.get(file.path) ?? [];
      return paths.map(toHostFile).filter((f) => f !== null);
    },

    getEmbeds(file: HostFile): HostLink[] {
      return fileMap.get(file.path)?.embeds ?? [];
    },

    resolveLink(target: string, sourcePath: string): HostFile | null {
      const resolved = resolvePath(target, sourcePath, fileMap);
      return resolved ? toHostFile(resolved) : null;
    },

    getDisplayContext(): HostFile | null {
      if (displayContextPath === undefined || displayContextPath === null) {
        return null;
      }
      return fileMap.has(displayContextPath)
        ? toHostFile(displayContextPath)
        : null;
    },

    now(): number {
      return snapshot.nowMs;
    },

    random(): number {
      return Math.random();
    },

    sanitizeHtml(input: string): string {
      return sanitizeHtmlBasic(input);
    },

    isSupportedIcon(name: string): boolean {
      return name.length > 0;
    },
  };

  return { host, snapshot };
}

function canonicalizeTag(tag: string): string {
  let t = tag.trim();
  if (t.startsWith("#")) t = t.slice(1);
  t = t.normalize("NFC");
  t = t.replace(/\/+/g, "/");
  if (t.endsWith("/")) t = t.slice(0, -1);
  return t;
}

function inferPropertyTypes(
  frontmatter: Record<string, unknown>,
): Record<string, HostPropertyType> {
  const result: Record<string, HostPropertyType> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    const inferred = inferPropertyType(value);
    if (inferred) result[key] = inferred;
  }
  return result;
}

function inferPropertyType(value: unknown): HostPropertyType | null {
  if (value instanceof Date) {
    const isDateOnly = value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    return isDateOnly ? "date" : "datetime";
  }
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "checkbox";
  if (Array.isArray(value)) return "list";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{8}$/.test(value)) {
      return "date";
    }
    if (
      /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value) || /^\d{12}$/.test(value)
    ) return "datetime";
    return "text";
  }
  return null;
}

function resolvePath(
  target: string,
  sourcePath: string,
  fileMap: Map<string, unknown>,
): string | undefined {
  const cleanTarget = target.replace(/^\[\[/, "").replace(/\]\]$/, "").split(
    "|",
  )[0].split("#")[0].trim();

  // Source-relative
  if (sourcePath.includes("/")) {
    const sourceFolder = sourcePath.substring(0, sourcePath.lastIndexOf("/"));
    const relativePath = `${sourceFolder}/${cleanTarget}`;
    if (fileMap.has(relativePath)) return relativePath;
    if (fileMap.has(`${relativePath}.md`)) return `${relativePath}.md`;
  }

  // Exact match
  if (fileMap.has(cleanTarget)) return cleanTarget;
  if (fileMap.has(`${cleanTarget}.md`)) return `${cleanTarget}.md`;

  // Basename fallback
  for (const path of fileMap.keys()) {
    const name = path.includes("/")
      ? path.substring(path.lastIndexOf("/") + 1)
      : path;
    const base = name.includes(".")
      ? name.substring(0, name.lastIndexOf("."))
      : name;
    if (base === cleanTarget) return path;
  }

  return undefined;
}
