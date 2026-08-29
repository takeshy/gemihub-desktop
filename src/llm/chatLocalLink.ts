import { type FileRef, fileRef } from "../lib/fileRef";

const WORKSPACE_FILE_EXT =
  /\.(md|canvas|base|pdf|txt|csv|json|ya?ml|png|jpe?g|gif|webp|svg|mp[34]|m4a|mov|webm)$/i;

const BARE_HOST = /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?=[/?]|$)/i;

const HOST_TLD =
  /\.(com|net|org|io|dev|app|ai|co|me|tv|cloud|site|online|info|biz|xyz|news|blog|gov|edu|jp|us|uk|de|fr|cn|kr)$/i;

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function stripFileScheme(value: string): string {
  const rest = value.replace(/^file:\/\//i, "");
  if (/^\/[a-z]:[\\/]/i.test(rest)) return rest.slice(1);
  if (rest.startsWith("/")) return rest;
  return `//${rest}`;
}

function normalizedPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function rootContains(target: string, root: string): boolean {
  const insensitive = /^(?:[a-z]:\/|\/\/)/i.test(root);
  const head = target.slice(0, root.length);
  return (insensitive
    ? head.toLowerCase() === root.toLowerCase()
    : head === root) &&
    target[root.length] === "/";
}

// A relative target is only a host reference when it looks like one structurally:
// a www. prefix, a path or query after the host, or a domain-like suffix. A bare
// file name such as main.go or App.tsx matches the host shape but is a file.
function looksLikeBareHost(target: string): boolean {
  const match = BARE_HOST.exec(target);
  if (!match) return false;
  if (WORKSPACE_FILE_EXT.test(target)) return false;
  const host = match[0].replace(/:\d+$/, "");
  if (/^www\./i.test(host)) return true;
  if (match[0].length < target.length) return true;
  return HOST_TLD.test(host);
}

function isAbsoluteTarget(target: string): boolean {
  return /^(?:[a-z]:\/|\/|\/\/)/i.test(target);
}

function localTarget(href: string): string | null {
  let target = href.trim();
  if (!target || target.startsWith("#")) return null;
  if (/^file:\/\//i.test(target)) target = stripFileScheme(target);
  else if (
    /^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)
  ) {
    return null;
  }
  // Drop the fragment before decoding so that an encoded %23 stays in the name.
  target = normalizedPath(decodeHref(target.split("#", 1)[0].trim()))
    .replace(/^\.\//, "");
  return target || null;
}

export function chatLocalFileRef(
  href: string,
  workspaceBase: string,
): FileRef | null {
  const target = localTarget(href);
  if (!target) return null;
  if (!isAbsoluteTarget(target)) {
    return looksLikeBareHost(target) ? null : fileRef("workspace", target);
  }
  const root = normalizedPath(workspaceBase);
  return root && rootContains(target, root)
    ? fileRef("workspace", target.slice(root.length + 1))
    : fileRef("absolute", target);
}

// Scheme-less host links (example.com/a) render as local-document buttons, so the
// chat has to open them itself instead of leaving a dead link behind.
export function chatExternalUrl(href: string): string | null {
  const target = localTarget(href);
  if (!target || isAbsoluteTarget(target) || !looksLikeBareHost(target)) {
    return null;
  }
  return `https://${href.trim()}`;
}
