import { assertEquals } from "jsr:@std/assert";
import { resolveSlashCommand, skillsForSlashCommand } from "./slashCommands.ts";
import type { WorkspaceSkill } from "../skills/skills.ts";

const commands = [{
  id: "review",
  name: "review",
  description: "Review text",
  promptTemplate: "Review this:\n{input}",
  enabledMcpServers: [],
}];

Deno.test("slash commands resolve their template for sending and display", () => {
  assertEquals(
    resolveSlashCommand("/review Be concise", commands),
    "Review this:\nBe concise",
  );
});

Deno.test("unknown slash commands remain unchanged", () => {
  assertEquals(
    resolveSlashCommand("/unknown value", commands),
    "/unknown value",
  );
});

Deno.test("slash commands add configured skills without duplicating active skills", () => {
  const skill = (name: string): WorkspaceSkill => ({
    name,
    description: "",
    folderPath: `skills/${name}`,
    skillFilePath: `skills/${name}/SKILL.md`,
    instructions: "",
    references: [],
    workflows: [],
  });
  const review = skill("review");
  const translate = skill("translate");
  assertEquals(
    skillsForSlashCommand(
      [review],
      [review, translate],
      [
        review.skillFilePath,
        translate.skillFilePath,
        "skills/missing/SKILL.md",
      ],
    ).map((item) => item.name),
    ["review", "translate"],
  );
});
