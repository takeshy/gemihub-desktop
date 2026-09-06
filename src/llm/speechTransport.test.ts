import { assertEquals, assertRejects } from "jsr:@std/assert";
import { speechHTTPRequest } from "../lib/wailsBackend.ts";
import { encodeSpeechWav, transcribeSpeech } from "./speechTranscription.ts";
import { defaultSpeechSettings, selectSpeechEndpoint } from "./settings.ts";
import type { ExternalHTTPRequest } from "../lib/wailsBackend.ts";

Deno.test("recorded speech routes Vertex to native OAuth and AI Studio to the API-key transport", async () => {
  const scope = globalThis as unknown as { window?: unknown };
  const previous = scope.window;
  const calls: string[] = [];
  const response = {
    status: 200,
    headers: {},
    body:
      '{"candidates":[{"content":{"parts":[{"text":"認識結果"}]},"finishReason":"STOP"}]}',
    bodyBase64: "",
  };
  scope.window = {
    go: {
      main: {
        App: {
          VertexSpeechHTTPRequest: (request: ExternalHTTPRequest) => {
            calls.push("vertex");
            assertEquals(request.headers?.Authorization, undefined);
            assertEquals(request.headers?.["x-goog-api-key"], undefined);
            return Promise.resolve(response);
          },
          WorkflowHTTPRequest: (request: ExternalHTTPRequest) => {
            calls.push("gemini");
            assertEquals(request.headers?.["x-goog-api-key"], "ai-studio-key");
            return Promise.resolve(response);
          },
        },
      },
    },
  };
  try {
    for (
      const endpointType of ["vertex-transcribe", "gemini-transcribe"] as const
    ) {
      const settings = {
        ...selectSpeechEndpoint(defaultSpeechSettings, endpointType),
        apiKey: "ai-studio-key",
        vertexProjectId: "test-project",
      };
      assertEquals(
        await transcribeSpeech(
          encodeSpeechWav(new Float32Array(160)),
          settings,
          speechHTTPRequest,
          new AbortController().signal,
        ),
        "認識結果",
      );
    }
    assertEquals(calls, ["vertex", "gemini"]);
    scope.window = {};
    await assertRejects(
      () =>
        speechHTTPRequest({
          url: "https://aiplatform.googleapis.com/",
          method: "POST",
          headers: {},
        }),
      Error,
      "デスクトップアプリが必要",
    );
  } finally {
    if (previous === undefined) delete scope.window;
    else scope.window = previous;
  }
});
