import {
  decryptFileContent,
  encryptFileContent,
  encryptPrivateKey,
  generateKeyPair,
  getEncryptedFileMetadata,
  reencryptFileContent,
} from "./hybridEncryption";
import { deleteFile, readFile, writeFile } from "./wailsBackend";

export const ENCRYPTED_EXTENSION = ".encrypted";

export interface DecryptedWorkspaceFile {
  encryptedPath: string;
  originalPath: string;
  originalName: string;
  mimeType: string;
  content: string;
  encryptedContent: string;
}

const sessionPasswords = new Map<string, string>();

function fileName(path: string): string {
  return path.replace(/^(?:workspace|files):\/\//, "").split(/[\\/]/).pop() ||
    path;
}

function withoutEncryptedExtension(path: string): string {
  return path.toLowerCase().endsWith(ENCRYPTED_EXTENSION)
    ? path.slice(0, -ENCRYPTED_EXTENSION.length)
    : path;
}

function mimeFromContent(name: string, content: string): string {
  const dataMime = content.match(/^data:([^;,]+)/i)?.[1];
  if (dataMime) return dataMime;
  const extension = name.split(".").pop()?.toLowerCase() || "";
  return ({
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    yaml: "application/yaml",
    yml: "application/yaml",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    ts: "text/typescript",
    csv: "text/csv",
    pdf: "application/pdf",
    epub: "application/epub+zip",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  } as Record<string, string>)[extension] || "application/octet-stream";
}

export function rememberFilePassword(path: string, password: string): void {
  const key = path.replace(/^files:\/\//i, "");
  if (password) sessionPasswords.set(key, password);
  else sessionPasswords.delete(key);
}

export function rememberedFilePassword(path: string): string {
  return sessionPasswords.get(path.replace(/^files:\/\//i, "")) || "";
}

export function encryptedPathFor(path: string): string {
  return path.toLowerCase().endsWith(ENCRYPTED_EXTENSION)
    ? path
    : `${path}${ENCRYPTED_EXTENSION}`;
}

export async function encryptWorkspaceFile(
  path: string,
  password: string,
  extraMetadata: Record<string, string> = {},
  description = "",
): Promise<string> {
  const source = await readFile(path);
  if (!source) throw new Error(`File not found: ${path}`);
  const originalName = source.fileName || fileName(path);
  const keys = await generateKeyPair();
  const protectedKey = await encryptPrivateKey(keys.privateKey, password);
  const destination = encryptedPathFor(path);
  const encrypted = await encryptFileContent(
    source.content,
    keys.publicKey,
    protectedKey.encryptedPrivateKey,
    protectedKey.salt,
    {
      description,
      publicMetadata: {
        ...extraMetadata,
        originalName,
        mimeType: mimeFromContent(originalName, source.content),
        sourceKind: "workspace-file",
      },
    },
  );
  await writeFile(destination, encrypted);
  if (destination !== path) await deleteFile(path);
  rememberFilePassword(destination, password);
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  return destination;
}

export async function openEncryptedWorkspaceFile(
  path: string,
  password: string,
): Promise<DecryptedWorkspaceFile> {
  const source = await readFile(path);
  if (!source) throw new Error(`File not found: ${path}`);
  const metadata = getEncryptedFileMetadata(source.content).publicMetadata ||
    {};
  const fallbackPath = withoutEncryptedExtension(path);
  const originalName = metadata.originalName || fileName(fallbackPath);
  const content = await decryptFileContent(source.content, password);
  rememberFilePassword(path, password);
  return {
    encryptedPath: path,
    originalPath: fallbackPath,
    originalName,
    mimeType: metadata.mimeType || mimeFromContent(originalName, content),
    content,
    encryptedContent: source.content,
  };
}

export async function saveEncryptedWorkspaceFile(
  file: DecryptedWorkspaceFile,
  content: string,
  password: string,
): Promise<DecryptedWorkspaceFile> {
  const encryptedContent = await reencryptFileContent(
    file.encryptedContent,
    content,
    password,
  );
  await writeFile(file.encryptedPath, encryptedContent);
  rememberFilePassword(file.encryptedPath, password);
  return { ...file, content, encryptedContent };
}

export async function decryptWorkspaceFile(
  path: string,
  password: string,
): Promise<string> {
  const file = await openEncryptedWorkspaceFile(path, password);
  await writeFile(file.originalPath, file.content);
  await deleteFile(path);
  rememberFilePassword(path, "");
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  return file.originalPath;
}
