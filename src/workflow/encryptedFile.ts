import { type LocalFileResult, readWorkspaceFile } from "../lib/wailsBackend";
import {
  rememberedFilePassword,
  rememberFilePassword,
} from "../lib/fileEncryption";
import { fileRef } from "../lib/fileRef";
import {
  decryptFileContent,
  getEncryptedFileMetadata,
  isEncryptedFile,
} from "../lib/hybridEncryption";
import { requestWorkflowPrompt } from "./promptService";

export type WorkflowInteractionMode =
  | "panel"
  | "hotkey"
  | "event"
  | "headless";

export interface WorkflowWorkspaceFile extends LocalFileResult {
  encrypted: boolean;
  originalName?: string;
  mimeType?: string;
  encryption?: {
    sourceContent: string;
    password: string;
  };
}

interface WorkflowEncryptedFileDependencies {
  readFile?: (path: string) => Promise<LocalFileResult | null>;
  promptForPassword?: (title: string) => Promise<string | null>;
}

async function defaultPasswordPrompt(title: string): Promise<string | null> {
  return await requestWorkflowPrompt({
    kind: "password",
    title,
    message: "This Workspace file is encrypted.",
  }) as string | null;
}

export async function readWorkflowWorkspaceFile(
  path: string,
  interactionMode: WorkflowInteractionMode = "panel",
  dependencies: WorkflowEncryptedFileDependencies = {},
): Promise<WorkflowWorkspaceFile | null> {
  const file = await (dependencies.readFile || readWorkspaceFile)(path);
  if (!file) return null;
  if (!isEncryptedFile(file.content)) return { ...file, encrypted: false };

  if (interactionMode === "headless") {
    throw new Error(
      `Cannot read encrypted file in headless workflow: ${
        file.fileName || path
      }`,
    );
  }

  const encryptedRef = fileRef("workspace", path);
  let password = rememberedFilePassword(encryptedRef);
  if (password) {
    try {
      const content = await decryptFileContent(file.content, password);
      const metadata = getEncryptedFileMetadata(file.content).publicMetadata ||
        {};
      return {
        ...file,
        content,
        encrypted: true,
        originalName: metadata.originalName,
        mimeType: metadata.mimeType,
        encryption: { sourceContent: file.content, password },
      };
    } catch {
      rememberFilePassword(encryptedRef, "");
      password = "";
    }
  }

  password = await (dependencies.promptForPassword || defaultPasswordPrompt)(
    `Enter password for: ${file.fileName || path}`,
  ) || "";
  if (!password) {
    throw new Error(
      `Cannot read encrypted file without password: ${file.fileName || path}`,
    );
  }
  try {
    const content = await decryptFileContent(file.content, password);
    const metadata = getEncryptedFileMetadata(file.content).publicMetadata ||
      {};
    rememberFilePassword(encryptedRef, password);
    return {
      ...file,
      content,
      encrypted: true,
      originalName: metadata.originalName,
      mimeType: metadata.mimeType,
      encryption: { sourceContent: file.content, password },
    };
  } catch {
    throw new Error(
      `Failed to decrypt file (wrong password?): ${file.fileName || path}`,
    );
  }
}
