import { assertEquals } from "jsr:@std/assert";
import {
  outputPathForArtifactName,
  parseExternalWorkflowResponse,
  workflowBuilderModelOptions,
} from "./AIWorkflowBuilderModal.tsx";
import { defaultChatSettings } from "../llm/settings.ts";

Deno.test("artifact output paths follow their names", () => {
  assertEquals(
    outputPathForArtifactName("skill", "Code Review"),
    "skills/code-review",
  );
  assertEquals(
    outputPathForArtifactName("skill", "議事録 整理"),
    "skills/議事録-整理",
  );
  assertEquals(
    outputPathForArtifactName("workflow", "Daily Notes"),
    "workflows/daily-notes.workflow.yaml",
  );
  assertEquals(outputPathForArtifactName("skill", "  "), "skills/new-skill");
});

Deno.test("workflow builder lists every verified CLI", () => {
  const settings = {
    ...defaultChatSettings,
    verifiedCliTypes: ["codex" as const, "antigravity" as const],
  };
  assertEquals(workflowBuilderModelOptions(settings, "cli"), [
    { value: "codex", label: "Codex App Server" },
    { value: "antigravity", label: "Antigravity" },
  ]);
});

Deno.test("external workflow response accepts YAML fences with surrounding prose", () => {
  const parsed = parseExternalWorkflowResponse(
    "Here is the result:\n```yaml\nname: Example\nnodes: []\n```",
    "workflow",
  );
  assertEquals(parsed.block?.name, "Example");
  assertEquals(parsed.block?.error, undefined);
});

Deno.test("external skill response accepts the documented two-block format", () => {
  const parsed = parseExternalWorkflowResponse(
    "```skill-instructions\nUse the workflow when asked.\n```\n\n```hub-workflow\nname: Example\nnodes: []\n```",
    "skill",
  );
  assertEquals(parsed.instructions, "Use the workflow when asked.");
  assertEquals(parsed.block?.name, "Example");
});
