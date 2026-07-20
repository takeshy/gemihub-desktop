import {
  decryptFileContent,
  encryptFileContent,
  encryptPrivateKey,
  generateKeyPair,
  getEncryptedFileMetadata,
  reencryptFileContent,
} from "./hybridEncryption";
import {
  deleteFileRef,
  type FileRef,
  fileRef,
  readFileRef,
  writeFileRef,
} from "./fileRef";

export const ENCRYPTED_EXTENSION = ".encrypted";

export interface DecryptedWorkspaceFile {
  encryptedFile: FileRef;
  originalFile: FileRef;
  originalName: string;
  mimeType: string;
  content: string;
  encryptedContent: string;
}

const sessionPasswords = new Map<string, string>();

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
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

function passwordKey(file: FileRef): string {
  return `${file.scope}:${file.path}`;
}

export function rememberFilePassword(file: FileRef, password: string): void {
  const key = passwordKey(file);
  if (password) sessionPasswords.set(key, password);
  else sessionPasswords.delete(key);
}

export function rememberedFilePassword(file: FileRef): string {
  return sessionPasswords.get(passwordKey(file)) || "";
}

export function encryptedPathFor(path: string): string {
  return path.toLowerCase().endsWith(ENCRYPTED_EXTENSION)
    ? path
    : `${path}${ENCRYPTED_EXTENSION}`;
}

export async function encryptWorkspaceFile(
  sourceFile: FileRef,
  password: string,
  extraMetadata: Record<string, string> = {},
  description = "",
): Promise<FileRef> {
  const source = await readFileRef(sourceFile);
  if (!source) throw new Error(`File not found: ${sourceFile.path}`);
  const originalName = source.fileName || fileName(sourceFile.path);
  const keys = await generateKeyPair();
  const protectedKey = await encryptPrivateKey(keys.privateKey, password);
  const destination = fileRef(
    sourceFile.scope,
    encryptedPathFor(sourceFile.path),
  );
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
  await writeFileRef(destination, encrypted);
  if (destination.path !== sourceFile.path) await deleteFileRef(sourceFile);
  rememberFilePassword(destination, password);
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  return destination;
}

export async function openEncryptedWorkspaceFile(
  encryptedFile: FileRef,
  password: string,
): Promise<DecryptedWorkspaceFile> {
  const source = await readFileRef(encryptedFile);
  if (!source) throw new Error(`File not found: ${encryptedFile.path}`);
  const metadata = getEncryptedFileMetadata(source.content).publicMetadata ||
    {};
  const fallbackPath = withoutEncryptedExtension(encryptedFile.path);
  const originalName = metadata.originalName || fileName(fallbackPath);
  const content = await decryptFileContent(source.content, password);
  rememberFilePassword(encryptedFile, password);
  return {
    encryptedFile,
    originalFile: fileRef(encryptedFile.scope, fallbackPath),
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
  await writeFileRef(file.encryptedFile, encryptedContent);
  rememberFilePassword(file.encryptedFile, password);
  return { ...file, content, encryptedContent };
}

export async function decryptWorkspaceFile(
  encryptedFile: FileRef,
  password: string,
): Promise<FileRef> {
  const file = await openEncryptedWorkspaceFile(encryptedFile, password);
  await writeFileRef(file.originalFile, file.content);
  await deleteFileRef(encryptedFile);
  rememberFilePassword(encryptedFile, "");
  window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  return file.originalFile;
}
