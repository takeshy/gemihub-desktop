import { assertEquals } from "jsr:@std/assert";
import { keyboardEventShortcut, matchWorkflowFilePattern } from "./automationSettings.ts";

Deno.test("workflow glob patterns support recursive root matches and alternatives", () => {
  assertEquals(matchWorkflowFilePattern("**/*.md", "root.md"), true);
  assertEquals(matchWorkflowFilePattern("**/*.md", "journal/2026/day.md"), true);
  assertEquals(matchWorkflowFilePattern("journal/*.{md,txt}", "journal/day.md"), true);
  assertEquals(matchWorkflowFilePattern("journal/*.{md,txt}", "journal/archive/day.md"), false);
});

Deno.test("workflow shortcut uses stable modifier order", () => {
  const event = { ctrlKey: true, metaKey: false, altKey: true, shiftKey: true, key: "r" } as KeyboardEvent;
  assertEquals(keyboardEventShortcut(event), "Ctrl+Alt+Shift+R");
});
