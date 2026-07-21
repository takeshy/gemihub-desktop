import type { PendingFileAction } from "../lib/wailsBackend";

function joinFileContent(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  return left.endsWith("\n") || right.startsWith("\n")
    ? left + right
    : `${left}\n${right}`;
}

export function proposedPendingFileContent(
  currentContent: string,
  action: PendingFileAction,
): string {
  const content = action.content ?? "";
  if (action.mode === "append") return joinFileContent(currentContent, content);
  if (action.mode === "prepend") {
    return joinFileContent(content, currentContent);
  }
  return content;
}
