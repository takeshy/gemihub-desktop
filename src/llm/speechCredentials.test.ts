import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import {
  type ChatSettings,
  defaultChatSettings,
  newModelProfile,
  resolveSpeechSettings,
  selectModelProfile,
  selectSpeechEndpoint,
  switchChatProvider,
} from "./settings.ts";

function configuredSettings(): ChatSettings {
  return {
    ...defaultChatSettings,
    provider: "cli",
    speech: selectSpeechEndpoint(
      defaultChatSettings.speech,
      "gemini-transcribe",
    ),
    modelProfiles: [
      { ...newModelProfile("gemini"), id: "gemini", apiKey: "gemini-key" },
      { ...newModelProfile("openai"), id: "openai", apiKey: "openai-key" },
    ],
  };
}

Deno.test("speech inherits the matching AI key without copying it into saved speech settings", () => {
  const settings = configuredSettings();
  const saved = JSON.stringify(settings);
  assertEquals(resolveSpeechSettings(settings).apiKey, "gemini-key");
  assertEquals(
    resolveSpeechSettings(
      settings,
      selectSpeechEndpoint(settings.speech, "openai"),
    ).apiKey,
    "openai-key",
  );
  assertEquals(settings.speech.apiKey, "");
  assertEquals(JSON.stringify(settings), saved);
  const rotated = {
    ...settings,
    modelProfiles: settings.modelProfiles.map((p) => ({
      ...p,
      apiKey: p.apiKey + "-new",
    })),
  };
  assertEquals(resolveSpeechSettings(rotated).apiKey, "gemini-key-new");
});

Deno.test("selected official profile has priority and its current edits override its stored key", () => {
  const settings = configuredSettings();
  settings.modelProfiles.push({
    ...newModelProfile("gemini"),
    id: "second",
    apiKey: "stored-key",
  });
  settings.selectedModelProfileId = "second";
  assertEquals(resolveSpeechSettings(settings).apiKey, "stored-key");
  settings.provider = "gemini";
  settings.endpoint = "https://generativelanguage.googleapis.com/v1beta";
  settings.apiKey = "edited-key";
  assertEquals(resolveSpeechSettings(settings).apiKey, "edited-key");
  settings.apiKey = "";
  assertEquals(resolveSpeechSettings(settings).apiKey, "gemini-key");
});

Deno.test("registered AI key wins over a speech key and unrelated services do not inherit API keys", () => {
  const settings = configuredSettings();
  const explicit = { ...settings.speech, apiKey: "speech-key" };
  assertEquals(resolveSpeechSettings(settings, explicit).apiKey, "gemini-key");
  for (
    const endpoint of ["whisper-cpp", "custom", "vertex-transcribe"] as const
  ) {
    const speech = selectSpeechEndpoint(settings.speech, endpoint);
    assertEquals(resolveSpeechSettings(settings, speech).apiKey, "");
  }
  const browser = { ...settings.speech, provider: "browser" as const };
  assertStrictEquals(resolveSpeechSettings(settings, browser), browser);
  for (
    const baseUrl of [
      "http://127.0.0.1:8080/v1",
      "https://api.openai.com.example/v1",
      "http://api.openai.com/v1",
      "https://user@api.openai.com/v1",
      "https://api.openai.com/v1?x=y",
    ]
  ) {
    const speech = {
      ...selectSpeechEndpoint(settings.speech, "openai"),
      baseUrl,
    };
    assertEquals(resolveSpeechSettings(settings, speech).apiKey, "");
  }
});

Deno.test("speech ignores disabled and compatible AI profiles and stale legacy keys", () => {
  for (
    const change of [
      { enabled: false },
      { local: true },
      { openAICompatible: true },
      { endpoint: "https://proxy.example/v1" },
      { apiKey: "" },
    ]
  ) {
    const settings = configuredSettings();
    settings.speech = selectSpeechEndpoint(settings.speech, "openai");
    settings.providerProfiles = {
      openai: { ...settings.modelProfiles[1], apiKey: "stale-key" },
    };
    settings.modelProfiles = settings.modelProfiles.map((p) =>
      p.provider === "openai" ? { ...p, ...change } : p
    );
    assertEquals(resolveSpeechSettings(settings).apiKey, "");
  }
});

Deno.test("speech can reuse legacy AI keys for either provider", () => {
  for (const provider of ["openai", "gemini"] as const) {
    const profile = newModelProfile(provider);
    const settings: ChatSettings = {
      ...defaultChatSettings,
      provider,
      endpoint: profile.endpoint,
      apiKey: "legacy-key",
      speech: selectSpeechEndpoint(
        defaultChatSettings.speech,
        provider === "openai" ? "openai" : "gemini-transcribe",
      ),
    };
    assertEquals(resolveSpeechSettings(settings).apiKey, "legacy-key");
    assertEquals(
      resolveSpeechSettings({
        ...settings,
        provider: "cli",
        apiKey: "",
        providerProfiles: { [provider]: { ...profile, apiKey: "cached-key" } },
      }).apiKey,
      "cached-key",
    );
  }
});

Deno.test("Vertex speech always follows current AI settings, overriding old speech project and key", () => {
  const settings: ChatSettings = {
    ...configuredSettings(),
    provider: "vertex",
    vertexProjectId: "current-project",
    speech: {
      ...selectSpeechEndpoint(defaultChatSettings.speech, "vertex-transcribe"),
      vertexProjectId: "old-speech-project",
      apiKey: "obsolete-key",
    },
    providerProfiles: {
      vertex: { ...newModelProfile(), vertexProjectId: "cached-project" },
    },
  };
  const before = JSON.stringify(settings);
  assertEquals(
    resolveSpeechSettings(settings).vertexProjectId,
    "current-project",
  );
  assertEquals(resolveSpeechSettings(settings).apiKey, "");
  assertEquals(
    resolveSpeechSettings({ ...settings, vertexProjectId: "updated-project" })
      .vertexProjectId,
    "updated-project",
  );
  assertEquals(
    resolveSpeechSettings({ ...settings, vertexProjectId: "" }).vertexProjectId,
    "",
  );
  assertEquals(JSON.stringify(settings), before);
});

Deno.test("Vertex configuration remains available to speech after switching chat to another provider", () => {
  const settings: ChatSettings = {
    ...configuredSettings(),
    provider: "vertex",
    vertexProjectId: "vertex-project",
    vertexOAuthClientId: "oauth-client",
    speech: selectSpeechEndpoint(
      defaultChatSettings.speech,
      "vertex-transcribe",
    ),
  };
  for (
    const other of [
      selectModelProfile(settings, "openai"),
      switchChatProvider(settings, "gemini"),
      switchChatProvider(settings, "cli"),
    ]
  ) {
    assertEquals(
      resolveSpeechSettings(other).vertexProjectId,
      "vertex-project",
    );
    assertEquals(
      other.providerProfiles.vertex?.vertexOAuthClientId,
      "oauth-client",
    );
    const changed = {
      ...other,
      providerProfiles: {
        ...other.providerProfiles,
        vertex: {
          ...other.providerProfiles.vertex!,
          vertexProjectId: "changed-project",
        },
      },
    };
    assertEquals(
      resolveSpeechSettings(changed).vertexProjectId,
      "changed-project",
    );
    assertEquals(
      switchChatProvider(other, "vertex").vertexProjectId,
      "vertex-project",
    );
  }
  assertEquals(
    resolveSpeechSettings({
      ...settings,
      provider: "cli",
      vertexProjectId: "",
      providerProfiles: {},
    }).vertexProjectId,
    "",
  );
});

Deno.test("speech-only keys work with the opposite cloud AI, local models and OpenCode until an AI key is registered", () => {
  for (const endpointType of ["openai", "gemini-transcribe"] as const) {
    const provider = endpointType === "openai" ? "openai" : "gemini";
    const other = newModelProfile(provider === "openai" ? "gemini" : "openai");
    const local = {
      ...newModelProfile("openai", true),
      id: "local",
      apiKey: "local-key",
    };
    const opencode = {
      ...local,
      id: "opencode",
      localFramework: "opencode" as const,
      endpoint: "http://127.0.0.1:4096",
      apiKey: "opencode-key",
    };
    for (const chatProfile of [other, local, opencode]) {
      const settings: ChatSettings = {
        ...defaultChatSettings,
        provider: chatProfile.provider,
        selectedModelProfileId: chatProfile.id,
        endpoint: chatProfile.endpoint,
        apiKey: chatProfile.apiKey,
        modelProfiles: [chatProfile],
        speech: {
          ...selectSpeechEndpoint(defaultChatSettings.speech, endpointType),
          apiKey: "speech-only-key",
        },
      };
      assertEquals(resolveSpeechSettings(settings).apiKey, "speech-only-key");
      assertEquals(
        resolveSpeechSettings(settings, { ...settings.speech, apiKey: "" })
          .apiKey,
        "",
      );
      const registered = {
        ...settings,
        modelProfiles: [...settings.modelProfiles, {
          ...newModelProfile(provider),
          apiKey: "registered-key",
        }],
      };
      assertEquals(resolveSpeechSettings(registered).apiKey, "registered-key");
      assertEquals(settings.speech.apiKey, "speech-only-key");
    }
  }
});
