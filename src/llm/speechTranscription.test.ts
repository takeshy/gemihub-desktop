import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert";
import { defaultSpeechSettings } from "./settings.ts";
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
