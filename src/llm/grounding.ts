import type { RAGSearchResult } from "../lib/wailsBackend";

export interface GroundingSource {
  path: string;
  pageLabel?: string;
  score?: number;
}

export function groundingSources(results: RAGSearchResult[]): GroundingSource[] {
  const seen = new Set<string>();
  const sources: GroundingSource[] = [];
  for (const result of results) {
    const key = `${result.filePath}\n${result.pageLabel || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      path: result.filePath,
      pageLabel: result.pageLabel || undefined,
      score: Number.isFinite(result.score) ? result.score : undefined,
    });
  }
  return sources;
}

export function groundingSourceLabel(source: GroundingSource): string {
  const name = source.path.split(/[\\/]/).pop() || source.path;
  return source.pageLabel ? `${name} · ${source.pageLabel}` : name;
}
