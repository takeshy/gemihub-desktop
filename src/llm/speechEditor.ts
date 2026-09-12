export interface SpeechEditorChange {
  text: string;
  start: number;
  end: number;
}

export function speechEditorCommand(
  text: string,
  start: number,
  end: number,
  key: string,
): SpeechEditorChange | null {
  const command = key.toLowerCase();
  if (command !== "k" && command !== "u") return null;
  const lineStart = start === 0 ? 0 : text.lastIndexOf("\n", start - 1) + 1;
  const newline = text.indexOf("\n", start);
  const lineEnd = newline < 0 ? text.length : newline;
  const deleteStart = start !== end || command === "k" ? start : lineStart;
  const deleteEnd = start !== end
    ? end
    : command === "k"
    ? lineEnd === start ? Math.min(text.length, start + 1) : lineEnd
    : start;
  return {
    text: text.slice(0, deleteStart) + text.slice(deleteEnd),
    start: deleteStart,
    end: deleteStart,
  };
}
