import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
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
    onLLMListModels: async () => [{
      id: "profile:test:model-a",
      label: "Test — model-a",
      provider: "openai",
      model: "model-a",
    }],
  });

  api.registerSlashCommand({
    name: "summarize",
    description: "Summarize text",
    execute: (args) => args,
  });

  assertEquals(registered?.pluginId, "example");
  assertEquals(registered?.name, "summarize");
  assertEquals(
    await api.llm?.chat([{ role: "user", content: "hello" }], {
      modelId: "profile:test:model-a",
    }),
    "hello",
  );
  assertEquals(receivedModelId, "profile:test:model-a");
  assertEquals(
    await api.gemini?.chat([{ role: "user", content: "hello" }]),
    "hello",
  );
  assertEquals(await api.llm?.listModels(), [{
    id: "profile:test:model-a",
    label: "Test — model-a",
    provider: "openai",
    model: "model-a",
  }]);
});

Deno.test("plugin API exposes the Web registerWidget contract", () => {
  const api = createPluginAPI("example", "en", [], {
    onRegisterView: () => undefined,
    onRegisterSettingsTab: () => undefined,
    onRegisterSlashCommand: () => undefined,
  });
  const render = () => "widget";
  api.registerWidget({
    type: "summary",
    label: "Summary",
    defaultConfig: {},
    render,
  });

  assertEquals(dashboardWidgetDefinition("summary")?.render, render);
  assertEquals(dashboardWidgetDefinition("example:summary"), null);
});

Deno.test("plugin file APIs expose explicit Workspace and Files roots", () => {
  const api = createPluginAPI("example", "en", ["files"], {
    onRegisterView: () => undefined,
    onRegisterSettingsTab: () => undefined,
    onRegisterSlashCommand: () => undefined,
  });
  assertEquals(typeof api.workspaceFiles?.read, "function");
  assertEquals(typeof api.files?.read, "function");
  assertEquals("projectFiles" in api, false);
});

Deno.test("plugin API exposes file notifications and FileTree decorations", async () => {
  const api = createPluginAPI("example", "en", ["files"], {
    onRegisterView: () => undefined,
    onRegisterSettingsTab: () => undefined,
    onRegisterSlashCommand: () => undefined,
  });
  const stop = api.onFilesChanged!(() => undefined);
  const removeDecoration = api.fileTree!.registerDecorationProvider(
    ({ path }) => path === "note.md" ? { title: "Modified" } : null,
  );

  assertEquals(typeof api.onFilesChanged, "function");
  assertEquals(typeof api.fileTree!.refreshDecorations, "function");
  assertEquals(typeof api.fileTree!.registerContextMenuItem, "function");
  assertEquals(typeof api.fileViewer!.registerAction, "function");

  stop();
  removeDecoration();
});

Deno.test("plugin file APIs deny access to protected application files", async () => {
  const api = createPluginAPI("example", "en", ["files"], {
    onRegisterView: () => undefined,
    onRegisterSettingsTab: () => undefined,
    onRegisterSlashCommand: () => undefined,
  });

  for (
    const path of [
      ".llm-hub/plugins/other/main.js",
      "./.llm-hub/plugin-data/other.json",
      ".llm-hub\\plugins\\other\\main.js",
      "notes/../.llm-hub/plugins/other/main.js",
      ".LLM-HUB/plugins/other/main.js",
    ]
  ) {
    await assertRejects(
      () => api.workspaceFiles!.read(path),
      Error,
      "protected application files",
    );
    await assertRejects(
      () => api.files!.create(path, "malicious"),
      Error,
      "protected application files",
    );
  }

  assertThrows(
    () =>
      api.workspaceFiles!.rename(
        "notes/safe.md",
        ".llm-hub/plugins/other/main.js",
      ),
    Error,
    "protected application files",
  );
  assertThrows(
    () => api.files!.delete(".llm-hub"),
    Error,
    "protected application files",
  );
});
