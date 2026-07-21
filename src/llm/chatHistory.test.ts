import { assertEquals } from "jsr:@std/assert";
import { deduplicateEmptyNewChats, isEmptyNewChat } from "./chatHistory.ts";

Deno.test("chat history retains only one empty New chat", () => {
  const sessions = [
    { id: "newest", title: "New chat", messages: [] },
    { id: "used", title: "Question", messages: [{ role: "user" }] },
    { id: "older-empty", title: "New chat", messages: [] },
  ];

  assertEquals(
    deduplicateEmptyNewChats(sessions).map((session) => session.id),
    ["newest", "used"],
  );
  assertEquals(isEmptyNewChat(sessions[0]), true);
  assertEquals(isEmptyNewChat(sessions[1]), false);
});
