export interface HostPatchFile {
  relativePath: string;
  content: string;
}

export interface HostPatchManifest {
  hostPatches?: Record<string, string[]>;
}

interface PatchHunk {
  oldStart: number;
  oldCount: number;
  lines: string[];
}

interface FilePatch {
  oldFileName: string;
  newFileName: string;
  hunks: PatchHunk[];
}

export interface ApplyHostPatchesOptions {
  protectedPaths?: string[];
}

function unsafePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return /^(?:\/|[a-z]:\/)/i.test(normalized) || normalized.split("/").some((part) => part === "." || part === "..");
}

function safeRootID(id: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(id) && id !== "." && id !== "..";
}

function patchHeaderPath(line: string): string {
  const value = line.slice(4).trim();
  if (!value) return "";
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) as string; } catch { return ""; }
  }
  return value.split("\t", 1)[0].trim();
}

function parseUnifiedDiff(content: string): FilePatch[] {
  const lines = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const patches: FilePatch[] = [];
  const isFileHeader = (at: number) => at + 1 < lines.length && lines[at].startsWith("--- ") && lines[at + 1].startsWith("+++ ");
  let index = 0;
  while (index < lines.length) {
    if (!isFileHeader(index)) {
      index++;
      continue;
    }
    const patch: FilePatch = {
      oldFileName: patchHeaderPath(lines[index]),
      newFileName: patchHeaderPath(lines[index + 1]),
      hunks: [],
    };
    index += 2;
    while (index < lines.length && !isFileHeader(index)) {
      const match = lines[index].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) { index++; continue; }
      const hunk: PatchHunk = {
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        lines: [],
      };
      index++;
      while (index < lines.length && !lines[index].startsWith("@@ ") && !isFileHeader(index)) {
        const line = lines[index];
        if (line.startsWith(" ") || line.startsWith("+") || line.startsWith("-") || line === "\\ No newline at end of file") {
          hunk.lines.push(line);
        }
        index++;
      }
      patch.hunks.push(hunk);
    }
    if (!patch.oldFileName || !patch.newFileName || patch.hunks.length === 0) throw new Error("invalid unified diff file section");
    patches.push(patch);
  }
  if (patches.length === 0) throw new Error("patch does not contain a unified diff");
  return patches;
}

function normalizePatchTarget(rootID: string, rawPath: string): string | null {
  if (!safeRootID(rootID) || !rawPath || rawPath === "/dev/null") return null;
  let normalized = rawPath.replaceAll("\\", "/").replace(/^\/?[ab]\//, "").replace(/^\/+/, "");
  if (unsafePath(normalized)) return null;
  for (const prefix of [`skills/${rootID}/`, `plugins/${rootID}/`, `${rootID}/`]) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }
  if (!normalized || unsafePath(normalized)) return null;
  return `${rootID}/${normalized}`;
}

function contentLines(content: string): { lines: string[]; trailingNewline: boolean } {
  const normalized = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized === "" ? [] : normalized.slice(0, trailingNewline ? -1 : undefined).split("\n");
  return { lines, trailingNewline };
}

function applyFilePatch(source: string, patch: FilePatch): string {
  const parsed = contentLines(source);
  const lines = [...parsed.lines];
  let offset = 0;
  for (const hunk of patch.hunks) {
    const start = Math.max(0, hunk.oldStart - 1 + offset);
    const oldLines: string[] = [];
    const newLines: string[] = [];
    for (const line of hunk.lines) {
      if (line === "\\ No newline at end of file") continue;
      const marker = line[0];
      const value = line.slice(1);
      if (marker === " " || marker === "-") oldLines.push(value);
      if (marker === " " || marker === "+") newLines.push(value);
    }
    if (oldLines.length !== hunk.oldCount || lines.slice(start, start + oldLines.length).some((line, i) => line !== oldLines[i])) {
      throw new Error(`hunk did not match at source line ${hunk.oldStart}`);
    }
    lines.splice(start, oldLines.length, ...newLines);
    offset += newLines.length - oldLines.length;
  }
  const trailingNewline = source === "" ? true : parsed.trailingNewline;
  return lines.join("\n") + (trailingNewline && lines.length ? "\n" : "");
}

/** Apply host-specific unified diffs without allowing reads or writes outside rootID/. */
export function applyHostPatches(
  rootID: string,
  files: HostPatchFile[],
  manifest: HostPatchManifest,
  hostID: string,
  options: ApplyHostPatchesOptions = {},
): { files: HostPatchFile[]; applied: string[]; error?: string } {
  const patchPaths = manifest.hostPatches?.[hostID] ?? [];
  if (!patchPaths.length) return { files, applied: [] };
  const nextFiles = files.map((file) => ({ ...file, relativePath: file.relativePath.replaceAll("\\", "/") }));
  const protectedPaths = new Set((options.protectedPaths ?? []).map((path) => `${rootID}/${path.replace(/^\/+/, "")}`));
  const applied: string[] = [];

  try {
    for (const patchPath of patchPaths) {
      if (unsafePath(patchPath)) throw new Error(`unsafe patch path: ${patchPath}`);
      const normalizedPatchPath = `${rootID}/${patchPath.replaceAll("\\", "/").replace(/^\/+/, "")}`;
      const patchFile = nextFiles.find((file) => file.relativePath === normalizedPatchPath);
      if (!patchFile) throw new Error(`patch file not found: ${patchPath}`);

      for (const patch of parseUnifiedDiff(patchFile.content)) {
        const rawTarget = patch.newFileName !== "/dev/null" ? patch.newFileName : patch.oldFileName;
        const targetPath = normalizePatchTarget(rootID, rawTarget);
        if (!targetPath) throw new Error(`unsafe patch target: ${rawTarget}`);
        if (protectedPaths.has(targetPath)) throw new Error(`patch target is protected: ${targetPath.slice(rootID.length + 1)}`);
        const targetIndex = nextFiles.findIndex((file) => file.relativePath === targetPath);
        const source = targetIndex < 0 ? "" : nextFiles[targetIndex].content;
        const patched = applyFilePatch(source, patch);
        if (patch.newFileName === "/dev/null") {
          if (targetIndex >= 0) nextFiles.splice(targetIndex, 1);
        } else if (targetIndex < 0) {
          nextFiles.push({ relativePath: targetPath, content: patched });
        } else {
          nextFiles[targetIndex] = { ...nextFiles[targetIndex], content: patched };
        }
      }
      applied.push(patchPath);
    }
    return { files: nextFiles, applied };
  } catch (error) {
    return { files, applied: [], error: error instanceof Error ? error.message : String(error) };
  }
}
