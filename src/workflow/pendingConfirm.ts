import type { PendingFileAction } from "../lib/wailsBackend";
import { fileRefFromBackendPath } from "../lib/fileRef";
import { proposedPendingFileContent } from "../llm/pendingFileAction";
import { isEncryptedFile } from "../lib/hybridEncryption";
import type { WorkflowPromptRequest } from "./promptService";

export type ConfirmWriteRequest = Extract<
  WorkflowPromptRequest,
  { kind: "confirm-write" }
>;

/**
 * Turn a file action an AI proposed inside a command node into a review
 * request. Returns null when there is nothing for the user to decide: a write
 * whose result matches the file already on disk.
 */
export function pendingFileConfirmRequest(
  action: PendingFileAction,
  currentContent: string | null,
): ConfirmWriteRequest | null {
  const path = fileRefFromBackendPath(action.path).path;
  if (action.kind === "rename") {
    const newPath = action.newPath
      ? fileRefFromBackendPath(action.newPath).path
      : "";
    return {
      kind: "confirm-write",
      title: "Confirm file rename",
      path,
      mode: "rename",
      content: newPath,
    };
  }
  const current = currentContent ?? "";
  const proposed = proposedPendingFileContent(current, action);
  if (currentContent !== null && proposed === current) return null;
  return {
    kind: "confirm-write",
    title: "Confirm file write",
    path,
    mode: action.mode ?? "replace",
    content: proposed,
    // A ciphertext body would render as a diff of noise, so only offer the
    // before/after comparison for content the reviewer can actually read.
    originalContent: currentContent === null || isEncryptedFile(current)
      ? undefined
      : current,
  };
}
