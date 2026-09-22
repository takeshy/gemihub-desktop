import { assertEquals } from "jsr:@std/assert";
import {
  chatModelChoices,
  configuredModelOptions,
  defaultChatSettings,
  defaultRAGSetting,
  defaultSpeechSettings,
  getOpenRouterAPIKey,
  loadChatSettings,
  loadSpeechSettings,
  localLLMFrameworks,
  newModelProfile,
  resolveRAGSetting,
  selectConfiguredModel,
  selectModelProfile,
  selectSpeechEndpoint,
  updateModelProfile,
} from "./settings.ts";

Deno.test("speech settings keep browser as default and load compatible endpoints with an empty key", () => {
  assertEquals(
    loadChatSettings({ getItem: () => "{}" }).speech.provider,
    "browser",
  );
  const speech = loadChatSettings({
    getItem: () =>
      JSON.stringify({
        speech: {
          provider: "openai-compatible",
          baseUrl: "http://127.0.0.1:8080/v1",
          apiKey: "",
          model: "whisper",
        },
      }),
  }).speech;
  assertEquals(speech, {
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:8080/v1",
    apiKey: "",
    model: "whisper",
    language: "auto",
    sendPhrase: "over, オーバー",
    endpointType: "custom",
    shortcut: "",
    silenceSeconds: 3,
    questionPhrases: "question, question mark",
    newlinePhrases: "enter",
    exclamationPhrases: "exclamation",
    replacements: "",
    autoReadAloud: false,
    readAloudRate: 1,
  });
  assertEquals(
    loadChatSettings({ getItem: () => '{"speech":{"sendPhrase":""}}' }).speech
      .sendPhrase,
    "",
  );
});

Deno.test("read-aloud settings load with clamped values", () => {
  const loaded = loadSpeechSettings({
    autoReadAloud: true,
    readAloudRate: 99,
  });
  assertEquals(loaded.autoReadAloud, true);
  assertEquals(loaded.readAloudRate, 5);
  assertEquals(loadSpeechSettings({ readAloudRate: 0 }).readAloudRate, 0.5);
  assertEquals(loadSpeechSettings({ readAloudRate: NaN }).readAloudRate, 1);
  assertEquals(loadSpeechSettings({}).autoReadAloud, false);
});

Deno.test("current OpenAI and Gemini model choices omit Gemini 2.5", () => {
  assertEquals(chatModelChoices.openai.includes("gpt-6-astra"), true);
  assertEquals(chatModelChoices.openai.includes("gpt-5.6-sol"), true);
  assertEquals(
    chatModelChoices.gemini.some((model) => model.includes("2.5")),
    false,
  );
  assertEquals(
    chatModelChoices.vertex.some((model) => model.includes("2.5")),
    false,
  );
});

Deno.test("Gemini defaults and legacy Flash settings follow GemiHub", () => {
  let stored = JSON.stringify({
    ...defaultChatSettings,
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
  });
  const storage = {
    getItem: (key: string) =>
      key === "gemihub-desktop:chat-settings" ? stored : null,
  };
  assertEquals(loadChatSettings(storage).model, "gemini-3.5-flash-lite");
  for (
    const model of [
      "gemini-3.5-flash",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
    ]
  ) {
    stored = JSON.stringify({
      ...defaultChatSettings,
      provider: "gemini",
      model,
    });
    assertEquals(loadChatSettings(storage).model, "gemini-3.8-flash");
  }
  assertEquals(defaultChatSettings.model, "gpt-5.5");
});

// A stored Gemini 2.x id would be sent as-is and rejected by the API, and it gets
// no reasoning control in the chat bar, so loading drops it for a current model.
Deno.test("stored Gemini 2.x models are migrated out of profiles on load", () => {
  const stored = JSON.stringify({
    ...defaultChatSettings,
    provider: "gemini",
    model: "gemini-2.5-pro",
    modelProfiles: [{
      id: "profile-gemini",
      name: "Gemini",
      provider: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "key",
      model: "gemini-2.5-pro",
      enabledModels: [
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-3.8-flash",
      ],
      enabled: true,
    }],
    selectedModelProfileId: "profile-gemini",
  });
  const settings = loadChatSettings({
    getItem: (key: string) =>
      key === "gemihub-desktop:chat-settings" ? stored : null,
  });
  assertEquals(settings.model, "gemini-3.1-pro-preview");
  assertEquals(settings.modelProfiles[0].model, "gemini-3.1-pro-preview");
  // gemini-2.5-flash and gemini-3.8-flash collapse onto one entry.
  assertEquals(settings.modelProfiles[0].enabledModels, [
    "gemini-3.1-pro-preview",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
  ]);
  assertEquals(
    configuredModelOptions(settings).some((option) =>
      option.model.includes("2.5")
    ),
    false,
  );
});

Deno.test("OpenAI reasoning effort defaults to provider behavior and validates stored values", () => {
  const storage = (value: string) => ({
    getItem: (key: string) =>
      key === "gemihub-desktop:chat-settings" ? value : null,
  });
  assertEquals(
    loadChatSettings(storage("{}")).openAIReasoningEffort,
    "default",
  );
  assertEquals(
    loadChatSettings(storage(JSON.stringify({ openAIReasoningEffort: "max" })))
      .openAIReasoningEffort,
    "max",
  );
  assertEquals(
    loadChatSettings(
      storage(JSON.stringify({ openAIReasoningEffort: "invalid" })),
    ).openAIReasoningEffort,
    "default",
  );
});

Deno.test("Gemini reasoning effort defaults to provider behavior and validates stored values", () => {
  const storage = (value: string) => ({
    getItem: (key: string) =>
      key === "gemihub-desktop:chat-settings" ? value : null,
  });
  assertEquals(
    loadChatSettings(storage("{}")).geminiReasoningEffort,
    "default",
  );
  assertEquals(
    loadChatSettings(storage(JSON.stringify({ geminiReasoningEffort: "high" })))
      .geminiReasoningEffort,
    "high",
  );
  assertEquals(
    loadChatSettings(
      storage(JSON.stringify({ geminiReasoningEffort: "invalid" })),
    ).geminiReasoningEffort,
    "default",
  );
});

Deno.test("multiple API and local profiles become distinct selectable models", () => {
  const cloud = {
    ...newModelProfile("openai"),
    id: "cloud",
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    enabledModels: ["model-a", "model-b"],
    model: "model-a",
  };
  const local = {
    ...newModelProfile("openai", true),
    id: "local",
    name: "Ollama",
    enabledModels: ["qwen3"],
    model: "qwen3",
  };
  const settings = selectModelProfile({
    ...defaultChatSettings,
    modelProfiles: [cloud, local],
  }, cloud.id);
  assertEquals(configuredModelOptions(settings).map((item) => item.label), [
    "OpenRouter — model-a",
    "OpenRouter — model-b",
    "Ollama — qwen3",
  ]);
  const selected = selectConfiguredModel(settings, "profile:local:qwen3");
  assertEquals({
    id: selected.selectedModelProfileId,
    endpoint: selected.endpoint,
    model: selected.model,
  }, { id: "local", endpoint: "http://127.0.0.1:11434/v1", model: "qwen3" });
});

Deno.test("OpenAI and OpenAI Compatible profiles have distinct defaults", () => {
  const official = newModelProfile("openai");
  const compatible = newModelProfile("openai", false, true);
  assertEquals({
    name: official.name,
    endpoint: official.endpoint,
    compatible: official.openAICompatible,
  }, {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1",
    compatible: false,
  });
  assertEquals({
    name: compatible.name,
    endpoint: compatible.endpoint,
    compatible: compatible.openAICompatible,
  }, {
    name: "OpenAI Compatible",
    endpoint: "",
    compatible: true,
  });
});

Deno.test("Local LLM frameworks expose the expected connection presets", () => {
  assertEquals(Object.keys(localLLMFrameworks), [
    "ollama",
    "lm-studio",
    "anythingllm",
    "vllm",
    "opencode",
  ]);
  assertEquals(
    localLLMFrameworks.anythingllm.endpoint,
    "http://127.0.0.1:3001/api/v1/openai",
  );
  assertEquals(
    localLLMFrameworks.opencode.endpoint,
    "http://127.0.0.1:4096",
  );
});

Deno.test("editing the active profile keeps type and credentials in sync", () => {
  const anthropic = {
    ...newModelProfile("anthropic"),
    id: "provider",
    model: "claude-sonnet-5",
    enabledModels: ["claude-sonnet-5"],
  };
  const selected = selectModelProfile({
    ...defaultChatSettings,
    modelProfiles: [anthropic],
  }, anthropic.id);
  const compatible = updateModelProfile(selected, anthropic.id, {
    provider: "openai",
    openAICompatible: true,
    endpoint: "https://example.test/v1",
    apiKey: "pasted-key",
    model: "custom-model",
  });
  assertEquals({
    provider: compatible.provider,
    endpoint: compatible.endpoint,
    apiKey: compatible.apiKey,
    profile: compatible.modelProfiles[0],
  }, {
    provider: "openai",
    endpoint: "https://example.test/v1",
    apiKey: "pasted-key",
    profile: {
      ...anthropic,
      provider: "openai",
      openAICompatible: true,
      endpoint: "https://example.test/v1",
      apiKey: "pasted-key",
      model: "custom-model",
    },
  });
});

Deno.test("selecting a CLI clears the previous API model", () => {
  const settings = {
    ...defaultChatSettings,
    model: "gemini-3.8-flash",
    verifiedCliTypes: ["codex" as const],
  };
  const selected = selectConfiguredModel(settings, "cli:codex");
  assertEquals(
    {
      provider: selected.provider,
      cliType: selected.cliType,
      model: selected.model,
    },
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

Deno.test("Jev RAG filtering resolves a configured OpenRouter key", () => {
  const profile = {
    ...newModelProfile("openai"),
    enabled: true,
    endpoint: "https://openrouter.ai/api/v1",
    apiKey: " router-key ",
  };
  const settings = {
    ...defaultChatSettings,
    modelProfiles: [profile],
    jevRagFilterEnabled: true,
    jevApiKey: "direct-key",
    jevUseOpenRouter: true,
  };
  assertEquals(getOpenRouterAPIKey(settings), "router-key");
  const resolved = resolveRAGSetting(settings, defaultRAGSetting);
  assertEquals({
    enabled: resolved.jevRagFilterEnabled,
    key: resolved.jevApiKey,
    openRouter: resolved.jevUseOpenRouter,
  }, { enabled: true, key: "router-key", openRouter: true });
});

Deno.test("speech service presets set OpenAI defaults and preserve legacy whisper settings", () => {
  const legacy = loadSpeechSettings({
    provider: "whisper-cpp",
    baseUrl: "http://127.0.0.1:8080",
    language: "ja",
    apiKey: "local-key",
  });
  assertEquals(legacy.provider, "openai-compatible");
  assertEquals(legacy.endpointType, "whisper-cpp");
  assertEquals(legacy.baseUrl, "http://127.0.0.1:8080");
  const openai = selectSpeechEndpoint(legacy, "openai");
  assertEquals(openai.baseUrl, "https://api.openai.com/v1");
  assertEquals(openai.model, "whisper-1");
  assertEquals(openai.apiKey, "");
  assertEquals(openai.language, "ja");
  const local = selectSpeechEndpoint({
    ...defaultSpeechSettings,
    apiKey: "cloud-key",
  }, "whisper-cpp");
  assertEquals(local.baseUrl, "http://127.0.0.1:8080");
  assertEquals(local.apiKey, "");
  assertEquals(
    selectSpeechEndpoint({ ...openai, apiKey: "openai-key" }, "openai").apiKey,
    "openai-key",
  );
  assertEquals(selectSpeechEndpoint(local, "custom").baseUrl, local.baseUrl);
  const edited = { ...local, baseUrl: "http://192.168.1.20:9090" };
  assertEquals(loadSpeechSettings(edited).baseUrl, "http://192.168.1.20:9090");
  assertEquals(loadSpeechSettings(edited).endpointType, "whisper-cpp");
});

Deno.test("Transcribe presets persist both backends without sharing API keys", () => {
  const gemini = selectSpeechEndpoint({
    ...defaultSpeechSettings,
    apiKey: "openai-secret",
  }, "gemini-transcribe");
  assertEquals(gemini.model, "gemini-3.5-transcribe");
  assertEquals(gemini.language, "auto");
  assertEquals(gemini.apiKey, "");
  assertEquals(loadSpeechSettings(gemini), gemini);
  const vertex = selectSpeechEndpoint({
    ...gemini,
    apiKey: "gemini-key",
    vertexProjectId: "my-project",
  }, "vertex-transcribe");
  assertEquals(vertex.apiKey, "");
  assertEquals(vertex.vertexProjectId, "my-project");
  assertEquals(vertex.model, "gemini-3.5-transcribe-preview");
  assertEquals(loadSpeechSettings(vertex), vertex);
  const openai = selectSpeechEndpoint(vertex, "openai");
  assertEquals(openai.model, "whisper-1");
  assertEquals(openai.language, "auto");
  assertEquals(
    selectSpeechEndpoint(
      { ...defaultSpeechSettings, language: "ja" },
      "gemini-transcribe",
    ).language,
    "ja-JP",
  );
});

Deno.test("old Cloud STT settings migrate to Transcribe without reusing Cloud STT credentials", () => {
  const migrated = loadSpeechSettings({
    provider: "openai-compatible",
    endpointType: "google-cloud",
    baseUrl: "https://speech.googleapis.com/v1",
    apiKey: "old-cloud-key",
    model: "default",
    language: "ja-JP",
    shortcut: "Ctrl+Space",
    silenceSeconds: 5,
  });
  assertEquals(migrated.endpointType, "gemini-transcribe");
  assertEquals(migrated.model, "gemini-3.5-transcribe");
  assertEquals(
    migrated.baseUrl,
    "https://generativelanguage.googleapis.com/v1beta",
  );
  assertEquals(migrated.apiKey, "");
  assertEquals(migrated.language, "ja-JP");
  assertEquals(migrated.shortcut, "Ctrl+Space");
  assertEquals(migrated.silenceSeconds, 5);
});
