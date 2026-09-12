import { speechErrorMessage } from "./speechErrors";
import { useI18n } from "../i18n/context";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  Gauge,
  Globe,
  LoaderCircle,
  Mic,
  Plus,
  Radio,
  Server,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { speechHTTPRequest } from "../lib/wailsBackend";
import { encodeSpeechWav, transcribeSpeech } from "./speechTranscription";
import {
  type ChatSettings,
  clampReadAloudRate,
  isGeminiSpeech,
  MAX_READ_ALOUD_RATE,
  MIN_READ_ALOUD_RATE,
  resolveSpeechSettings,
  selectSpeechEndpoint,
  type SpeechSettings,
} from "./settings";
import { speechShortcutFromEvent, speechShortcutLabel } from "./speechShortcut";
import { speechLanguageCodes, speechLanguageLabel } from "./speechLanguages";
import {
  parseReplacementRules,
  serializeReplacementRules,
  type SpeechReplacement,
} from "./speechText";

function ReplacementRulesEditor(
  { value, onChange }: { value: string; onChange: (value: string) => void },
) {
  const { t } = useI18n();
  const initial = () => {
    const parsed = parseReplacementRules(value);
    return parsed.length ? parsed : [{ from: "", to: "" }];
  };
  const [rows, setRows] = useState<SpeechReplacement[]>(initial);
  useEffect(() => {
    if (serializeReplacementRules(rows) !== value) setRows(initial());
  }, [value]);
  const update = (next: SpeechReplacement[]) => {
    setRows(next);
    onChange(serializeReplacementRules(next).slice(0, 4000));
  };
  return (
    <div className="speech-replacements">
      <div className="speech-replacement-head" aria-hidden="true">
        <span>{t("speech.replacementSpoken")}</span>
        <span /> <span>{t("speech.replacementResult")}</span>
        <span />
      </div>
      {rows.map((rule, index) => (
        <div className="speech-replacement-row" key={index}>
          <input
            aria-label={t("speech.replacementSpoken")}
            value={rule.from}
            placeholder={t("speech.replacementSpokenPlaceholder")}
            onChange={(event) =>
              update(rows.map((item, itemIndex) =>
                itemIndex === index
                  ? { ...item, from: event.target.value }
                  : item
              ))}
          />
          <span aria-hidden="true">→</span>
          <textarea
            aria-label={t("speech.replacementResult")}
            rows={1}
            value={rule.to}
            placeholder="/daily"
            onChange={(event) =>
              update(
                rows.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, to: event.target.value }
                    : item
                ),
              )}
          />
          <button
            type="button"
            aria-label={t("speech.replacementRemove")}
            onClick={() => {
              const next = rows.filter((_, itemIndex) =>
                itemIndex !== index
              );
              update(next.length ? next : [{ from: "", to: "" }]);
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="speech-secondary-button speech-replacement-add"
        onClick={() => setRows([...rows, { from: "", to: "" }])}
      >
        <Plus size={13} />
        {t("speech.replacementAdd")}
      </button>
      <small className="speech-settings-help">
        {t("speech.replacementHelp")}
      </small>
    </div>
  );
}

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
    {
      id: "live",
      label: t("speech.live"),
      hint: t("speech.liveProviderHint"),
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
  const azure = settings.endpointType === "azure-mai-transcribe";
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
  const [customLanguageMode, setCustomLanguageMode] = useState(false);
  const languageCodes = speechLanguageCodes(
    settings.provider,
    settings.endpointType,
    settings.model,
  );
  const customLanguage = settings.language !== "auto" &&
    !languageCodes.includes(settings.language);
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
              onChange(
                // Live speech has no whisper.cpp or custom endpoint, so those
                // move to OpenAI - through selectSpeechEndpoint, so a key meant
                // for the previous service is not sent to api.openai.com.
                id === "live" &&
                  !["openai", "gemini-transcribe", "vertex-transcribe"]
                    .includes(settings.endpointType)
                  ? {
                    ...selectSpeechEndpoint(settings, "openai"),
                    provider: id,
                    model: "gpt-live-transcribe",
                  }
                  : { ...settings, provider: id },
              )}
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
            <select
              value={customLanguageMode || customLanguage
                ? "__custom__"
                : settings.language || "auto"}
              onChange={(event) => {
                if (event.target.value === "__custom__") {
                  setCustomLanguageMode(
                    true,
                  );
                } else {
                  setCustomLanguageMode(false);
                  patch({ language: event.target.value });
                }
              }}
            >
              <option value="auto">{t("speech.languageAuto")}</option>
              {languageCodes.map((code) => (
                <option key={code} value={code}>
                  {speechLanguageLabel(code, language)}
                </option>
              ))}
              <option value="__custom__">{t("speech.languageOther")}</option>
            </select>
            {(customLanguageMode || customLanguage) && (
              <input
                autoFocus
                // The typed value may match a listed code halfway through, so
                // the field follows the setting instead of the custom flag.
                value={settings.language === "auto" ? "" : settings.language}
                placeholder="ja-JP"
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
                  {
                    ...selectSpeechEndpoint(
                      settings,
                      event.target.value as SpeechSettings["endpointType"],
                    ),
                    provider: settings.provider,
                  },
                )}
            >
              <option value="openai">OpenAI</option>
              <option value="gemini-transcribe">
                Gemini 3.5 Transcribe（AI Studio）
              </option>
              <option value="vertex-transcribe">
                Gemini 3.5 Transcribe（Vertex AI）
              </option>
              {settings.provider !== "live" && (
                <option value="azure-mai-transcribe">
                  Azure MAI Transcribe
                </option>
              )}
              {settings.provider !== "live" && (
                <option value="whisper-cpp">whisper.cpp</option>
              )}
              {settings.provider !== "live" && (
                <option value="custom">{t("speech.custom")}</option>
              )}
            </select>
            <small>
              {google
                ? vertex ? t("speech.vertexHelp") : t("speech.geminiHelp")
                : settings.endpointType === "azure-mai-transcribe"
                ? t("speech.azureMaiHelp")
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
                placeholder={settings.endpointType === "azure-mai-transcribe"
                  ? "https://YOUR_RESOURCE.cognitiveservices.azure.com"
                  : settings.endpointType === "whisper-cpp"
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
                    {sharedKeyService || azure
                      ? t("speech.required")
                      : t("speech.optional")}
                  </small>
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={settings.apiKey}
                  placeholder={settings.endpointType === "azure-mai-transcribe"
                    ? "Azure Speech API Key"
                    : google
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
              : azure
              ? (
                <label className="settings-field">
                  <span>Model</span>
                  <select
                    value={settings.model}
                    onChange={(event) => patch({ model: event.target.value })}
                  >
                    <option value="MAI-Transcribe-2">MAI-Transcribe-2</option>
                    <option value="MAI-Transcribe-1.5">
                      MAI-Transcribe-1.5
                    </option>
                  </select>
                </label>
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
          {settings.provider !== "live" && (
            <div className="speech-connection-test">
              <button
                type="button"
                className="speech-secondary-button"
                disabled={!!checking || (vertex
                  ? !resolvedSettings.vertexProjectId?.trim()
                  : sharedKeyService || azure
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
          )}
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
            onFocus={() =>
              setShortcutHint(
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
          <div className="speech-settings-grid">
            <label className="settings-field">
              <span>{t("speech.questionCommand")}</span>
              <input
                value={settings.questionPhrases ?? ""}
                onChange={(event) =>
                  patch({ questionPhrases: event.target.value })}
              />
            </label>
            <label className="settings-field">
              <span>{t("speech.newlineCommand")}</span>
              <input
                value={settings.newlinePhrases ?? ""}
                onChange={(event) =>
                  patch({ newlinePhrases: event.target.value })}
              />
            </label>
            <label className="settings-field">
              <span>{t("speech.exclamationCommand")}</span>
              <input
                value={settings.exclamationPhrases ?? ""}
                onChange={(event) =>
                  patch({ exclamationPhrases: event.target.value })}
              />
            </label>
          </div>
          <ReplacementRulesEditor
            value={settings.replacements ?? ""}
            onChange={(replacements) => patch({ replacements })}
          />
        </>
      </div>
      <div className="speech-settings-section">
        <div className="speech-settings-section-title">
          <Volume2 size={14} />
          <strong>{t("speech.readAloud")}</strong>
        </div>
        <label className="speech-toggle-field">
          <input
            type="checkbox"
            checked={settings.autoReadAloud}
            onChange={(event) => patch({ autoReadAloud: event.target.checked })}
          />
          <span>
            <strong>{t("speech.autoReadAloud")}</strong>
            <small>{t("speech.autoReadAloudHelp")}</small>
          </span>
        </label>
        <label className="settings-field">
          <span>
            {t("speech.readAloudRate")}{" "}
            <small>
              {clampReadAloudRate(settings.readAloudRate).toFixed(1)}×
            </small>
          </span>
          <div className="speech-rate-slider">
            <input
              type="range"
              min={MIN_READ_ALOUD_RATE}
              max={MAX_READ_ALOUD_RATE}
              step={0.1}
              value={clampReadAloudRate(settings.readAloudRate)}
              onChange={(event) =>
                patch({ readAloudRate: Number(event.target.value) })}
            />
            <Gauge size={14} aria-hidden="true" />
          </div>
          <small>
            {t("speech.readAloudRateHelp")}
          </small>
        </label>
      </div>
      <footer className="speech-settings-help">
        {settings.provider === "browser"
          ? t("speech.browserFooter")
          : t("speech.apiFooter")}
      </footer>
    </section>
  );
}
