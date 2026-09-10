import { assertEquals } from "jsr:@std/assert";
import { createSilenceDetector } from "./speechSilence.ts";
import { loadSpeechSettings } from "./settings.ts";

Deno.test("silence timeout does not stop before speech or after a brief click", () => {
  const sample = createSilenceDetector(3);
  assertEquals(sample(0, 0), false);
  assertEquals(sample(0, 10000), false);
  assertEquals(sample(0.1, 10100), false);
  assertEquals(sample(0, 10200), false);
  assertEquals(sample(0, 20000), false);
});

Deno.test("sustained voice followed by configured silence stops exactly once", () => {
  const sample = createSilenceDetector(3);
  assertEquals(sample(0.1, 0), false);
  assertEquals(sample(0.1, 300), false);
  assertEquals(sample(0.001, 3299), false);
  assertEquals(sample(0.001, 3300), true);
  assertEquals(sample(0.001, 5000), false);
});

Deno.test("resumed speech resets the silence window", () => {
  const sample = createSilenceDetector(2);
  sample(0.1, 0);
  sample(0.1, 300);
  assertEquals(sample(0, 2200), false);
  assertEquals(sample(0.1, 2250), false);
  assertEquals(sample(0.1, 2350), false);
  assertEquals(sample(0, 4349), false);
  assertEquals(sample(0, 4350), true);
});

Deno.test("disabled silence detection never stops recording", () => {
  const sample = createSilenceDetector(0);
  sample(0.1, 0);
  sample(0.1, 300);
  assertEquals(sample(0, 60000), false);
});

Deno.test("silence settings preserve off and valid delays while validating stored values", () => {
  assertEquals(loadSpeechSettings().silenceSeconds, 3);
  for (const seconds of [0, 1, 5, 10]) {
    assertEquals(
      loadSpeechSettings({ silenceSeconds: seconds }).silenceSeconds,
      seconds,
    );
  }
  for (const seconds of [-1, 11, 1.5, NaN, Infinity]) {
    assertEquals(
      loadSpeechSettings({ silenceSeconds: seconds }).silenceSeconds,
      3,
    );
  }
});
