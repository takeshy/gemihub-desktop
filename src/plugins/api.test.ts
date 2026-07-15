import { assertEquals } from "jsr:@std/assert";
import { createPluginAPI } from "./api.ts";
import type { PluginSlashCommand } from "./types.ts";

Deno.test("plugin API registers slash commands and exposes the LLM compatibility alias", async () => {
  let registered: PluginSlashCommand | undefined;
  const api = createPluginAPI("example", "en", ["llm"], {
    onRegisterView: () => undefined,
    onRegisterSettingsTab: () => undefined,
    onRegisterSlashCommand: (command) => {
      registered = command;
    },
    onLLMChat: async (messages) => messages.at(-1)?.content ?? "",
  });

  api.registerSlashCommand({ name: "summarize", description: "Summarize text", execute: (args) => args });

  assertEquals(registered?.pluginId, "example");
  assertEquals(registered?.name, "summarize");
  assertEquals(await api.llm?.chat([{ role: "user", content: "hello" }]), "hello");
  assertEquals(await api.gemini?.chat([{ role: "user", content: "hello" }]), "hello");
});
