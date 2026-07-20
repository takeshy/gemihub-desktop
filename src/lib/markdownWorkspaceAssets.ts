import { readWorkspaceFile, writeWorkspaceBinaryFile } from "./wailsBackend";

function normalizedParts(path: string): string[] {
  return path.replaceAll("\\", "/").split("/").filter(Boolean);
}

export function workspaceRelativePath(
  sourceFilePath: string,
  targetPath: string,
): string {
  const source = normalizedParts(sourceFilePath);
  const target = normalizedParts(targetPath);
  source.pop();
  let shared = 0;
  while (
    shared < source.length && shared < target.length &&
    source[shared] === target[shared]
  ) shared++;
  return [
    ...Array(source.length - shared).fill(".."),
    ...target.slice(shared),
  ].join("/") || target.at(-1) || "";
}

export function workspacePathFromRelative(
  sourceFilePath: string,
  relativePath: string,
): string {
  const target = relativePath.replaceAll("\\", "/");
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const parts = normalizedParts(sourceFilePath);
  parts.pop();
  for (const part of normalizedParts(target)) {
    if (part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

export async function resolveWorkspaceMarkdownImage(
  sourceFilePath: string,
  url: string,
): Promise<string> {
  if (!url || /^(?:data:|blob:|https?:|\/\/)/i.test(url)) return url;
  const path = workspacePathFromRelative(sourceFilePath, url);
  const file = await readWorkspaceFile(path);
  return file?.content.startsWith("data:") ? file.content : url;
}

export async function uploadWorkspaceMarkdownImage(
  sourceFilePath: string,
  file: File,
): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  const safeName = file.name.replace(/[^\p{L}\p{N}_.-]+/gu, "-") || "image";
  const source = sourceFilePath.replaceAll("\\", "/");
  const slash = source.lastIndexOf("/");
  const directory = slash >= 0 ? source.slice(0, slash + 1) : "";
  const target = `${directory}attachments/${Date.now()}-${safeName}`;
  await writeWorkspaceBinaryFile(target, btoa(binary));
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  return workspaceRelativePath(sourceFilePath, target);
}
