import { isWindowsPath } from "./memoPath";

export const IMAGE_EXT_RE = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

export function transformWikiLinks(body: string): string {
  return body
    .replace(
      /!\[\[([^\]\n]+)\]\]/g,
      (_match, target: string) =>
        `![${target}](#wikiembed:${encodeURIComponent(target)})`,
    )
    .replace(
      /(^|[^!])\[\[([^\]\n]+)\]\]/g,
      (_match, lead: string, target: string) => {
        const label = target.split("|")[1]?.trim() ||
          target.split("|")[0].trim();
        return `${lead}[${label}](#wiki:${encodeURIComponent(target)})`;
      },
    );
}

export function wikiTargetToPath(baseDirPath: string, target: string): string {
  const clean = target.split("|")[0].split("#")[0].trim();
  return localTargetToPath(baseDirPath, clean);
}

export function wikiEmbedPathCandidates(
  baseDirPath: string,
  src: string,
): string[] {
  const marker = /^#wiki(?:embed)?:/.exec(src)?.[0] ?? "";
  const target = marker
    ? safeDecodeURIComponent(src.slice(marker.length))
    : src;
  return [
    wikiTargetToPath("", target),
    wikiTargetToPath(baseDirPath, target),
  ].filter((path, index, paths) => path && paths.indexOf(path) === index);
}

export function localTargetToPath(baseDirPath: string, target: string): string {
  const clean = target.split("#")[0].trim();
  if (!clean) return "";
  const windows = isWindowsPath(baseDirPath) || isWindowsPath(clean);
  if (
    clean.startsWith("/") || isWindowsPath(clean) || clean.startsWith("\\\\")
  ) {
    return /\.[A-Za-z0-9]+$/.test(clean) ? clean : `${clean}.md`;
  }
  const withExt = /\.[A-Za-z0-9]+$/.test(clean) ? clean : `${clean}.md`;
  const separator = windows ? "\\" : "/";
  if (!baseDirPath) return withExt;
  const trimmed = baseDirPath.endsWith("/") || baseDirPath.endsWith("\\")
    ? baseDirPath.slice(0, -1)
    : baseDirPath;
  return `${trimmed}${separator}${withExt}`;
}

export function localHrefToPathCandidates(
  baseDirPath: string,
  href: string,
): string[] {
  const target = hrefToLocalTarget(href);
  const clean = target.split("#")[0].trim();
  if (!clean) return [];
  if (
    clean.startsWith("/") && !isWindowsPath(clean) && !clean.startsWith("\\\\")
  ) {
    const rootTarget = clean.replace(/^\/+/, "");
    const ancestorTargets: string[] = [];
    if (/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(baseDirPath)) {
      let ancestor = baseDirPath.replace(/[\\/]+$/, "");
      while (ancestor) {
        ancestorTargets.push(localTargetToPath(ancestor, rootTarget));
        const parent = pathDirName(ancestor);
        if (!parent || parent === ancestor) break;
        ancestor = parent;
      }
    }
    return [
      localTargetToPath("", rootTarget),
      localTargetToPath(baseDirPath, rootTarget),
      ...ancestorTargets,
    ]
      .filter((path, index, paths) => path && paths.indexOf(path) === index);
  }
  return [localTargetToPath(baseDirPath, clean)];
}

export function isLocalDocumentHref(href: string): boolean {
  if (!href) return false;
  const decoded = safeDecodeURIComponent(href);
  if (isWindowsPath(decoded) || /^file:\/\//i.test(decoded)) return true;
  if (href.startsWith("#wiki:") || href.startsWith("#wikiembed:")) return true;
  if (href.startsWith("#")) return false;
  if (href.startsWith("//")) return false;
  if (/^https?:\/\/wails\.localhost(?::\d+)?\//i.test(href)) return true;
  return !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href);
}

export function hrefToLocalTarget(href: string): string {
  if (/^file:\/\//i.test(href)) {
    try {
      const pathname = decodeURIComponent(new URL(href).pathname);
      return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
    } catch {
      return safeDecodeURIComponent(href.replace(/^file:\/+/i, ""));
    }
  }
  if (/^https?:\/\/wails\.localhost(?::\d+)?\//i.test(href)) {
    try {
      return decodeURIComponent(new URL(href).pathname);
    } catch {
      return href;
    }
  }
  return safeDecodeURIComponent(href);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function pathDirName(path: string): string {
  const separatorIndex = Math.max(
    path.lastIndexOf("/"),
    path.lastIndexOf("\\"),
  );
  return separatorIndex === -1 ? "" : path.slice(0, separatorIndex);
}
