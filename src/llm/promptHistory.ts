/**
 * Recall of previously sent chat prompts, scoped to a workspace so switching
 * folders never mixes one project's prompts into another.
 */
export const MAX_PROMPT_HISTORY = 100;

export function promptHistoryStorageKey(scope: string): string {
  return `gemihub-desktop:chat-prompt-history:${
    scope ? encodeURIComponent(scope) : "default"
  }`;
}

export function parsePromptHistory(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((prompt): prompt is string =>
        typeof prompt === "string" && prompt.trim().length > 0
      )
      .slice(-MAX_PROMPT_HISTORY);
  } catch {
    return [];
  }
}

export function appendPromptHistory(
  history: string[],
  prompt: string,
): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return history;
  return [...history, trimmed].slice(-MAX_PROMPT_HISTORY);
}

export function isCaretOnFirstLine(value: string, caret: number): boolean {
  return !value.slice(0, caret).includes("\n");
}

export function isCaretOnLastLine(value: string, caret: number): boolean {
  return !value.slice(caret).includes("\n");
}

export function loadPromptHistory(scope: string): string[] {
  try {
    return parsePromptHistory(
      localStorage.getItem(promptHistoryStorageKey(scope)),
    );
  } catch {
    return [];
  }
}

export function savePromptHistory(scope: string, history: string[]): void {
  try {
    localStorage.setItem(
      promptHistoryStorageKey(scope),
      JSON.stringify(history),
    );
  } catch {
    // History is an optional convenience; storage denial must not block chat.
  }
}
