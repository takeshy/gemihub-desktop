import { assertEquals } from "jsr:@std/assert";
import {
  appendPromptHistory,
  isCaretOnFirstLine,
  isCaretOnLastLine,
  MAX_PROMPT_HISTORY,
  parsePromptHistory,
  promptHistoryStorageKey,
} from "./promptHistory.ts";

Deno.test("prompt history is scoped per workspace", () => {
  assertEquals(
    promptHistoryStorageKey(""),
    "gemihub-desktop:chat-prompt-history:default",
  );
  assertEquals(
    promptHistoryStorageKey("/home/me/notes"),
    "gemihub-desktop:chat-prompt-history:%2Fhome%2Fme%2Fnotes",
  );
});

Deno.test("prompt history survives damaged storage", () => {
  assertEquals(parsePromptHistory(null), []);
  assertEquals(parsePromptHistory("{oops"), []);
  assertEquals(parsePromptHistory('{"a":1}'), []);
  assertEquals(parsePromptHistory('["ask", 5, "  ", "again"]'), [
    "ask",
    "again",
  ]);
});

Deno.test("prompt history keeps the newest entries only", () => {
  let history: string[] = [];
  for (let i = 0; i < MAX_PROMPT_HISTORY + 5; i++) {
    history = appendPromptHistory(history, `prompt ${i}`);
  }
  assertEquals(history.length, MAX_PROMPT_HISTORY);
  assertEquals(history[history.length - 1], `prompt ${MAX_PROMPT_HISTORY + 4}`);
  assertEquals(appendPromptHistory(history, "   "), history);
});

Deno.test("caret checks keep multi-line editing intact", () => {
  assertEquals(isCaretOnFirstLine("one\ntwo", 2), true);
  assertEquals(isCaretOnFirstLine("one\ntwo", 5), false);
  assertEquals(isCaretOnLastLine("one\ntwo", 5), true);
  assertEquals(isCaretOnLastLine("one\ntwo", 2), false);
});
