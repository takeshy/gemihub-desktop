import { assertEquals } from "jsr:@std/assert";
import {
  applyReplacementRules,
  applySpeechCommands,
  parseReplacementRules,
  serializeReplacementRules,
  trailingSpeechCommand,
} from "./speechText.ts";
Deno.test("speech replacements prefer the longest phrase and consume punctuation", () => {
  const rules = parseReplacementRules(
    "daily => wrong\ndaily note => /daily\n日記書いて => /daily",
  );
  assertEquals(
    applyReplacementRules("Daily note. today", rules),
    "/daily today",
  );
  assertEquals(
    applyReplacementRules("日記書いて。今日は晴れ", rules),
    "/daily 今日は晴れ",
  );
});

Deno.test("replacement rows serialize compatibly with speech-popup", () => {
  const stored = serializeReplacementRules([
    { from: "日記書いて", to: "/daily" },
    { from: "two lines", to: "first\nsecond" },
    { from: "", to: "ignored" },
  ]);
  assertEquals(parseReplacementRules(stored), [
    { from: "日記書いて", to: "/daily" },
    { from: "two lines", to: "first\nsecond" },
  ]);
});
Deno.test("a spoken phrase may start with a hash without becoming a comment", () => {
  const stored = serializeReplacementRules([
    { from: "#tag", to: "hashtag" },
    { from: "back\\slash", to: "ok" },
  ]);
  assertEquals(parseReplacementRules(stored), [
    { from: "#tag", to: "hashtag" },
    { from: "back\\slash", to: "ok" },
  ]);
});
Deno.test("speech symbol commands are final trailing phrases", () => {
  assertEquals(
    applySpeechCommands("Is this working question.", {
      question: "question",
      newline: "enter",
      exclamation: "exclamation",
    }),
    "Is this working?",
  );
  assertEquals(trailingSpeechCommand("turn over the page", "over"), null);
});
Deno.test("a rule with no spoken phrase is dropped instead of matching everywhere", () => {
  assertEquals(parseReplacementRules(" => hello"), []);
  assertEquals(
    applyReplacementRules("this is a test", [{ from: "", to: "hello" }]),
    "this is a test",
  );
});
