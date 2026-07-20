import {
  createDirectory,
  createWorkspaceDirectory,
  deleteFile,
  deleteWorkspaceFile,
  duplicateFile,
  listFileHistory,
  openContainingFolder,
  openExternalEditor,
  openHTMLInBrowser,
  openLocalFileDefault,
  openWorkspaceFileDefault,
  readFile,
  readLocalFile,
  readWorkspaceFile,
  renameFile,
  renameWorkspaceFile,
  restoreFileHistory,
  saveHTMLExport,
  trashFile,
  writeFile,
  writeWorkspaceFile,
} from "./wailsBackend";
import type { LocalFileResult } from "./wailsBackend";
import type { FileHistoryEntry } from "./wailsBackend";

export type FileScope = "workspace" | "files" | "absolute";

export interface FileRef {
  scope: FileScope;
  path: string;
}

export function fileRef(scope: FileScope, path: string): FileRef {
  return { scope, path: path.trim().replaceAll("\\", "/") };
}

export function isFileRef(value: unknown): value is FileRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.scope === "workspace" || record.scope === "files" ||
    record.scope === "absolute") && typeof record.path === "string";
}

export async function readFileRef(
  ref: FileRef,
): Promise<LocalFileResult | null> {
  if (!ref.path) return null;
  if (ref.scope === "workspace") return await readWorkspaceFile(ref.path);
  if (ref.scope === "absolute") return await readLocalFile(ref.path);
  return await readFile(`files://${ref.path}`);
}

export async function writeFileRef(
  ref: FileRef,
  content: string,
): Promise<void> {
  if (ref.scope === "workspace") {
    await writeWorkspaceFile(ref.path, content);
    return;
  }
  if (ref.scope === "absolute") {
    throw new Error("Absolute files are read-only in this context.");
  }
  await writeFile(`files://${ref.path}`, content);
}

function filesBackendPath(ref: FileRef): string {
  if (ref.scope !== "files") {
    throw new Error(`Expected a Files reference, got ${ref.scope}.`);
  }
  return `files://${ref.path}`;
}

export function fileRefBackendPath(ref: FileRef): string {
  if (ref.scope === "workspace") return `workspace://${ref.path}`;
  if (ref.scope === "files") return filesBackendPath(ref);
  return ref.path;
}

export function fileRefFromBackendPath(path: string): FileRef {
  const workspacePrefix = "workspace" + "://";
  const filesPrefix = "files" + "://";
  if (path.toLowerCase().startsWith(workspacePrefix)) {
    return fileRef("workspace", path.slice(workspacePrefix.length));
  }
  if (path.toLowerCase().startsWith(filesPrefix)) {
    return fileRef("files", path.slice(filesPrefix.length));
  }
  return fileRef(
    /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path) ? "absolute" : "files",
    path,
  );
}

export async function createDirectoryRef(ref: FileRef): Promise<void> {
  if (ref.scope === "workspace") {
    await createWorkspaceDirectory(ref.path);
    return;
  }
  if (ref.scope === "files") {
    await createDirectory(filesBackendPath(ref));
    return;
  }
  throw new Error("Cannot create a directory from an absolute file reference.");
}

export async function renameFileRef(from: FileRef, to: FileRef): Promise<void> {
  if (from.scope !== to.scope) {
    throw new Error("Cannot rename across file scopes.");
  }
  if (from.scope === "workspace") {
    await renameWorkspaceFile(from.path, to.path);
    return;
  }
  if (from.scope === "files") {
    await renameFile(filesBackendPath(from), filesBackendPath(to));
    return;
  }
  throw new Error("Absolute file rename is not supported here.");
}

export async function trashFileRef(ref: FileRef): Promise<void> {
  await trashFile(
    ref.scope === "workspace"
      ? `workspace://${ref.path}`
      : filesBackendPath(ref),
  );
}

export async function deleteFileRef(ref: FileRef): Promise<void> {
  if (ref.scope === "workspace") {
    await deleteWorkspaceFile(ref.path);
    return;
  }
  if (ref.scope === "files") {
    await deleteFile(filesBackendPath(ref));
    return;
  }
  throw new Error("Absolute file deletion is not supported here.");
}

export async function duplicateFileRef(ref: FileRef): Promise<string> {
  const duplicated = await duplicateFile(
    ref.scope === "workspace"
      ? `workspace://${ref.path}`
      : filesBackendPath(ref),
  );
  return fileRefFromBackendPath(duplicated).path;
}

export async function listFileHistoryRef(
  ref: FileRef,
): Promise<FileHistoryEntry[]> {
  return await listFileHistory(
    ref.scope === "workspace"
      ? `workspace://${ref.path}`
      : filesBackendPath(ref),
  );
}

export async function restoreFileHistoryRef(
  ref: FileRef,
  entryId: string,
): Promise<void> {
  await restoreFileHistory(
    ref.scope === "workspace"
      ? `workspace://${ref.path}`
      : filesBackendPath(ref),
    entryId,
  );
}

export async function openContainingFolderRef(ref: FileRef): Promise<void> {
  await openContainingFolder(
    ref.scope === "workspace"
      ? `workspace://${ref.path}`
      : ref.scope === "files"
      ? filesBackendPath(ref)
      : ref.path,
  );
}

export async function openFileRefDefault(ref: FileRef): Promise<void> {
  if (ref.scope === "workspace") {
    await openWorkspaceFileDefault(ref.path);
    return;
  }
  await openLocalFileDefault(
    ref.scope === "files" ? `files://${ref.path}` : ref.path,
  );
}

export async function saveHTMLExportRef(
  ref: FileRef,
  htmlContent: string,
): Promise<string> {
  const path = ref.scope === "workspace"
    ? `workspace://${ref.path}`
    : ref.scope === "files"
    ? filesBackendPath(ref)
    : ref.path;
  return await saveHTMLExport(path, htmlContent);
}

export async function openHTMLFileRefInBrowser(ref: FileRef): Promise<void> {
  const path = ref.scope === "workspace"
    ? `workspace://${ref.path}`
    : ref.scope === "files"
    ? filesBackendPath(ref)
    : ref.path;
  await openHTMLInBrowser(path);
}

export async function openFileRefInExternalEditor(
  editorPath: string,
  ref: FileRef,
): Promise<void> {
  const path = ref.scope === "workspace"
    ? `workspace://${ref.path}`
    : ref.scope === "files"
    ? filesBackendPath(ref)
    : ref.path;
  await openExternalEditor(editorPath, path);
}

export type FilePathPlatform = "windows" | "posix";

function currentFilePathPlatform(): FilePathPlatform {
  if (typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent)) {
    return "windows";
  }
  return "posix";
}

export function sameFileRef(
  left: FileRef,
  right: FileRef,
  platform: FilePathPlatform = currentFilePathPlatform(),
): boolean {
  if (left.scope !== right.scope) return false;
  const normalize = (value: string) => value.trim().replaceAll("\\", "/");
  const leftPath = normalize(left.path);
  const rightPath = normalize(right.path);
  return left.scope === "absolute" && platform === "windows"
    ? leftPath.toLocaleLowerCase() === rightPath.toLocaleLowerCase()
    : leftPath === rightPath;
}
