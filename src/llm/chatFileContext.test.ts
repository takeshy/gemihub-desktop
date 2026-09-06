import { assertEquals } from "jsr:@std/assert";
import { attachedActiveFile } from "./chatFileContext.ts";
import { resolveSlashCommand } from "./slashCommands.ts";

const commands = [{
  id: "review",
  name: "review",
  description: "Review attached content",
  promptTemplate: "Review: {content}",
  enabledMcpServers: [],
}];

Deno.test("removing the active chip excludes its content from slash commands and workflows", () => {
  const context = attachedActiveFile("private.md", [
    { path: "other.md", content: "Other attachment" },
  ]);
  assertEquals(context, null);
  assertEquals(
    resolveSlashCommand("/review", commands, context?.content ?? ""),
    "Review: ",
  );
});

Deno.test("an attached active file provides the same snapshot to commands and workflows", () => {
  const file = { path: "note.md", content: "Attached version" };
  const context = attachedActiveFile("note.md", [file]);
  file.content = "Edited after sending";
  assertEquals(context, { path: "note.md", content: "Attached version" });
  assertEquals(
    resolveSlashCommand("/review", commands, context?.content ?? ""),
    "Review: Attached version",
  );
});

Deno.test("cleared attachments and unattached editor switches have no active context", () => {
  assertEquals(attachedActiveFile("note.md", []), null);
  assertEquals(attachedActiveFile("new.md", [
    { path: "note.md", content: "Earlier file" },
  ]), null);
  assertEquals(attachedActiveFile(undefined, [
    { path: "note.md", content: "Manual attachment" },
  ]), null);
});
