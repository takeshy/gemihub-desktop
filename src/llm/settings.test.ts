import { assertEquals } from "jsr:@std/assert";
import { chatThinkingCapabilities } from "./settings.ts";

Deno.test("Gemini 3.5 Flash thinking can be switched on and off", () => {
  assertEquals(chatThinkingCapabilities("gemini", "gemini-3.5-flash"), { available: true, required: false });
  assertEquals(chatThinkingCapabilities("vertex", "publishers/google/models/gemini-3.5-flash"), { available: true, required: false });
});

Deno.test("Gemini Pro models that require thinking cannot be switched off", () => {
  assertEquals(chatThinkingCapabilities("gemini", "gemini-3.1-pro-preview"), { available: true, required: true });
  assertEquals(chatThinkingCapabilities("gemini", "gemini-3.5-flash"), { available: true, required: false });
});
