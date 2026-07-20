import { assertEquals } from "jsr:@std/assert";
import { fetchProviderModels } from "./modelProviders.ts";

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
    });
    assertEquals(models, ["gemini-test"]);
    assertEquals(received?.url.includes("top-secret"), false);
    assertEquals(received?.headers["x-goog-api-key"], "top-secret");
  } finally {
    runtime.window = previous;
  }
});
