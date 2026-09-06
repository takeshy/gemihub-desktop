type ContextFile = { path: string; content: string };

// Resolve from the visible attachments, never from the live editor content.
// The returned copy also keeps an in-flight turn stable if the editor changes.
export function attachedActiveFile(
  activePath: string | undefined,
  attachments: readonly ContextFile[],
): ContextFile | null {
  const file = attachments.find((item) => item.path === activePath);
  return file ? { path: file.path, content: file.content } : null;
}
