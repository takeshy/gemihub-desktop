import { fileRef, readFileRef, renameFileRef, writeFileRef } from "./fileRef";
import { memoFileNameFor } from "./memoPath";
import { parseMemoFile } from "./memoTimeline";
import { listWorkspaceFiles } from "./wailsBackend";

export interface MemoPathMove {
  sourcePaths: string[];
  destinationPath: string;
  isDirectory: boolean;
}

function normalizedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

export function relocatedMemoSource(
  source: string,
  moves: MemoPathMove[],
): string | null {
  const normalizedSource = normalizedPath(source);
  for (const move of moves) {
    const destination = normalizedPath(move.destinationPath);
    for (const candidate of move.sourcePaths) {
      const normalizedCandidate = normalizedPath(candidate);
      const matches = move.isDirectory
        ? normalizedSource === normalizedCandidate ||
          normalizedSource.startsWith(`${normalizedCandidate}/`)
        : normalizedSource === normalizedCandidate;
      if (!matches) continue;
      return `${destination}${
        normalizedSource.slice(normalizedCandidate.length)
      }`;
    }
  }
  return null;
}

export function replaceMemoSource(content: string, source: string): string {
  if (!content.startsWith("---")) return content;
  const closing = content.indexOf("\n---", 3);
  if (closing < 0) return content;
  const frontmatter = content.slice(0, closing);
  if (!/^source:[ \t]*.*$/m.test(frontmatter)) return content;
  return `${frontmatter.replace(/^source:[ \t]*.*$/m, `source: ${source}`)}${
    content.slice(closing)
  }`;
}

export async function relocateWorkspaceMemos(
  moves: MemoPathMove[],
): Promise<void> {
  if (!moves.length) return;
  const entries = await listWorkspaceFiles();
  for (const entry of entries) {
    if (entry.binary || !/^Memos\/[^/]+\.md$/i.test(entry.path)) continue;
    const oldRef = fileRef("workspace", entry.path);
    const result = await readFileRef(oldRef);
    if (!result) continue;
    const oldSource = parseMemoFile(result.content).source;
    const newSource = relocatedMemoSource(oldSource, moves);
    if (!newSource || newSource === oldSource) continue;
    const nextPath = `Memos/${memoFileNameFor(newSource)}`;
    const nextRef = fileRef("workspace", nextPath);
    if (nextPath !== entry.path) await renameFileRef(oldRef, nextRef);
    await writeFileRef(nextRef, replaceMemoSource(result.content, newSource));
  }
}
