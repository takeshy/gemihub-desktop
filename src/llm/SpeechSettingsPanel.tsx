import { speechErrorMessage } from "./speechErrors";
import { useI18n } from "../i18n/context";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  Globe,
  LoaderCircle,
  Mic,
  Radio,
  Server,
  Square,
} from "lucide-react";
import { speechHTTPRequest } from "../lib/wailsBackend";
import { encodeSpeechWav, transcribeSpeech } from "./speechTranscription";
import {
  type ChatSettings,
  isGeminiSpeech,
  resolveSpeechSettings,
  selectSpeechEndpoint,
  type SpeechSettings,
} from "./settings";
import { speechShortcutFromEvent, speechShortcutLabel } from "./speechShortcut";

export function SpeechSettingsPanel(
  { settings, onChange, aiSettings }: {
    settings: SpeechSettings;
    aiSettings: ChatSettings;
    onChange: (settings: SpeechSettings) => void;
  },
) {
  const { t, language } = useI18n();
  const providers = [
    {
      id: "browser",
      label: t("speech.browser"),
      hint: t("speech.browserHint"),
      icon: Globe,
    },
    {
      id: "openai-compatible",
      label: t("speech.api"),
      hint: t("speech.apiHint"),
      icon: AudioLines,
    },
  ] as const;
  const resolvedSettings = useMemo(
    () => resolveSpeechSettings(aiSettings, settings),
    [aiSettings, settings],
  );
  const inheritedKey = useMemo(
    () =>
      !!resolveSpeechSettings(aiSettings, { ...settings, apiKey: "" }).apiKey
        .trim(),
    [aiSettings, settings],
  );
  const sharedKeyService = settings.endpointType === "gemini-transcribe" ||
    settings.endpointType === "openai";
  const google = isGeminiSpeech(settings.endpointType);
  const vertex = settings.endpointType === "vertex-transcribe";
  const patch = (change: Partial<SpeechSettings>) =>
    onChange({ ...settings, ...change });
  const pending = useRef<AbortController | null>(null);
  const [checking, setChecking] = useState<"microphone" | "server" | null>(
    null,
  );
  const [feedback, setFeedback] = useState<
    { ok: boolean; text: string } | null
  >(null);
  const [elapsed, setElapsed] = useState(0);
  const [shortcutHint, setShortcutHint] = useState("");
  useEffect(() => {
    pending.current?.abort();
    pending.current = null;
    setChecking(null);
    setFeedback(null);
    setShortcutHint("");
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [resolvedSettings, language]);
  useEffect(() => {
    if (!checking) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [checking]);

  const cancel = () => {
    pending.current?.abort();
    pending.current = null;
    setChecking(null);
    setFeedback(null);
  };
  const test = async (kind: "microphone" | "server") => {
    const controller = new AbortController();
    pending.current = controller;
    setChecking(kind);
    setFeedback(null);
    try {
      let message: string;
      if (kind === "microphone") {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(t("speech.noMic"));
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const name = stream.getAudioTracks()[0]?.label;
        stream.getTracks().forEach((track) => track.stop());
        controller.signal.throwIfAborted();
        message = `${t("speech.micChecked")}${name ? `: ${name}` : ""}`;
      } else {
        await transcribeSpeech(
          encodeSpeechWav(new Float32Array(32000)),
          resolvedSettings,
          speechHTTPRequest,
          controller.signal,
        );
        message = t("speech.connected");
      }
      if (pending.current === controller) {
        setFeedback({ ok: true, text: message });
      }
    } catch (error) {
      if (pending.current === controller) {
        setFeedback({
          ok: false,
          text: speechErrorMessage(error, t),
        });
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setChecking(null);
      }
    }
  };
  return (
    <section className="speech-settings" aria-label={t("speech.title")}>
      <header className="speech-settings-heading">
        <span className="speech-settings-icon">
          <Mic size={20} />
        </span>
        <div>
          <strong>
            {t("speech.title")} <small>Speech-to-Text</small>
          </strong>
          <p>{t("speech.subtitle")}</p>
        </div>
      </header>
      <aside className="speech-os-tip">
        <strong>{t("speech.osTitle")}</strong>
        <p>
          {t("speech.osHint")}
        </p>
        <div className="speech-os-shortcuts">
          <div>
            <strong>Windows</strong>
            <span>
              <kbd>Win</kbd> + <kbd>H</kbd>
            </span>
          </div>
          <div>
            <strong>macOS</strong>
            <span>
              <kbd>Fn</kbd> + <kbd>D</kbd> {t("speech.or")} <kbd>🎤</kbd>{" "}
              {t("speech.key")}
            </span>
          </div>
        </div>
      </aside>
      <div className="speech-settings-section-title">
        <strong>{t("speech.inApp")}</strong>
      </div>
      <div
        className="speech-provider-options"
        role="group"
        aria-label={t("speech.method")}
      >
        {providers.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={settings.provider === id}
            onClick={() =>
              patch({
                provider: id,
              })}
          >
            <Icon size={17} />
            <strong>{label}</strong>
            <small>{hint}</small>
            {settings.provider === id && (
              <Check className="speech-provider-check" size={13} />
            )}
          </button>
        ))}
      </div>
      <div className="speech-settings-section">
        <div className="speech-settings-section-title">
          <Mic size={14} />
          <strong>{t("speech.micLanguage")}</strong>
        </div>
        <div className="speech-settings-grid">
          <div className="speech-microphone-field">
            <span>{t("speech.mic")}</span>
            <strong>{t("speech.defaultMic")}</strong>
            <button
              type="button"
              className="speech-secondary-button"
              disabled={!!checking}
              onClick={() => void test("microphone")}
            >
              <Mic size={13} />
              {t("speech.testMic")}
            </button>
          </div>
          <label className="settings-field">
            <span>{t("speech.language")}</span>
            {settings.provider === "browser"
              ? (
                <input
                  value={language === "ja"
                    ? "日本語 (ja-JP)"
                    : "English (en-US)"}
                  readOnly
                />
              )
              : (
                <input
                  value={settings.language}
                  placeholder="auto"
                  list="speech-language-options"
                  onChange={(event) => patch({ language: event.target.value })}
                />
              )}
            <small>
              {settings.provider === "browser"
                ? t("speech.browserLanguageHint")
                : google
                ? t("speech.googleLanguages")
                : t("speech.languages")}
            </small>
          </label>
          <datalist id="speech-language-options">
            <option value="auto" />
            <option value={google ? "ja-JP" : "ja"} />
            <option value={google ? "en-US" : "en"} />
          </datalist>
        </div>
        {settings.provider !== "browser" && (
          <label className="settings-field">
            <span>{t("speech.silence")}</span>
            <select
              value={settings.silenceSeconds}
              onChange={(event) =>
                patch({ silenceSeconds: Number(event.target.value) })}
            >
              <option value={0}>{t("speech.off")}</option>
              {Array.from(
                { length: 10 },
                (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                    {t("speech.seconds")}
                  </option>
                ),
              )}
            </select>
            <small>
              {t("speech.silenceHelp")}
            </small>
          </label>
        )}
      </div>
      {settings.provider !== "browser" && (
        <div className="speech-settings-section">
          <div className="speech-settings-section-title">
            <Server size={14} />
            <strong>{t("speech.connection")}</strong>
            <span>
              {google
                ? vertex ? "Vertex AI" : "Google AI Studio"
                : settings.endpointType === "whisper-cpp"
                ? "whisper.cpp"
                : "OpenAI Compatible"}
            </span>
          </div>
          <label className="settings-field">
            <span>{t("speech.service")}</span>
            <select
              value={settings.endpointType}
              onChange={(event) =>
                onChange(
                  selectSpeechEndpoint(
                    settings,
                    event.target.value as SpeechSettings["endpointType"],
                  ),
                )}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini-transcribe">
                Gemini 3.5 Transcribe（AI Studio）
              </option>
              <option value="vertex-transcribe">
                Gemini 3.5 Transcribe（Vertex AI）
              </option>
              <option value="whisper-cpp">whisper.cpp</option>
              <option value="custom">{t("speech.custom")}</option>
            </select>
            <small>
              {google
                ? vertex ? t("speech.vertexHelp") : t("speech.geminiHelp")
                : settings.endpointType === "whisper-cpp"
                ? t("speech.whisperHelp")
                : inheritedKey
                ? t("speech.openaiHelp")
                : t("speech.customHelp")}
            </small>
          </label>
          {(vertex || inheritedKey) && (
            <div className="speech-model-note">
              <strong>
                {t("speech.sharedSettings").replace(
                  "{service}",
                  vertex ? "Vertex AI" : google ? "Gemini" : "OpenAI",
                )}
              </strong>
            </div>
          )}
          {!google && !inheritedKey && (
            <label className="settings-field">
              <span>API Base URL</span>
              <input
                type="url"
                value={settings.baseUrl}
                placeholder={settings.endpointType === "whisper-cpp"
                  ? "http://127.0.0.1:8080"
                  : "https://api.openai.com/v1"}
                onChange={(event) => patch({ baseUrl: event.target.value })}
              />
              <small>
                {t("speech.urlHelp")}
              </small>
            </label>
          )}
          <div className="speech-settings-grid">
            {!vertex && !inheritedKey && (
              <label className="settings-field">
                <span>
                  API Key{" "}
                  <small>
                    {sharedKeyService
                      ? t("speech.required")
                      : t("speech.optional")}
                  </small>
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={settings.apiKey}
                  placeholder={google
                    ? t("speech.geminiKey")
                    : sharedKeyService
                    ? t("speech.openaiKey")
                    : t("speech.noAuth")}
                  onChange={(event) => patch({ apiKey: event.target.value })}
                />
                {sharedKeyService && (
                  <small>
                    {t("speech.keyHelp")}
                  </small>
                )}
              </label>
            )}
            {google || inheritedKey
              ? (
                <div className="speech-model-note">
                  <span>{t("speech.model")}</span>
                  <strong>
                    {vertex
                      ? "gemini-3.5-transcribe-preview"
                      : google
                      ? "gemini-3.5-transcribe"
                      : settings.model}
                  </strong>
                </div>
              )
              : settings.endpointType !== "whisper-cpp"
              ? (
                <label className="settings-field">
                  <span>Model</span>
                  <input
                    value={settings.model}
                    placeholder="whisper-1"
                    onChange={(event) => patch({ model: event.target.value })}
                  />
                </label>
              )
              : (
                <div className="speech-model-note">
                  <span>{t("speech.model")}</span>
                  <strong>{t("speech.serverModel")}</strong>
                </div>
              )}
          </div>
          <div className="speech-connection-test">
            <button
              type="button"
              className="speech-secondary-button"
              disabled={!!checking || (vertex
                ? !resolvedSettings.vertexProjectId?.trim()
                : sharedKeyService
                ? !resolvedSettings.apiKey.trim() ||
                  (settings.endpointType === "openai" &&
                    !settings.baseUrl.trim())
                : !settings.baseUrl.trim())}
              onClick={() => void test("server")}
            >
              <Radio size={14} />
              {t("speech.testConnection")}
            </button>
            <small>
              {t("speech.testHelp")}
              {google &&
                t("speech.costHelp")}
            </small>
          </div>
        </div>
      )}
      {checking && (
        <div className="speech-test-feedback" role="status">
          <LoaderCircle size={16} className="speech-spinner" />
          <span>
            {checking === "microphone"
              ? t("speech.checkingMic")
              : t("speech.checkingConnection")} · {elapsed}
            {t("speech.seconds")}
          </span>
          <button
            className="speech-secondary-button"
            type="button"
            onClick={cancel}
          >
            <Square size={12} />
            {t("speech.stop")}
          </button>
        </div>
      )}
      {feedback && (
        <div
          className={`speech-test-feedback ${
            feedback.ok ? "is-success" : "is-error"
          }`}
          role="status"
        >
          {feedback.ok && <Check size={16} />}
          <span>{feedback.text}</span>
        </div>
      )}
      <div className="speech-settings-section">
        <div className="speech-settings-section-title">
          <AudioLines size={14} />
          <strong>{t("speech.sending")}</strong>
        </div>
        <label className="settings-field">
          <span>{t("speech.shortcut")}</span>
          <input
            readOnly
            value={speechShortcutLabel(settings.shortcut)}
            placeholder={t("speech.shortcutPlaceholder")}
            onFocus={() => setShortcutHint(
              t("speech.shortcutHint"),
            )}
            onBlur={() => setShortcutHint("")}
            onKeyDown={(event) => {
              if (event.key === "Tab") return;
              event.preventDefault();
              event.stopPropagation();
              if (event.repeat || event.nativeEvent.isComposing) return;
              if (event.key === "Escape") {
                event.currentTarget.blur();
                return;
              }
              const shortcut = speechShortcutFromEvent(event.nativeEvent);
              if (shortcut) {
                patch({ shortcut });
                setShortcutHint(t("speech.shortcutSaved"));
              }
            }}
          />
          <small>
            {t("speech.shortcutHelp")}
          </small>
        </label>
        <div className="speech-shortcut-actions">
          <button
            type="button"
            className="speech-secondary-button"
            disabled={!settings.shortcut}
            onClick={() => {
              patch({ shortcut: "" });
              setShortcutHint(t("speech.shortcutCleared"));
            }}
          >
            {t("speech.clearShortcut")}
          </button>
          <small role="status">{shortcutHint}</small>
        </div>
        <>
          <label className="settings-field">
            <span>{t("speech.sendPhrase")}</span>
            <input
              value={settings.sendPhrase}
              placeholder={t("speech.phrasePlaceholder")}
              onChange={(event) => patch({ sendPhrase: event.target.value })}
            />
            <small>
              {t("speech.phraseHelp")}
            </small>
          </label>
          <small className="speech-settings-help">
            {settings.provider === "browser"
              ? t("speech.browserSendHelp")
              : t("speech.apiSendHelp")}
          </small>
        </>
      </div>
      <footer className="speech-settings-help">
        {settings.provider === "browser"
          ? t("speech.browserFooter")
          : t("speech.apiFooter")}
      </footer>
    </section>
  );
}
