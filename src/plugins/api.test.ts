import { assertEquals } from "jsr:@std/assert";
import { createPluginAPI } from "./api.ts";
import type { PluginSlashCommand } from "./types.ts";
import { dashboardWidgetDefinition } from "../dashboard/widgetRegistry.ts";

Deno.test("plugin API registers slash commands and exposes the LLM compatibility alias", async () => {
  let registered: PluginSlashCommand | undefined;
  let receivedModelId = "";
  const api = createPluginAPI("example", "en", ["llm"], {
    onRegisterView: () => undefined,
    onRegisterSettingsTab: () => undefined,
    onRegisterSlashCommand: (command) => {
      registered = command;
    },
    onLLMChat: async (messages, options) => {
      receivedModelId = options?.modelId || "";
      return messages.at(-1)?.content ?? "";
    },
    onLLMListModels: async () => [{ id: "profile:test:model-a", label: "Test — model-a", provider: "openai", model: "model-a" }],
  });

  api.registerSlashCommand({ name: "summarize", description: "Summarize text", execute: (args) => args });

  assertEquals(registered?.pluginId, "example");
  assertEquals(registered?.name, "summarize");
  assertEquals(await api.llm?.chat([{ role: "user", content: "hello" }], { modelId: "profile:test:model-a" }), "hello");
  assertEquals(receivedModelId, "profile:test:model-a");
  assertEquals(await api.gemini?.chat([{ role: "user", content: "hello" }]), "hello");
  assertEquals(await api.llm?.listModels(), [{ id: "profile:test:model-a", label: "Test — model-a", provider: "openai", model: "model-a" }]);
});

Deno.test("plugin API exposes the Web registerWidget contract", () => {
  const api = createPluginAPI("example", "en", [], {
    onRegisterView: () => undefined,
    onRegisterSettingsTab: () => undefined,
    onRegisterSlashCommand: () => undefined,
  });
  const render = () => "widget";
  api.registerWidget({ type: "summary", label: "Summary", defaultConfig: {}, render });

  assertEquals(dashboardWidgetDefinition("summary")?.render, render);
  assertEquals(dashboardWidgetDefinition("example:summary"), null);
});
