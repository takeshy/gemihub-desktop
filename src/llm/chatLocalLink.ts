import { fileRef, type FileRef } from "../lib/fileRef";

const WORKSPACE_FILE_EXT =
  /\.(md|canvas|base|pdf|txt|csv|json|ya?ml|png|jpe?g|gif|webp|svg|mp[34]|m4a|mov|webm)$/i;

const BARE_HOST_PATH =
  /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i;

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
  return (insensitive ? head.toLowerCase() === root.toLowerCase() : head === root) &&
    target[root.length] === "/";
}

export function chatLocalFileRef(
  href: string,
  workspaceBase: string,
): FileRef | null {
  let target = decodeHref(href).trim();
  if (!target || target.startsWith("#")) return null;
  if (/^file:\/\//i.test(target)) target = stripFileScheme(target);
  else if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
    return null;
  }

  target = normalizedPath(target.split("#", 1)[0].trim()).replace(/^\.\//, "");
  if (!target) return null;
  if (!/^(?:[a-z]:\/|\/|\/\/)/i.test(target)) {
    if (BARE_HOST_PATH.test(target) && !WORKSPACE_FILE_EXT.test(target)) {
      return null;
    }
    return fileRef("workspace", target);
  }
  const root = normalizedPath(workspaceBase);
  return root && rootContains(target, root)
    ? fileRef("workspace", target.slice(root.length + 1))
    : fileRef("absolute", target);
}
