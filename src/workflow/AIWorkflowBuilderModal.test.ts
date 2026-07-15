import { assertEquals } from "jsr:@std/assert";
import { outputPathForArtifactName } from "./AIWorkflowBuilderModal.tsx";

Deno.test("artifact output paths follow their names", () => {
  assertEquals(outputPathForArtifactName("skill", "Code Review"), "skills/code-review");
  assertEquals(outputPathForArtifactName("skill", "議事録 整理"), "skills/議事録-整理");
  assertEquals(outputPathForArtifactName("workflow", "Daily Notes"), "workflows/daily-notes.workflow.yaml");
  assertEquals(outputPathForArtifactName("skill", "  "), "skills/new-skill");
});
