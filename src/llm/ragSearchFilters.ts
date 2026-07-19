export interface RAGFilterRow { id: number; value: string }

export function filterTerms(value: string): string[] {
  return [...value.matchAll(/"([^"]+)"|(\S+)/g)].map((match) =>
    (match[1] || match[2]).toLowerCase()
  );
}

export function contentMatches(value: string, rows: RAGFilterRow[]): boolean {
  const haystack = value.toLowerCase();
  return rows.map((row) => filterTerms(row.value)).filter((terms) => terms.length)
    .every((terms) => terms.some((term) => haystack.includes(term)));
}
