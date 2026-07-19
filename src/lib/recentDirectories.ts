export const MAX_RECENT_DIRECTORIES = 8;

function directoryKey(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLocaleLowerCase();
}

export function updateRecentDirectories(
  current: string[],
  path: string,
  limit = MAX_RECENT_DIRECTORIES,
): string[] {
  const nextPath = path.trim().replace(/[\\/]+$/, "");
  if (!nextPath) return current;
  const key = directoryKey(nextPath);
  return [nextPath, ...current.filter((item) => directoryKey(item) !== key)]
    .slice(0, Math.max(1, limit));
}

export function parseRecentDirectories(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.reduce<string[]>((items, item) =>
      typeof item === "string" ? updateRecentDirectories(items, item) : items, []
    ).reverse();
  } catch {
    return [];
  }
}
