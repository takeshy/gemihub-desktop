import assert from "node:assert/strict";
import test from "node:test";
import { buildTimelineAiPrompt, hasAiMention, parseTimelineAiSettings } from "./timelineAi.ts";
import type { TimelineEntry } from "./timelineFormat.ts";

const post = (id: string, content: string, speaker = "user"): TimelineEntry => ({
  id, createdAt: "2026-10-12T10:00:00.000Z", pinned: false, content, index: 0, sourcePath: "d.md",
  metadata: {}, rootId: "a", replyTo: "", speaker, authorName: "", deleted: false,
});

test("@ai mentions are standalone only", () => {
  assert.equal(hasAiMention("@ai help"), true);
  assert.equal(hasAiMention("教えて@aiに"), true);
  assert.equal(hasAiMention("mail me@ai.example"), false);
  assert.equal(hasAiMention("@aiden"), false);
});

test("prompt marks the addressed post and drops deleted ones", () => {
  const deleted = { ...post("c", "gone"), deleted: true };
  const prompt = buildTimelineAiPrompt([post("a", "root"), post("b", "@ai q"), deleted], post("b", "@ai q"));
  assert.match(prompt, /User \(addressed to you\):\n@ai q/);
  assert.doesNotMatch(prompt, /gone/);
});

test("invalid saved settings fall back to defaults", () => {
  assert.deepEqual(parseTimelineAiSettings("{"), { model: "", fileRead: false, webSearch: false });
  assert.equal(parseTimelineAiSettings('{"fileRead":true}').fileRead, true);
});
