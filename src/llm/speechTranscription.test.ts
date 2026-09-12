import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { defaultSpeechSettings } from "./settings.ts";
import { speechLanguageCodes } from "./speechLanguages.ts";
import {
  combineSpeechWavs,
  encodeSpeechWav,
  speechDraft,
  transcribeSpeech,
  transcriptionURL,
} from "./speechTranscription.ts";

Deno.test("retained recordings combine PCM in order with a single WAV header", async () => {
  const first = encodeSpeechWav(new Float32Array([0.25, -0.5]));
  const second = encodeSpeechWav(new Float32Array([0.75, 0]));
  const joined = await combineSpeechWavs([first, second]);
  const expected = encodeSpeechWav(new Float32Array([0.25, -0.5, 0.75, 0]));
  assertEquals(
    new Uint8Array(await joined.arrayBuffer()),
    new Uint8Array(await expected.arrayBuffer()),
  );
  assertEquals(joined.type, "audio/wav");
});

Deno.test("combined recording rejects empty audio and excessive total duration", async () => {
  await assertRejects(() => combineSpeechWavs([]), Error, "録音が空");
  const large = encodeSpeechWav(new Float32Array(16000 * 151));
  await assertRejects(
    () => combineSpeechWavs([large, large]),
    Error,
    "5分以内",
  );
});

Deno.test("STT builds compatible endpoint URLs and rejects ambiguous base URLs", () => {
  assertEquals(
    transcriptionURL("http://127.0.0.1:8080/", "whisper-cpp"),
    "http://127.0.0.1:8080/inference",
  );
  assertEquals(
    transcriptionURL(" https://api.openai.com/v1/ "),
    "https://api.openai.com/v1/audio/transcriptions",
  );
  assertEquals(
    transcriptionURL("http://127.0.0.1:8080/v1"),
    "http://127.0.0.1:8080/v1/audio/transcriptions",
  );
  assertEquals(
    transcriptionURL("http://stt.lan:8080"),
    "http://stt.lan:8080/audio/transcriptions",
  );
  assertEquals(
    transcriptionURL(
      "https://speech.example.azure.com/",
      "azure-mai-transcribe",
    ),
    "https://speech.example.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15",
  );
  for (
    const url of [
      "file:///tmp",
      "http://user:password@localhost",
      "https://host/v1?key=x",
      "https://host/#x",
    ]
  ) {
    assertThrows(() => transcriptionURL(url));
  }
});

Deno.test("Azure MAI sends Fast Transcription multipart fields and reads combined phrases", async () => {
  const audio = encodeSpeechWav(new Float32Array([0]));
  const text = await transcribeSpeech(audio, {
    ...defaultSpeechSettings,
    provider: "openai-compatible",
    endpointType: "azure-mai-transcribe",
    baseUrl: "https://speech.example.azure.com",
    apiKey: " azure-key ",
    model: "MAI-Transcribe-2",
    language: "ja",
  }, async (request) => {
    assertEquals(
      request.url,
      "https://speech.example.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15",
    );
    assertEquals(request.headers?.["Ocp-Apim-Subscription-Key"], "azure-key");
    assertEquals(request.headers?.Authorization, undefined);
    const bytes = Uint8Array.from(
      atob(request.bodyBase64!),
      (char) => char.charCodeAt(0),
    );
    const form = await new Response(bytes, { headers: request.headers })
      .formData();
    assertEquals(form.has("file"), false);
    assertEquals(form.has("model"), false);
    assertEquals((form.get("audio") as File).name, "recording.wav");
    assertEquals(JSON.parse(String(form.get("definition"))), {
      enhancedMode: { enabled: true, model: "MAI-Transcribe-2" },
      locales: ["ja"],
    });
    return {
      status: 200,
      headers: {},
      body: '{"combinedPhrases":[{"text":" こんにちは "},{"text":"世界。"}]}',
      bodyBase64: "",
    };
  }, new AbortController().signal);
  assertEquals(text, "こんにちは 世界。");
});

Deno.test("Azure MAI language choices follow the selected model", () => {
  const current = speechLanguageCodes(
    "openai-compatible",
    "azure-mai-transcribe",
    "MAI-Transcribe-2",
  );
  const legacy = speechLanguageCodes(
    "openai-compatible",
    "azure-mai-transcribe",
    "MAI-Transcribe-1.5",
  );
  assertEquals(current.includes("ja"), true);
  assertEquals(current.includes("yue"), true);
  assertEquals(legacy.includes("ja"), true);
  assertEquals(legacy.includes("yue"), false);
});

Deno.test("native whisper.cpp uses inference with JSON and explicit language auto", async () => {
  await transcribeSpeech(encodeSpeechWav(new Float32Array([0])), {
    ...defaultSpeechSettings,
    provider: "openai-compatible",
    endpointType: "whisper-cpp",
    baseUrl: "http://127.0.0.1:8080",
    model: "",
  }, async (request) => {
    assertEquals(request.url, "http://127.0.0.1:8080/inference");
    const bytes = Uint8Array.from(
      atob(request.bodyBase64!),
      (char) => char.charCodeAt(0),
    );
    const form = await new Response(bytes, { headers: request.headers })
      .formData();
    assertEquals(form.has("model"), false);
    assertEquals(form.get("language"), "auto");
    assertEquals(form.get("response_format"), "json");
    return {
      status: 200,
      body: '{"text":"test"}',
      headers: {},
      bodyBase64: "",
    };
  }, new AbortController().signal);
});

Deno.test("STT sends a multipart WAV with optional auth and automatic language omitted", async () => {
  const audio = encodeSpeechWav(new Float32Array([-1, 0, 1]));
  for (const apiKey of ["", " dummy "]) {
    const text = await transcribeSpeech(audio, {
      ...defaultSpeechSettings,
      apiKey,
      model: "whisper",
      baseUrl: "http://localhost:8080/v1",
    }, async (request) => {
      assertEquals(
        request.url,
        "http://localhost:8080/v1/audio/transcriptions",
      );
      assertEquals(request.method, "POST");
      assertEquals(
        request.headers?.Authorization,
        apiKey ? "Bearer dummy" : undefined,
      );
      const bytes = Uint8Array.from(
        atob(request.bodyBase64!),
        (char) => char.charCodeAt(0),
      );
      const multipart = await new Response(bytes, { headers: request.headers })
        .formData();
      assertEquals(multipart.get("model"), "whisper");
      assertEquals(multipart.has("language"), false);
      const file = multipart.get("file") as File;
      assertEquals(file.name, "recording.wav");
      assertEquals(file.type, "audio/wav");
      assertEquals(
        new Uint8Array(await file.arrayBuffer()),
        new Uint8Array(await audio.arrayBuffer()),
      );
      return {
        status: 200,
        headers: {},
        body: '{"text":" 日本語の認識結果 "}',
        bodyBase64: "",
      };
    }, new AbortController().signal);
    assertEquals(text, "日本語の認識結果");
  }
});

Deno.test("STT includes an explicit language and validates server responses", async () => {
  const audio = encodeSpeechWav(new Float32Array([0]));
  const settings = { ...defaultSpeechSettings, language: "ja" };
  await transcribeSpeech(audio, settings, async (request) => {
    const bytes = Uint8Array.from(
      atob(request.bodyBase64!),
      (char) => char.charCodeAt(0),
    );
    assertEquals(
      (await new Response(bytes, { headers: request.headers }).formData()).get(
        "language",
      ),
      "ja",
    );
    return {
      status: 200,
      headers: {},
      body: '{"text":"test"}',
      bodyBase64: "",
    };
  }, new AbortController().signal);
  for (
    const [status, body, message] of [
      [401, "secret-key", "STT HTTP 401"],
      [500, "server failure", "STT HTTP 500"],
      [200, "<html>", "JSON"],
      [200, '{"text":42}', "textフィールド"],
    ] as const
  ) {
    await assertRejects(
      () =>
        transcribeSpeech(
          audio,
          settings,
          async () => ({ status, body, headers: {}, bodyBase64: "" }),
          new AbortController().signal,
        ),
      Error,
      message,
    );
  }
});

Deno.test("STT ignores a response cancelled while the desktop request is in flight", async () => {
  const controller = new AbortController();
  await assertRejects(
    () =>
      transcribeSpeech(
        encodeSpeechWav(new Float32Array([0])),
        defaultSpeechSettings,
        async () => {
          controller.abort();
          return {
            status: 200,
            body: '{"text":"late response"}',
            headers: {},
            bodyBase64: "",
          };
        },
        controller.signal,
      ),
    DOMException,
  );
});

Deno.test("whisper silence markers do not become chat input", async () => {
  assertEquals(
    await transcribeSpeech(
      encodeSpeechWav(new Float32Array([0])),
      defaultSpeechSettings,
      async () => ({
        status: 200,
        body: '{"text":" [BLANK_AUDIO]\\n"}',
        headers: {},
        bodyBase64: "",
      }),
      new AbortController().signal,
    ),
    "",
  );
});

Deno.test("speech commands send only on final trailing over and preserve the draft", () => {
  assertEquals(speechDraft("下書き", "こんにちは over", false), {
    text: "下書き こんにちは over",
    send: false,
  });
  assertEquals(speechDraft("下書き", "こんにちは オーバー。", true), {
    text: "下書き こんにちは",
    send: true,
  });
  assertEquals(speechDraft("", "Turn over the page", true), {
    text: "Turn over the page",
    send: false,
  });
  assertEquals(speechDraft("", "leftover", true), {
    text: "leftover",
    send: false,
  });
  assertEquals(speechDraft("", "over", true), { text: "", send: true });
});

Deno.test("custom send phrases are literal, final-only, and can be disabled", () => {
  assertEquals(speechDraft("", "質問です 送って。", true, "送って, 完了"), {
    text: "質問です",
    send: true,
  });
  assertEquals(speechDraft("", "質問です 送って", false, "送って"), {
    text: "質問です 送って",
    send: false,
  });
  assertEquals(speechDraft("", "質問です over", true, ""), {
    text: "質問です over",
    send: false,
  });
  assertEquals(speechDraft("", "質問です 完了(送信)", true, "完了(送信)"), {
    text: "質問です",
    send: true,
  });
  assertEquals(speechDraft("", "質問です 完了送信", true, "完了(送信)"), {
    text: "質問です 完了送信",
    send: false,
  });
});

Deno.test("speech WAV encodes mono 16-bit 16 kHz PCM with clipped samples", async () => {
  const wav = encodeSpeechWav(new Float32Array([-2, 0, 2]));
  const view = new DataView(await wav.arrayBuffer());
  assertEquals(wav.size, 50);
  assertEquals(view.getUint32(4, true), 42);
  assertEquals(view.getUint16(22, true), 1);
  assertEquals(view.getUint32(24, true), 16000);
  assertEquals(view.getUint32(40, true), 6);
  assertEquals(view.getInt16(44, true), -32768);
  assertEquals(view.getInt16(46, true), 0);
  assertEquals(view.getInt16(48, true), 32767);
});

const geminiSettings = {
  ...defaultSpeechSettings,
  endpointType: "gemini-transcribe" as const,
  apiKey: " gemini-key ",
  language: "ja-JP",
};
const vertexSettings = {
  ...geminiSettings,
  endpointType: "vertex-transcribe" as const,
  vertexProjectId: "test-project",
};
const transcriptionResponse = (body: unknown, status = 200) => ({
  status,
  headers: {},
  body: JSON.stringify(body),
  bodyBase64: "",
});
const transcriptCandidate = (parts: unknown[], finishReason = "STOP") => ({
  candidates: [{ content: { parts }, finishReason }],
});

Deno.test("Transcribe sends WAV inline data to fixed Gemini and Vertex models with isolated auth", async () => {
  const wav = encodeSpeechWav(new Float32Array([0.5, -0.5]));
  for (const settings of [geminiSettings, vertexSettings]) {
    const vertex = settings.endpointType === "vertex-transcribe";
    const text = await transcribeSpeech(wav, {
      ...settings,
      baseUrl: "https://wrong.example",
      model: "wrong-model",
    }, async (request) => {
      assertEquals(
        request.url,
        vertex
          ? "https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/publishers/google/models/gemini-3.5-transcribe-preview:generateContent"
          : "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent",
      );
      assertEquals(request.method, "POST");
      assertEquals(
        request.headers,
        vertex ? { "Content-Type": "application/json" } : {
          "Content-Type": "application/json",
          "x-goog-api-key": "gemini-key",
        },
      );
      const body = JSON.parse(atob(request.bodyBase64!));
      assertEquals(body.generationConfig, {
        audioTranscriptionConfig: { languageCodes: ["ja-JP"] },
      });
      assertEquals(body.contents.length, 1);
      const audio = body.contents[0].parts[0].inlineData;
      assertEquals(audio.mimeType, "audio/wav");
      assertEquals(
        Uint8Array.from(atob(audio.data), (char) => char.charCodeAt(0)),
        new Uint8Array(await wav.arrayBuffer()),
      );
      return transcriptionResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "こんにちは。" }, { text: "オーバー。" }],
            },
            finishReason: "STOP",
          },
          { content: { parts: [{ text: "別候補" }] } },
        ],
      });
    }, new AbortController().signal);
    assertEquals(speechDraft("", text, true), {
      text: "こんにちは。",
      send: true,
    });
  }
});

Deno.test("Transcribe supports auto detection, short language aliases, silence and audio longer than a minute", async () => {
  const wav = encodeSpeechWav(new Float32Array(61 * 16000));
  for (
    const [language, expected] of [["auto", []], ["", []], ["ja", ["ja-JP"]], [
      "en",
      ["en-US"],
    ], ["ceb", ["ceb"]]] as const
  ) {
    assertEquals(
      await transcribeSpeech(
        wav,
        { ...geminiSettings, language },
        (request) => {
          assertEquals(
            JSON.parse(atob(request.bodyBase64!)).generationConfig
              .audioTranscriptionConfig.languageCodes,
            expected,
          );
          return Promise.resolve(
            transcriptionResponse(transcriptCandidate([{ text: "" }])),
          );
        },
        new AbortController().signal,
      ),
      "",
    );
  }
});

Deno.test("Transcribe rejects malformed, blocked and truncated output instead of sending partial text", async () => {
  const wav = encodeSpeechWav(new Float32Array(160));
  for (
    const body of [
      {},
      [],
      { error: { message: "secret" } },
      { candidates: [] },
      { candidates: [null] },
      transcriptCandidate([{ text: 42 }]),
    ]
  ) {
    await assertRejects(
      () =>
        transcribeSpeech(
          wav,
          geminiSettings,
          () => Promise.resolve(transcriptionResponse(body)),
          new AbortController().signal,
        ),
      Error,
      "応答形式が不正",
    );
  }
  await assertRejects(
    () =>
      transcribeSpeech(wav, geminiSettings, () =>
        Promise.resolve(
          transcriptionResponse({ promptFeedback: { blockReason: "SAFETY" } }),
        ), new AbortController().signal),
    Error,
    "処理を拒否",
  );
  await assertRejects(
    () =>
      transcribeSpeech(wav, geminiSettings, () =>
        Promise.resolve(
          transcriptionResponse(
            transcriptCandidate([{ text: "over" }], "MAX_TOKENS"),
          ),
        ), new AbortController().signal),
    Error,
    "完了しませんでした",
  );
  for (const settings of [geminiSettings, vertexSettings]) {
    const error = await assertRejects(
      () =>
        transcribeSpeech(
          wav,
          settings,
          () =>
            Promise.resolve(transcriptionResponse({ error: "secret" }, 403)),
          new AbortController().signal,
        ),
      Error,
      "STT HTTP 403",
    );
    assertEquals(error.message.includes("secret"), false);
  }
});

Deno.test("Transcribe validates credentials and project IDs and ignores cancelled responses", async () => {
  const wav = encodeSpeechWav(new Float32Array(160));
  const transport = () => {
    throw new Error("unexpected transport");
  };
  await assertRejects(
    () =>
      transcribeSpeech(
        wav,
        { ...geminiSettings, apiKey: "" },
        transport,
        new AbortController().signal,
      ),
    Error,
    "API Keyを設定",
  );
  for (
    const vertexProjectId of ["", "../other", "a?key=secret", "a/b", "a#b"]
  ) {
    await assertRejects(
      () =>
        transcribeSpeech(
          wav,
          { ...vertexSettings, vertexProjectId },
          transport,
          new AbortController().signal,
        ),
      Error,
      "Project IDを設定",
    );
  }
  await assertRejects(
    () =>
      transcribeSpeech(
        wav,
        { ...geminiSettings, language: "ja JP" },
        transport,
        new AbortController().signal,
      ),
    Error,
    "言語コード",
  );
  const controller = new AbortController();
  await assertRejects(() =>
    transcribeSpeech(wav, vertexSettings, () => {
      controller.abort();
      return Promise.resolve(
        transcriptionResponse(transcriptCandidate([{ text: "over" }])),
      );
    }, controller.signal), DOMException);
  await assertRejects(
    () => transcribeSpeech(wav, geminiSettings, transport, controller.signal),
    DOMException,
  );
});
