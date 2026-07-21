import { assertEquals } from "jsr:@std/assert";
import {
  buildWorkflowPlanSystemPrompt,
  buildWorkflowRefinementPrompt,
  buildWorkflowReviewSystemPrompt,
  invalidWorkflowReview,
  outputPathForArtifactName,
  parseExternalWorkflowResponse,
  workflowBuilderModelOptions,
  workflowGenerationContext,
} from "./AIWorkflowBuilderModal.tsx";
import { defaultChatSettings, defaultRAGSetting } from "../llm/settings.ts";

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

Deno.test("workflow generation receives only configured runtime names", () => {
  const context = workflowGenerationContext({
    ...defaultChatSettings,
    model: "settings-model",
    modelProfiles: [{
      ...defaultChatSettings.modelProfiles[0],
      id: "enabled",
      name: "Enabled",
      provider: "openai",
      endpoint: "",
      apiKey: "",
      model: "configured-model",
      vertexProjectId: "",
      vertexLocation: "",
      vertexOAuthClientId: "",
      vertexOAuthClientSecret: "",
      enabledModels: ["configured-model"],
      availableModels: ["configured-model"],
      enabled: true,
      local: false,
      openAICompatible: false,
      localFramework: "ollama",
      username: "",
      password: "",
    }],
    ragSettings: { docs: defaultRAGSetting },
    mcpServers: [{
      id: "browser",
      name: "Browser",
      transport: "http",
      url: "http://localhost",
      headers: {},
      command: "",
      args: [],
      env: {},
      framing: "newline",
      enabled: true,
      toolHints: [],
      verified: true,
      oauth: false,
    }],
  }, "dialog-selected-model");
  assertEquals(context.models, [
    "dialog-selected-model",
    "settings-model",
    "configured-model",
  ]);
  assertEquals(context.ragSettings, ["docs"]);
  assertEquals(context.mcpServers, ["Browser"]);
});

Deno.test("workflow review and refinement prompts enforce common failure checks", () => {
  const reviewPrompt = buildWorkflowReviewSystemPrompt("desktop spec");
  assertEquals(reviewPrompt.includes("json.source"), true);
  assertEquals(reviewPrompt.includes("throwOnError"), true);
  assertEquals(reviewPrompt.includes("Runtime configuration"), true);
  assertEquals(
    reviewPrompt.includes(
      "do not turn optional suggestions, illustrative edge cases",
    ),
    true,
  );
  assertEquals(
    reviewPrompt.includes(
      "Gracefully ending with a clear error result is valid",
    ),
    true,
  );
  assertEquals(
    reviewPrompt.includes("Do not report speculative robustness concerns"),
    true,
  );
  assertEquals(
    reviewPrompt.includes("return pass with an empty issues array"),
    true,
  );
  const refinement = buildWorkflowRefinementPrompt({
    request: "Fetch data",
    plan: "Fetch then parse",
    previous: "name: old",
    review: {
      verdict: "fail",
      summary: "Invalid JSON source",
      issues: [{
        severity: "high",
        nodeId: "parse",
        message: "source is interpolated",
        suggestion: "use a bare name",
      }],
    },
    feedback: "Keep the output name",
    artifactKind: "workflow",
  });
  assertEquals(refinement.includes("Fix every high-severity issue"), true);
  assertEquals(refinement.includes("source is interpolated"), true);
  assertEquals(refinement.includes("Keep the output name"), true);
});

Deno.test("workflow planning does not invent requirements", () => {
  const prompt = buildWorkflowPlanSystemPrompt();
  assertEquals(prompt.includes("shortest practical Workspace workflow"), true);
  assertEquals(prompt.includes("Do not invent validation stages"), true);
  assertEquals(prompt.includes("Runtime failures may surface directly"), true);
});

Deno.test("an unparseable workflow review is a blocking failure", () => {
  const review = invalidWorkflowReview();
  assertEquals(review.verdict, "fail");
  assertEquals(review.issues[0].severity, "high");
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
