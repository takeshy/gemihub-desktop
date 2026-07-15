import { assertEquals } from "jsr:@std/assert";
import { changeWorkflowNodeType } from "./NodeEditorModal.tsx";

Deno.test("changing workflow node type applies source-compatible defaults", () => {
  const changed = changeWorkflowNodeType({ id: "step", type: "variable", name: "old", value: "x", next: "done" }, "command");
  assertEquals(changed.id, "step");
  assertEquals(changed.next, "done");
  assertEquals(changed.type, "command");
  assertEquals(changed.prompt, "");
  assertEquals(changed.ragSetting, "__none__");
  assertEquals(changed.enableThinking, "true");
  assertEquals("name" in changed, false);
});
