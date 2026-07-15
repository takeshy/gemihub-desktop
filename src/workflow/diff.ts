export interface WorkflowDiffLine {
  type: "unchanged" | "added" | "removed";
  content: string;
  oldLine?: number;
  newLine?: number;
}

export function computeWorkflowLineDiff(before: string, after: string): WorkflowDiffLine[] {
  const oldLines = before.split("\n"), newLines = after.split("\n");
  const rows = oldLines.length + 1, columns = newLines.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint32Array(columns));
  for (let oldIndex = 1; oldIndex < rows; oldIndex++) for (let newIndex = 1; newIndex < columns; newIndex++) {
    lcs[oldIndex][newIndex] = oldLines[oldIndex - 1] === newLines[newIndex - 1]
      ? lcs[oldIndex - 1][newIndex - 1] + 1
      : Math.max(lcs[oldIndex][newIndex - 1], lcs[oldIndex - 1][newIndex]);
  }
  const reversed: WorkflowDiffLine[] = [];
  let oldIndex = oldLines.length, newIndex = newLines.length;
  while (oldIndex > 0 || newIndex > 0) {
    if (oldIndex > 0 && newIndex > 0 && oldLines[oldIndex - 1] === newLines[newIndex - 1]) {
      reversed.push({ type: "unchanged", content: oldLines[oldIndex - 1], oldLine: oldIndex, newLine: newIndex }); oldIndex--; newIndex--;
    } else if (newIndex > 0 && (oldIndex === 0 || lcs[oldIndex][newIndex - 1] >= lcs[oldIndex - 1][newIndex])) {
      reversed.push({ type: "added", content: newLines[newIndex - 1], newLine: newIndex }); newIndex--;
    } else {
      reversed.push({ type: "removed", content: oldLines[oldIndex - 1], oldLine: oldIndex }); oldIndex--;
    }
  }
  return reversed.reverse();
}

export function workflowDiffFeedback(lines: WorkflowDiffLine[], comments: Record<number, string>, general: string): string {
  const requests = lines.map((line, index) => ({ line, comment: comments[index]?.trim() })).filter((item) => item.comment).map(({ line, comment }) => {
    const location = line.type === "added" ? `new line ${line.newLine}` : line.type === "removed" ? `removed line ${line.oldLine}` : `line ${line.newLine || line.oldLine}`;
    return `${location} (${line.type}, ${JSON.stringify(line.content)}): ${comment}`;
  });
  return [general.trim(), requests.length ? `Line-specific feedback:\n${requests.map((item) => `- ${item}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
}
