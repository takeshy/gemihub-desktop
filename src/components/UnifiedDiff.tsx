export interface UnifiedDiffLine {
  type: "unchanged" | "added" | "removed";
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

export function buildUnifiedLineDiff(
  before: string,
  after: string,
): UnifiedDiffLine[] {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const table = Array.from(
    { length: oldLines.length + 1 },
    () => Array(newLines.length + 1).fill(0) as number[],
  );
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex--) {
      table[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(
          table[oldIndex + 1][newIndex],
          table[oldIndex][newIndex + 1],
        );
    }
  }

  const result: UnifiedDiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      result.push({
        type: "unchanged",
        content: oldLines[oldIndex],
        oldLineNum: ++oldIndex,
        newLineNum: ++newIndex,
      });
    } else if (
      table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]
    ) {
      result.push({
        type: "removed",
        content: oldLines[oldIndex],
        oldLineNum: ++oldIndex,
        newLineNum: null,
      });
    } else {
      result.push({
        type: "added",
        content: newLines[newIndex],
        oldLineNum: null,
        newLineNum: ++newIndex,
      });
    }
  }
  while (oldIndex < oldLines.length) {
    result.push({
      type: "removed",
      content: oldLines[oldIndex],
      oldLineNum: ++oldIndex,
      newLineNum: null,
    });
  }
  while (newIndex < newLines.length) {
    result.push({
      type: "added",
      content: newLines[newIndex],
      oldLineNum: null,
      newLineNum: ++newIndex,
    });
  }
  return result;
}

export function UnifiedDiff({ before, after }: {
  before: string;
  after: string;
}) {
  const lines = buildUnifiedLineDiff(before, after);
  const additions = lines.filter((line) => line.type === "added").length;
  const deletions = lines.filter((line) => line.type === "removed").length;
  return (
    <div className="unified-diff">
      <header>
        <strong>Changes</strong>
        <span className="added">+{additions}</span>
        <span className="removed">-{deletions}</span>
      </header>
      <pre className="history-diff-pre">
        {lines.map((line, index) => (
          <div key={index} className={`history-diff-line ${line.type}`}>
            <span className="history-diff-num">{line.oldLineNum ?? ""}</span>
            <span className="history-diff-num">{line.newLineNum ?? ""}</span>
            <span className="history-diff-sign">
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            <span className="history-diff-text">{line.content || " "}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}
