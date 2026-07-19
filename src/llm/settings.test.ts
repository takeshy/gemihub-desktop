import { assertEquals } from "jsr:@std/assert";
import { chatThinkingCapabilities, configuredModelOptions, defaultChatSettings, defaultRAGSetting, newModelProfile, resolveRAGSetting, selectConfiguredModel, selectModelProfile } from "./settings.ts";

Deno.test("Gemini 3.5 Flash thinking can be switched on and off", () => {
  assertEquals(chatThinkingCapabilities("gemini", "gemini-3.5-flash"), { available: true, required: false });
  assertEquals(chatThinkingCapabilities("vertex", "publishers/google/models/gemini-3.5-flash"), { available: true, required: false });
});

Deno.test("multiple API and local profiles become distinct selectable models", () => {
  const cloud = { ...newModelProfile("openai"), id: "cloud", name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1", enabledModels: ["model-a", "model-b"], model: "model-a" };
  const local = { ...newModelProfile("openai", true), id: "local", name: "Ollama", enabledModels: ["qwen3"], model: "qwen3" };
  const settings = selectModelProfile({ ...defaultChatSettings, modelProfiles: [cloud, local] }, cloud.id);
  assertEquals(configuredModelOptions(settings).map((item) => item.label), ["OpenRouter — model-a", "OpenRouter — model-b", "Ollama — qwen3"]);
  const selected = selectConfiguredModel(settings, "profile:local:qwen3");
  assertEquals({ id: selected.selectedModelProfileId, endpoint: selected.endpoint, model: selected.model }, { id: "local", endpoint: "http://127.0.0.1:11434/v1", model: "qwen3" });
});

Deno.test("Gemini Pro models that require thinking cannot be switched off", () => {
  assertEquals(chatThinkingCapabilities("gemini", "gemini-3.1-pro-preview"), { available: true, required: true });
  assertEquals(chatThinkingCapabilities("gemini", "gemini-3.5-flash"), { available: true, required: false });
});

Deno.test("selecting a CLI clears the previous API model", () => {
  const settings = {
    ...defaultChatSettings,
    model: "gemini-3.5-flash",
    verifiedCliTypes: ["codex" as const],
  };
  const selected = selectConfiguredModel(settings, "cli:codex");
  assertEquals(
    { provider: selected.provider, cliType: selected.cliType, model: selected.model },
    { provider: "cli", cliType: "codex", model: "" },
  );
});

Deno.test("RAG embeddings use AI provider credentials or isolated custom credentials", () => {
  const ai = resolveRAGSetting({
    ...defaultChatSettings,
    provider: "gemini",
    apiKey: "chat-key",
  }, { ...defaultRAGSetting, embeddingProvider: "gemini" });
  assertEquals(ai.embeddingApiKey, "chat-key");

  const custom = resolveRAGSetting(defaultChatSettings, {
    ...defaultRAGSetting,
    embeddingSource: "custom",
    embeddingProvider: "openai",
    embeddingBaseUrl: "http://localhost:11434/v1",
    embeddingApiKey: "custom-key",
  });
  assertEquals({
    provider: custom.embeddingProvider,
    url: custom.embeddingBaseUrl,
    key: custom.embeddingApiKey,
  }, {
    provider: "openai",
    url: "http://localhost:11434/v1",
    key: "custom-key",
  });
});
