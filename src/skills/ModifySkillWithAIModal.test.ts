import { assertEquals, assertThrows } from "jsr:@std/assert";
import { buildModifySkillPrompt, parseSkillAIChangeSet } from "./ModifySkillWithAIModal.tsx";
import type { WorkspaceSkill } from "./skills.ts";

const paths = ["skills/demo/SKILL.md", "skills/demo/workflows/main.workflow.yaml"];

Deno.test("Skill AI change sets accept fenced JSON and require the complete allowed bundle", () => {
  const result = parseSkillAIChangeSet(`before\n\`\`\`json\n${JSON.stringify({ summary: "updated", files: paths.map((path) => ({ path, content: `${path}\nchanged` })) })}\n\`\`\``, paths);
  assertEquals(result.summary, "updated");
  assertEquals(result.files.map((file) => file.path), paths);
  assertThrows(() => parseSkillAIChangeSet(JSON.stringify({ files: [{ path: paths[0], content: "changed" }] }), paths), Error, "omitted required files");
  assertThrows(() => parseSkillAIChangeSet(JSON.stringify({ files: [...paths.map((path) => ({ path, content: "changed" })), { path: "other.md", content: "bad" }] }), paths), Error, "unexpected path");
});

Deno.test("Skill AI prompt includes the Skill and every related Workflow", () => {
  const skill: WorkspaceSkill = { name: "Demo", description: "", folderPath: "skills/demo", skillFilePath: paths[0], instructions: "", references: [], workflows: [{ path: "workflows/main.workflow.yaml", description: "Main" }] };
  const prompt = buildModifySkillPrompt(skill, paths.map((path) => ({ path, content: `content:${path}` })), "Improve it");
  assertEquals(paths.every((path) => prompt.includes(`BEGIN FILE: ${path}`)), true);
  assertEquals(prompt.includes("Improve it"), true);
});
