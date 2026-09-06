import { useEffect, useRef, useState } from "react";
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
import { workflowHTTPRequest } from "../lib/wailsBackend";
import { encodeSpeechWav, transcribeSpeech } from "./speechTranscription";
import { selectSpeechEndpoint, type SpeechSettings } from "./settings";
import { speechShortcutFromEvent, speechShortcutLabel } from "./speechShortcut";

const providers = [
  { id: "browser", label: "ブラウザ", hint: "話しながら文字に", icon: Globe },
  {
    id: "openai-compatible",
    label: "OpenAI互換",
    hint: "APIで文字起こし",
    icon: AudioLines,
  },
] as const;

export function SpeechSettingsPanel({ settings, onChange }: {
  settings: SpeechSettings;
  onChange: (settings: SpeechSettings) => void;
}) {
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
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [settings]);
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
          throw new Error("この環境ではマイクを利用できません。");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const name = stream.getAudioTracks()[0]?.label;
        stream.getTracks().forEach((track) => track.stop());
        controller.signal.throwIfAborted();
        message = `マイクを確認しました${name ? `：${name}` : ""}`;
      } else {
        await transcribeSpeech(
          encodeSpeechWav(new Float32Array(32000)),
          settings,
          workflowHTTPRequest,
          controller.signal,
        );
        message = "接続できました。音声の送信と文字起こし応答を確認しました。";
      }
      if (pending.current === controller) {
        setFeedback({ ok: true, text: message });
      }
    } catch (error) {
      if (pending.current === controller) {
        setFeedback({
          ok: false,
          text: error instanceof Error ? error.message : String(error),
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
    <section className="speech-settings" aria-label="Speech-to-Text 音声入力">
      <header className="speech-settings-heading">
        <span className="speech-settings-icon">
          <Mic size={20} />
        </span>
        <div>
          <strong>
            音声入力 <small>Speech-to-Text</small>
          </strong>
          <p>マイクで話した内容を、Chatの下書きに。</p>
        </div>
      </header>
      <aside className="speech-os-tip">
        <strong>まずはOS標準の音声入力を試してみてください</strong>
        <p>
          環境や話し方によっては、OS標準のほうが高い精度で認識できることがあります。Chatの入力欄をクリックしてから、次のキーで始められます。APIキーの設定は不要です。
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
              <kbd>Fn</kbd> + <kbd>D</kbd> または <kbd>🎤</kbd> キー
            </span>
          </div>
        </div>
        <small>
          Macは「システム設定 → キーボード →
          音声入力」で有効化・ショートカットを確認できます。OSやキーボードの設定によりキー操作は異なります。
        </small>
        <small>
          OSの音声入力は入力欄へ直接文字を入れます。「送信の合図」はアプリ内の音声認識に適用されます。OS入力では内容を確認して送信ボタンを押してください。
        </small>
      </aside>
      <div className="speech-settings-section-title">
        <strong>アプリ内の音声認識を使う</strong>
      </div>
      <div
        className="speech-provider-options"
        role="group"
        aria-label="音声認識の方式"
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
          <strong>マイクと言語</strong>
        </div>
        <div className="speech-settings-grid">
          <div className="speech-microphone-field">
            <span>マイク</span>
            <strong>システムの既定のマイク</strong>
            <button
              type="button"
              className="speech-secondary-button"
              disabled={!!checking}
              onClick={() =>
                void test("microphone")}
            >
              <Mic size={13} />マイクを確認
            </button>
          </div>
          <label className="settings-field">
            <span>認識する言語</span>
            {settings.provider === "browser"
              ? <input value="日本語 (ja-JP)" readOnly />
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
                ? "ブラウザ認識では日本語を使用します。"
                : "auto：自動判定 / ja：日本語 / en：英語"}
            </small>
          </label>
          <datalist id="speech-language-options">
            <option value="auto" />
            <option value="ja" />
            <option value="en" />
          </datalist>
        </div>
        {settings.provider !== "browser" && (
          <label className="settings-field">
            <span>無音で自動停止</span>
            <select
              value={settings.silenceSeconds}
              onChange={(event) =>
                patch({ silenceSeconds: Number(event.target.value) })}
            >
              <option value={0}>オフ（手動で停止）</option>
              {Array.from(
                { length: 10 },
                (_, i) => <option key={i + 1} value={i + 1}>{i + 1}秒</option>,
              )}
            </select>
            <small>
              話し始めた後、指定秒数の無音が続くと録音を終了して文字起こしします。送信の合図があれば送信し、なければ下書きに残します。周囲の音によって停止タイミングは変わります。
            </small>
          </label>
        )}
      </div>
      {settings.provider !== "browser" && (
        <div className="speech-settings-section">
          <div className="speech-settings-section-title">
            <Server size={14} />
            <strong>接続先</strong>
            <span>
              {settings.endpointType === "whisper-cpp"
                ? "whisper.cpp"
                : "OpenAI Compatible"}
            </span>
          </div>
          <label className="settings-field">
            <span>サービス</span>
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
              <option value="whisper-cpp">whisper.cpp</option>
              <option value="custom">その他（OpenAI互換API）</option>
            </select>
            <small>
              {settings.endpointType === "whisper-cpp"
                ? "whisper.cpp標準サーバーに合わせて接続します。"
                : "Base URL・モデル・APIキーを接続先に合わせて設定してください。"}
            </small>
          </label>
          <label className="settings-field">
            <span>API Base URL</span>
            <input
              type="url"
              value={settings.baseUrl}
              placeholder={settings.endpointType === "whisper-cpp"
                ? "http://127.0.0.1:8080"
                : "https://api.openai.com/v1"}
              onChange={(event) =>
                patch({ baseUrl: event.target.value })}
            />
            <small>
              サービス選択時に初期値を入力します。接続先に合わせて自由に編集できます。
            </small>
          </label>
          <div className="speech-settings-grid">
            <label className="settings-field">
              <span>
                API Key <small>任意</small>
              </span>
              <input
                type="password"
                autoComplete="off"
                value={settings.apiKey}
                placeholder="認証不要なら空欄"
                onChange={(event) => patch({ apiKey: event.target.value })}
              />
            </label>
            {settings.endpointType !== "whisper-cpp"
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
                  <span>モデル</span>
                  <strong>サーバーで読み込み済みのモデル</strong>
                </div>
              )}
          </div>
          <div className="speech-connection-test">
            <button
              type="button"
              className="speech-secondary-button"
              disabled={!!checking || !settings.baseUrl.trim()}
              onClick={() => void test("server")}
            >
              <Radio size={14} />接続テスト
            </button>
            <small>短い無音データを送って応答を確認します。</small>
          </div>
        </div>
      )}
      {checking && (
        <div className="speech-test-feedback" role="status">
          <LoaderCircle size={16} className="speech-spinner" />
          <span>
            {checking === "microphone" ? "マイクを確認中" : "接続を確認中"} ·
            {" "}
            {elapsed}秒
          </span>
          <button
            className="speech-secondary-button"
            type="button"
            onClick={cancel}
          >
            <Square size={12} />停止
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
          <strong>送信操作</strong>
        </div>
        <label className="settings-field">
          <span>音声ボタンのショートカット</span>
          <input
            readOnly
            value={speechShortcutLabel(settings.shortcut)}
            placeholder="クリックしてキーを押す（例：Ctrl + Shift + M）"
            onFocus={() =>
              setShortcutHint(
                "Ctrl・Alt・⌘のいずれかと、文字・数字などのキーを同時に押してください。",
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
                setShortcutHint("ショートカットを保存しました。");
              }
            }}
          />
          <small>
            アプリがアクティブなとき、開始・停止・解析キャンセルを切り替えます。Chatが閉じていれば開きます。設定画面では無効です。OSが使用するキーは反応しない場合があります。
          </small>
        </label>
        <div className="speech-shortcut-actions">
          <button
            type="button"
            className="speech-secondary-button"
            disabled={!settings.shortcut}
            onClick={() => {
              patch({ shortcut: "" });
              setShortcutHint("ショートカットを解除しました。");
            }}
          >
            割り当てを解除
          </button>
          <small role="status">{shortcutHint}</small>
        </div>
        <>
          <label className="settings-field">
            <span>送信の合図</span>
            <input
              value={settings.sendPhrase}
              placeholder="例：over, オーバー, 送信して"
              onChange={(event) => patch({ sendPhrase: event.target.value })}
            />
            <small>
              複数の合図はカンマで区切ります。空欄にすると自動送信しません。
            </small>
          </label>
          <small className="speech-settings-help">
            {settings.provider === "browser"
              ? "確定した文章の末尾が合図と一致したとき、合図を除いて送信します。"
              : "無音での自動停止または停止ボタンの後、文字起こしの末尾に合図があれば、合図を除いて送信します。合図がなければ下書きに残します。"}
          </small>
        </>
      </div>
      <footer className="speech-settings-help">
        {settings.provider === "browser"
          ? "話している途中の文字も入力欄に反映します。利用可否はブラウザの音声認識機能に依存します。"
          : "録音後、停止ボタンで文字起こしを開始します。録音は指定した接続先へ送信されます。"}
      </footer>
    </section>
  );
}
