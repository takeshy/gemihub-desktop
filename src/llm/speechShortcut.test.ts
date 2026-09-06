import { assertEquals } from "jsr:@std/assert";
import {
  speechShortcutFromEvent,
  speechShortcutLabel,
  validSpeechShortcut,
} from "./speechShortcut.ts";
import { loadSpeechSettings } from "./settings.ts";

const key = {
  code: "KeyM",
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  isComposing: false,
};

Deno.test("speech shortcuts capture modifiers and physical keys consistently", () => {
  assertEquals(
    speechShortcutFromEvent({ ...key, ctrlKey: true, shiftKey: true }),
    "Ctrl+Shift+M",
  );
  assertEquals(
    speechShortcutFromEvent({ ...key, metaKey: true, shiftKey: true }),
    "Shift+Meta+M",
  );
  assertEquals(speechShortcutLabel("Shift+Meta+M"), "Shift+⌘+M");
  assertEquals(
    speechShortcutFromEvent({ ...key, altKey: true, code: "Digit1" }),
    "Alt+1",
  );
  assertEquals(
    speechShortcutFromEvent({ ...key, ctrlKey: true, code: "Space" }),
    "Ctrl+Space",
  );
});

Deno.test("ordinary typing, IME composition, and modifier-only keys cannot activate speech", () => {
  assertEquals(speechShortcutFromEvent(key), "");
  assertEquals(speechShortcutFromEvent({ ...key, shiftKey: true }), "");
  assertEquals(
    speechShortcutFromEvent({ ...key, ctrlKey: true, isComposing: true }),
    "",
  );
  assertEquals(
    speechShortcutFromEvent({ ...key, ctrlKey: true, code: "ControlLeft" }),
    "",
  );
  assertEquals(
    speechShortcutFromEvent({ ...key, ctrlKey: true, code: "Enter" }),
    "",
  );
});

Deno.test("speech shortcut matching requires exactly the assigned modifiers", () => {
  const saved = "Ctrl+Shift+M";
  assertEquals(
    speechShortcutFromEvent({ ...key, ctrlKey: true }) === saved,
    false,
  );
  assertEquals(
    speechShortcutFromEvent({
      ...key,
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
    }) === saved,
    false,
  );
});

Deno.test("speech shortcuts persist with an unassigned default and reject invalid stored values", () => {
  assertEquals(loadSpeechSettings().shortcut, "");
  assertEquals(
    loadSpeechSettings({ shortcut: "Ctrl+Shift+M" }).shortcut,
    "Ctrl+Shift+M",
  );
  for (const invalid of ["M", "Shift+M", "Ctrl+", "Ctrl+Ctrl+M", null, 42]) {
    assertEquals(validSpeechShortcut(invalid), "");
  }
  assertEquals(loadSpeechSettings({ shortcut: "" }).shortcut, "");
});
