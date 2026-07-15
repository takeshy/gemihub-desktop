export interface ActiveSelection {
  path: string;
  text: string;
  start: number;
  end: number;
}

export function formatActiveSelection(selection: ActiveSelection): string {
  const metadata = [`file: ${selection.path}`];
  if (selection.start >= 0 && selection.end >= selection.start) {
    metadata.push(`start: ${selection.start}`, `end: ${selection.end}`);
  }
  return `[${metadata.join(", ")}]\n${selection.text}`;
}
