export interface EmptyChatCandidate {
  title: string;
  messages: unknown[];
}

export function isEmptyNewChat(session: EmptyChatCandidate): boolean {
  return session.title === "New chat" && session.messages.length === 0;
}

/** Keeps the newest (first) empty draft and removes accumulated duplicates. */
export function deduplicateEmptyNewChats<T extends EmptyChatCandidate>(
  sessions: T[],
): T[] {
  let keptEmpty = false;
  return sessions.filter((session) => {
    if (!isEmptyNewChat(session)) return true;
    if (keptEmpty) return false;
    keptEmpty = true;
    return true;
  });
}
