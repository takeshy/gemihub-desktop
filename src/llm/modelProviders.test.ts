import { assertEquals } from "jsr:@std/assert";
import { fetchProviderModels } from "./modelProviders.ts";
import { newModelProfile } from "./settings.ts";

Deno.test("Gemini model discovery keeps API keys out of URLs", async () => {
  const runtime = globalThis as unknown as { window?: { go?: unknown } };
  const previous = runtime.window;
  let received: { url: string; headers: Record<string, string> } | undefined;
  runtime.window = {
    go: {
      main: {
        App: {
          WorkflowHTTPRequest: (
            request: { url: string; headers: Record<string, string> },
          ) => {
            received = request;
            return Promise.resolve({
              status: 200,
              headers: {},
              body: JSON.stringify({
                models: [{ name: "models/gemini-test" }],
              }),
              bodyBase64: "",
            });
          },
        },
      },
    },
  };
  try {
    const models = await fetchProviderModels({
      id: "gemini",
      name: "Gemini",
      provider: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: "top-secret",
      model: "",
      vertexProjectId: "",
      vertexLocation: "",
      vertexOAuthClientId: "",
      vertexOAuthClientSecret: "",
      enabledModels: [],
      availableModels: [],
      enabled: true,
      local: false,
      openAICompatible: false,
      localFramework: "ollama",
      username: "",
      password: "",
    });
    assertEquals(models, ["gemini-test"]);
    assertEquals(received?.url.includes("top-secret"), false);
    assertEquals(received?.headers["x-goog-api-key"], "top-secret");
  } finally {
    runtime.window = previous;
  }
});

Deno.test("AnythingLLM uses its OpenAI compatibility model endpoint", async () => {
  const runtime = globalThis as unknown as { window?: { go?: unknown } };
  const previous = runtime.window;
  let receivedURL = "";
  runtime.window = {
    go: { main: { App: { WorkflowHTTPRequest: (request: { url: string }) => {
      receivedURL = request.url;
      return Promise.resolve({
        status: 200,
        headers: {},
        body: JSON.stringify({ data: [{ id: "llama" }] }),
        bodyBase64: "",
      });
    } } } },
  };
  try {
    const profile = {
      ...newModelProfile("openai", true),
      endpoint: "http://127.0.0.1:3001/api/v1/openai",
      localFramework: "anythingllm" as const,
    };
    assertEquals(await fetchProviderModels(profile), ["llama"]);
    assertEquals(
      receivedURL,
      "http://127.0.0.1:3001/api/v1/openai/models",
    );
  } finally {
    runtime.window = previous;
  }
});

Deno.test("OpenCode model discovery flattens provider and model IDs", async () => {
  const runtime = globalThis as unknown as { window?: { go?: unknown } };
  const previous = runtime.window;
  runtime.window = {
    go: { main: { App: { WorkflowHTTPRequest: () => Promise.resolve({
      status: 200,
      headers: {},
      body: JSON.stringify({
        providers: [{ providerID: "ollama", models: { qwen3: { id: "qwen3" } } }],
      }),
      bodyBase64: "",
    }) } } },
  };
  try {
    const profile = {
      ...newModelProfile("openai", true),
      endpoint: "http://127.0.0.1:4096",
      localFramework: "opencode" as const,
    };
    assertEquals(await fetchProviderModels(profile), ["ollama/qwen3"]);
  } finally {
    runtime.window = previous;
  }
});
