import { assertEquals } from "jsr:@std/assert";
import { resolveSlashCommand } from "./slashCommands.ts";

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
