import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/context.tsx";
import { t } from "../i18n/translations.ts";
import { SpeechSettingsPanel } from "./SpeechSettingsPanel.tsx";
import { SpeechActivity } from "./SpeechActivity.tsx";
import { defaultChatSettings, selectSpeechEndpoint } from "./settings.ts";
import { SpeechError, speechErrorMessage } from "./speechErrors.ts";

Deno.test("English speech settings contain no fixed Japanese UI text across services", () => {
  for (
    const endpoint of [
      null,
      "openai",
      "gemini-transcribe",
      "vertex-transcribe",
      "whisper-cpp",
      "custom",
    ] as const
  ) {
    const settings = endpoint
      ? selectSpeechEndpoint(
        { ...defaultChatSettings.speech, sendPhrase: "" },
        endpoint,
      )
      : { ...defaultChatSettings.speech, sendPhrase: "" };
    const html = renderToStaticMarkup(
      <I18nProvider language="en">
        <SpeechSettingsPanel
          settings={settings}
          aiSettings={defaultChatSettings}
          onChange={() => {}}
        />
      </I18nProvider>,
    );
    assertStringIncludes(html, "Voice input");
    assertEquals(/[ぁ-んァ-ヶ一-龠]/u.test(html), false, endpoint ?? "browser");
    if (!endpoint) assertStringIncludes(html, "English (en-US)");
  }
});

Deno.test("Japanese speech settings still use Japanese labels", () => {
  const html = renderToStaticMarkup(
    <I18nProvider language="ja">
      <SpeechSettingsPanel
        settings={defaultChatSettings.speech}
        aiSettings={defaultChatSettings}
        onChange={() => {}}
      />
    </I18nProvider>,
  );
  assertStringIncludes(html, "音声入力");
  assertStringIncludes(html, "日本語 (ja-JP)");
});

Deno.test("speech activity and service errors follow the UI language", () => {
  for (const status of ["starting", "recording", "preparing", "transcribing"]) {
    const html = renderToStaticMarkup(
      <I18nProvider language="en">
        <SpeechActivity status={status} stream={null} browser={false} />
      </I18nProvider>,
    );
    assertEquals(/[ぁ-んァ-ヶ一-龠]/u.test(html), false);
  }
  const error = new SpeechError("speech.error.auth", "STT HTTP 401: ");
  assertStringIncludes(
    speechErrorMessage(error, (key) => t("en", key)),
    "Check the API key",
  );
  assertStringIncludes(
    speechErrorMessage(error, (key) => t("ja", key)),
    "認証設定",
  );
  assertEquals(
    speechErrorMessage(new Error("External error"), (key) => t("en", key)),
    "External error",
  );
});
