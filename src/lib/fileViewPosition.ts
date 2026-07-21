export interface FileViewPosition {
  key: string;
  targetPath: number[] | "frame";
  top: number;
  ratio: number;
  anchor?: FileViewAnchor;
}

export type FileViewAnchor =
  | { kind: "pdf-page"; page: number; offset: number }
  | { kind: "text-line"; line: number };

function parseAnchor(value: unknown): FileViewAnchor | undefined {
  if (!value || typeof value !== "object") return undefined;
  const anchor = value as Partial<FileViewAnchor> & Record<string, unknown>;
  if (
    anchor.kind === "pdf-page" && typeof anchor.page === "number" &&
    Number.isInteger(anchor.page) && anchor.page > 0 &&
    typeof anchor.offset === "number" && Number.isFinite(anchor.offset)
  ) {
    return {
      kind: "pdf-page",
      page: anchor.page,
      offset: Math.max(0, Math.min(1, anchor.offset)),
    };
  }
  if (
    anchor.kind === "text-line" && typeof anchor.line === "number" &&
    Number.isFinite(anchor.line) && anchor.line >= 0
  ) return { kind: "text-line", line: anchor.line };
  return undefined;
}

export function parseFileViewPosition(
  raw: string | null,
  key: string,
): FileViewPosition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FileViewPosition>;
    const targetPath = value.targetPath;
    if (
      value.key !== key ||
      (targetPath !== "frame" &&
        (!Array.isArray(targetPath) ||
          targetPath.some((index) => !Number.isInteger(index) || index < 0))) ||
      typeof value.top !== "number" || !Number.isFinite(value.top) ||
      typeof value.ratio !== "number" || !Number.isFinite(value.ratio)
    ) return null;
    return {
      key,
      targetPath,
      top: Math.max(0, value.top),
      ratio: Math.max(0, Math.min(1, value.ratio)),
      anchor: parseAnchor(value.anchor),
    };
  } catch {
    return null;
  }
}

export function restoredScrollTop(
  position: Pick<FileViewPosition, "top" | "ratio">,
  maxScrollTop: number,
): number {
  return maxScrollTop > 0
    ? Math.round(Math.max(0, Math.min(1, position.ratio)) * maxScrollTop)
    : Math.max(0, position.top);
}
