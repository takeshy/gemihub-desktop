import type { FileRef } from "../lib/fileRef";
import { hrefToLocalTarget, isLocalDocumentHref } from "../lib/wikiLinks";

function normalizedPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function chatLinkFileRef(
  href: string,
  workspaceBase: string,
): FileRef | null {
  if (!isLocalDocumentHref(href)) return null;
  const target = normalizedPath(hrefToLocalTarget(href).split("#")[0].trim());
  if (!target) return null;

  const absolute = /^(?:[a-z]:\/|\/|\/\/)/i.test(target);
  if (!absolute) {
    return { scope: "workspace", path: target.replace(/^\.\//, "") };
  }

  const root = normalizedPath(workspaceBase);
  const foldedTarget = target.toLocaleLowerCase();
  const foldedRoot = root.toLocaleLowerCase();
  if (
    root &&
    (foldedTarget === foldedRoot || foldedTarget.startsWith(`${foldedRoot}/`))
  ) {
    return {
      scope: "workspace",
      path: target.slice(root.length).replace(/^\/+/, ""),
    };
  }
  return { scope: "absolute", path: target };
}
