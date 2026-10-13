import { test } from "vitest";
import { assertEquals } from "../testing/assert";
import {
  buildReadAloudSystemPrompt,
  getReadAloudRate,
  setReadAloudRate,
  textForSpeech,
} from "./readAloud.ts";

test("read-aloud rate is clamped to the supported range", () => {
  setReadAloudRate(10);
  assertEquals(getReadAloudRate(), 5);
  setReadAloudRate(0);
  assertEquals(getReadAloudRate(), 0.5);
  setReadAloudRate(1.5);
  assertEquals(getReadAloudRate(), 1.5);
  setReadAloudRate(NaN);
  assertEquals(getReadAloudRate(), 1);
});

test("spoken text drops markup that engines read as punctuation", () => {
  assertEquals(textForSpeech("**bold** and `code`"), "bold and code");
  assertEquals(textForSpeech("# Title\n- item\n> quote"), "Title item quote");
  assertEquals(textForSpeech("[label](https://example.com)"), "label");
  assertEquals(
    textForSpeech("See ![img](a.png) and https://example.com now"),
    "See and now",
  );
});

test("read-aloud asks for short speakable answers", () => {
  const prompt = buildReadAloudSystemPrompt();
  assertEquals(prompt.includes("spoken"), true);
  assertEquals(prompt.includes("no headings"), true);
});
