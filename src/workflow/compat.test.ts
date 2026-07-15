import { assertEquals, assertThrows } from "jsr:@std/assert";
import { expandMultipartFields, runWorkflowChatWithAutoApply, sanitizeWorkflowNotePath, workflowNameFromPath } from "./compat.ts";
import type { ChatRequest } from "../lib/wailsBackend.ts";

Deno.test("workflow compatibility helpers preserve source runtime semantics", () => {
  assertEquals(workflowNameFromPath(undefined, "workflows/daily-note.yaml"), "daily-note");
  assertEquals(workflowNameFromPath("Explicit", "workflows/daily-note.yaml"), "Explicit");
  assertEquals(workflowNameFromPath(undefined, "workflows/daily-note.workflow.yaml"), "daily-note");
  assertEquals(sanitizeWorkflowNotePath('reports/a:b?c*.md'), "reports/a-b-c-.md");
  const fields = expandMultipartFields('{"title":"{{title}}","file":"{{file}}"}', (value) => value.replace("{{title}}", 'A "quoted" title').replace("{{file}}", '{"data":"abc"}'));
  assertEquals(fields, { title: 'A "quoted" title', file: '{"data":"abc"}' });
  assertThrows(() => expandMultipartFields("[]", (value) => value));
});

Deno.test("workflow chat applies file tools and continues to a final response", async () => {
  const request = { messages: [{ role: "user", content: "edit it" }], cliSessionId: "" } as ChatRequest;
  const applied: string[] = [];
  let callCount = 0;
  const result = await runWorkflowChatWithAutoApply(request, () => Promise.resolve(++callCount === 1
    ? { content: "I will edit it.", pendingAction: { kind: "write", path: "result.md", content: "done" }, toolsUsed: ["propose_file_edit"], usage: { inputTokens: 10, outputTokens: 2 } }
    : { content: "Finished.", toolsUsed: ["read_file"], usage: { inputTokens: 5, outputTokens: 3 } }), async (action) => { applied.push(action.path); });
  assertEquals(applied, ["result.md"]);
  assertEquals(callCount, 2);
  assertEquals(result.content, "Finished.");
  assertEquals(result.toolsUsed, ["propose_file_edit", "read_file"]);
  assertEquals(result.usage, { inputTokens: 15, outputTokens: 5, thinkingTokens: 0, totalTokens: 0, cachedTokens: 0, toolUseTokens: 0 });
  assertEquals(request.messages.at(-1)?.content.includes("applied successfully"), true);
});
