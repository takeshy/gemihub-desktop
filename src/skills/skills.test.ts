import { assertEquals } from "jsr:@std/assert";
import { buildSkillMarkdown, buildSkillSystemPrompt, collectSkillWorkflows, deriveWorkflowInputVariables, extractSkillCapabilities, loadActiveSkillContents, parseWorkspaceSkill, updateSkillWorkflowInputVariables } from "./skills.ts";
import { contextualBuiltinFolderPath, getBuiltinSkillMetadata, loadBuiltinSkill } from "./builtinSkills.ts";

const markdown = `---
name: Code Review
description: Review source files
---

\`\`\`skill-capabilities
workflows:
  - path: workflows/run-lint.workflow.yaml
    description: Run the linter
    inputVariables: [filePath, mode]
\`\`\`

Always inspect the requested file first.`;

Deno.test("parses workspace skill capabilities and stable workflow IDs", () => {
  const skill = parseWorkspaceSkill("skills/code-review/SKILL.md", markdown)!;
  assertEquals(skill.name, "Code Review");
  assertEquals(skill.workflows[0].inputVariables, ["filePath", "mode"]);
  assertEquals([...collectSkillWorkflows([skill]).keys()], ["Code Review/workflows_run-lint"]);
});

Deno.test("skill prompt includes instructions, IDs and input variables", () => {
  const skill = parseWorkspaceSkill("skills/code-review/SKILL.md", markdown)!;
  skill.references = ["[references/checklist.md]\nCheck tests before approval."];
  const prompt = buildSkillSystemPrompt([skill]);
  assertEquals(prompt.includes("Always inspect the requested file first."), true);
  assertEquals(prompt.includes("Code Review/workflows_run-lint"), true);
  assertEquals(prompt.includes("filePath, mode"), true);
  assertEquals(prompt.includes("Check tests before approval."), true);
});

Deno.test("built-in agent skills include the four migrated skill families", () => {
  assertEquals(getBuiltinSkillMetadata().map((skill) => skill.name), ["markdown", "json-canvas", "base", "dashboard"]);
  const markdownSkill = loadBuiltinSkill("__builtin__/markdown");
  assertEquals(markdownSkill?.instructions.includes("Extended Markdown"), true);
  assertEquals((markdownSkill?.references.length ?? 0) > 0, true);
  assertEquals(contextualBuiltinFolderPath("boards/plan.canvas"), "__builtin__/json-canvas");
  assertEquals(contextualBuiltinFolderPath("data/projects.base"), "__builtin__/base");
  assertEquals(contextualBuiltinFolderPath("home.dashboard"), "__builtin__/dashboard");
});

Deno.test("built-in skill guidance matches implemented format capabilities", () => {
  const markdownSkill = loadBuiltinSkill("__builtin__/markdown")!;
  const canvasSkill = loadBuiltinSkill("__builtin__/json-canvas")!;
  const baseSkill = loadBuiltinSkill("__builtin__/base")!;
  const dashboardSkill = loadBuiltinSkill("__builtin__/dashboard")!;

  assertEquals(markdownSkill.instructions.includes("not rendered as special syntax"), true);
  assertEquals(markdownSkill.instructions.includes("heading-target navigation, foldable callouts"), true);
  assertEquals(canvasSkill.instructions.includes("round-tripped but are not rendered"), true);
  assertEquals(baseSkill.instructions.includes("`map` | Pins"), false);
  assertEquals(baseSkill.instructions.includes("Map views and Markdown embedding of a Base are not currently supported"), true);
  assertEquals(dashboardSkill.instructions.includes("markdown | html | table | card"), true);
  assertEquals(dashboardSkill.instructions.includes("calendar | memo-list | secret-manager"), true);
});

Deno.test("active workspace skills load nested reference materials", async () => {
  const runtime = globalThis as unknown as { window?: { go?: { main: { App: Record<string, unknown> } } } };
  const previousWindow = runtime.window;
  runtime.window = { go: { main: { App: {
    ListWorkspaceFiles: () => Promise.resolve([{ path: "skills/code-review/references/checklist.md", size: 10, createdTime: 0, modTime: 0, md5: "", binary: false }]),
    ReadWorkspaceFile: (path: string) => Promise.resolve({ path, fileName: "checklist.md", content: "Run tests before approval." }),
  } } } };
  try {
    const skill = parseWorkspaceSkill("skills/code-review/SKILL.md", markdown)!;
    const loaded = await loadActiveSkillContents([skill]);
    assertEquals(loaded[0].references, ["[references/checklist.md]\nRun tests before approval."]);
  } finally { runtime.window = previousWindow; }
});

Deno.test("invalid capabilities YAML and escaping paths are rejected", () => {
  assertEquals(extractSkillCapabilities("```skill-capabilities\n:\n```"), null);
  const skill = parseWorkspaceSkill("skills/test/SKILL.md", markdown.replace("workflows/run-lint.workflow.yaml", "../escape.md"))!;
  assertEquals(skill.workflows, []);
});

Deno.test("builds capabilities and derives only unresolved workflow inputs", () => {
  const workflow = `name: test\nnodes:\n  - id: read\n    type: note-read\n    path: "{{filePath}}"\n    saveTo: content\n  - id: ask\n    type: command\n    prompt: "{{content}} {{mode}} {{_date}}"\n    saveTo: result\n`;
  assertEquals(deriveWorkflowInputVariables(workflow), ["filePath", "mode"]);
  const output = buildSkillMarkdown("Test", "Description", "Instructions", { path: "workflows/main.workflow.yaml", description: "Run", inputVariables: ["filePath", "mode"] });
  assertEquals(parseWorkspaceSkill("skills/test/SKILL.md", output)?.workflows[0].inputVariables, ["filePath", "mode"]);
});

Deno.test("manual workflow edits synchronize skill capability input variables", () => {
  const skill = buildSkillMarkdown("Reporter", "Creates reports", "Use the workflow.", { path: "workflows/main.workflow.yaml", description: "Create report", inputVariables: ["old"] });
  const workflow = `nodes:\n  - id: ask\n    type: command\n    prompt: "Report {{topic}} for {{audience}}"\n    saveTo: result\n`;
  const updated = updateSkillWorkflowInputVariables(skill, "workflows/main.workflow.yaml", workflow);
  const parsed = parseWorkspaceSkill("skills/reporter/SKILL.md", updated || "");
  assertEquals(parsed?.workflows[0].inputVariables, ["audience", "topic"]);
  assertEquals(updated?.includes("Use the workflow."), true);
});
