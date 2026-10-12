import { useState } from "react";
import { Bot } from "lucide-react";
import {
  type ChatSettings,
  configuredModelOptions,
} from "../llm/settings";
import {
  type KakerattaProfile,
  type KakerattaSettings,
  normalizeKakerattaSettings,
} from "../lib/kakerattaSettings";
import {
  listKakerattaPersonas,
  type KakerattaPersona,
} from "../lib/kakerattaRunner";
import type { KakerattaStatus } from "./useKakeratta";

export function KakerattaSettingsPanel(
  { settings, status, onChange, onCheckNow }: {
    settings: ChatSettings;
    status: KakerattaStatus;
    onChange: (config: KakerattaSettings) => void;
    onCheckNow: () => void;
  },
) {
  const config = settings.kakeratta;
  const [headers, setHeaders] = useState(() => Object.entries(config.headers));
  const [personas, setPersonas] = useState<KakerattaPersona[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const models = configuredModelOptions(settings);
  const update = (patch: Partial<KakerattaSettings>) =>
    onChange({ ...config, ...patch });
  // Invalid header rows stay in the editor and are dropped from the saved
  // settings until they are valid (normalize filters them).
  const commitHeaders = (rows: [string, string][]) => {
    setHeaders(rows);
    const names = rows.map(([name]) => name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      setError("Duplicate header names.");
      return;
    }
    setError("");
    update({
      headers: normalizeKakerattaSettings({
        headers: Object.fromEntries(
          rows.map(([name, value]) => [name.trim(), value]),
        ),
      }).headers,
    });
  };
  const loadPersonas = async () => {
    setLoading(true);
    setError("");
    try {
      setPersonas(await listKakerattaPersonas(config));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connection failed. Check the URL and headers.",
      );
    } finally {
      setLoading(false);
    }
  };
  const profileEditor = (
    profile: KakerattaProfile,
    change: (profile: KakerattaProfile) => void,
  ) => (
    <>
      <label className="settings-field">
        <span>Answer model</span>
        <select
          value={profile.model}
          onChange={(event) => change({ ...profile, model: event.target.value })}
        >
          <option value="">Current Chat model</option>
          {models.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={profile.readFiles}
          onChange={(event) =>
            change({ ...profile, readFiles: event.target.checked })}
        />
        Read Workspace files (read-only)
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={profile.webSearch}
          onChange={(event) =>
            change({ ...profile, webSearch: event.target.checked })}
        />
        Web Search (supported models)
      </label>
    </>
  );
  const ids = [
    ...new Set([...personas.map((p) => p.id), ...Object.keys(config.personas)]),
  ];
  const enableSync = (enabled: boolean) =>
    update({
      timelineSync: {
        ...config.timelineSync,
        enabled,
        enabledAt: enabled && !config.timelineSync.enabled
          ? new Date().toISOString()
          : config.timelineSync.enabledAt,
      },
    });
  const httpServers = settings.mcpServers.filter((server) =>
    server.enabled && server.transport === "http" && server.id
  );
  return (
    <>
      <section className="settings-info-card">
        <Bot size={20} />
        <div>
          <strong>Kakeratta external agent</strong>
          <p>
            Answer Kakeratta persona requests with your own AI provider. Create
            an MCP connection in Kakeratta, assign personas to its external
            agent, then paste the MCP URL and issued headers (normally
            Authorization: Bearer key). Checks run once when enabled and every
            minute while this app is open; nothing runs while it is closed.
            Answers use your selected provider's billing.
          </p>
        </div>
      </section>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        Enable integration
      </label>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={config.pollEnabled}
          onChange={(event) => update({ pollEnabled: event.target.checked })}
        />
        Periodic checks (every minute)
      </label>
      <label className="settings-field">
        <span>MCP URL</span>
        <input
          type="url"
          value={config.url}
          placeholder="https://…/mcp"
          onChange={(event) => update({ url: event.target.value.trim() })}
        />
      </label>
      <div className="settings-field">
        <span>HTTP headers</span>
        {headers.map(([name, value], index) => (
          <div className="settings-inline-row" key={index}>
            <input
              aria-label="Header name"
              value={name}
              onChange={(event) =>
                commitHeaders(
                  headers.map((
                    row,
                    i,
                  ) => (i === index ? [event.target.value, value] : row)),
                )}
            />
            <input
              aria-label="Header value"
              type="password"
              autoComplete="off"
              value={value}
              onChange={(event) =>
                commitHeaders(
                  headers.map((
                    row,
                    i,
                  ) => (i === index ? [name, event.target.value] : row)),
                )}
            />
            <button
              type="button"
              onClick={() =>
                commitHeaders(headers.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="settings-choice"
          onClick={() => setHeaders([...headers, ["", ""]])}
        >
          Add header
        </button>
        <small className="settings-hint">
          Headers are stored in this app's settings on this computer.
        </small>
      </div>
      <section className="settings-info-card">
        <div>
          <strong>Timeline synchronization</strong>
          <p>
            Synchronize posts, replies and author names with Kakeratta. The
            connected server must provide the sync_timeline tool. Kakeratta
            wins conflicts; your local version is kept beside it as a
            conflicting edit and is never sent to Kakeratta. Historical imports
            do not wake personas; posts and replies added after enabling
            follow Kakeratta's routing and provider billing.
          </p>
        </div>
      </section>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={config.timelineSync.enabled}
          onChange={(event) => enableSync(event.target.checked)}
        />
        Synchronize Timeline with Kakeratta
      </label>
      <label className="settings-field">
        <span>Timeline name</span>
        <input
          value={config.timelineSync.name}
          onChange={(event) =>
            update({
              timelineSync: {
                ...config.timelineSync,
                name: normalizeKakerattaSettings({
                  timelineSync: { name: event.target.value },
                }).timelineSync.name,
              },
            })}
        />
        <small className="settings-hint">
          Files: Dashboards/Timeline/&lt;name&gt;/YYYY-MM-DD.md in the
          Workspace. Do not remove the synchronization headers in those files.
        </small>
      </label>
      <section className="settings-info-card">
        <div>
          <strong>Default profile</strong>
          <p>
            Used for persona requests. Image models cannot answer. RAG and
            Skills are not available for Kakeratta answers in the desktop app.
          </p>
        </div>
      </section>
      {profileEditor(
        config.defaultProfile,
        (defaultProfile) => update({ defaultProfile }),
      )}
      <section className="settings-info-card">
        <div>
          <strong>Direct requests to the agent</strong>
          <p>
            Reply to requests addressed to @agent, @エージェント or
            @外部エージェント. These settings are independent of persona
            profiles. Only external MCP servers selected below, and only tools
            you already approved (Always approve or allowed tools), are used.
            Earlier posts never authorize new actions.
          </p>
        </div>
      </section>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={config.direct.enabled}
          onChange={(event) =>
            update({ direct: { ...config.direct, enabled: event.target.checked } })}
        />
        Answer direct requests
      </label>
      {profileEditor(
        config.direct,
        (profile) => update({ direct: { ...config.direct, ...profile } }),
      )}
      {httpServers.map((server) => (
        <label className="settings-check" key={server.id}>
          <input
            type="checkbox"
            checked={config.direct.mcpServerIds.includes(server.id)}
            onChange={(event) =>
              update({
                direct: {
                  ...config.direct,
                  mcpServerIds: event.target.checked
                    ? [...config.direct.mcpServerIds, server.id]
                    : config.direct.mcpServerIds.filter((id) =>
                      id !== server.id
                    ),
                },
              })}
          />
          MCP: {server.name}
        </label>
      ))}
      <button
        type="button"
        className="settings-choice"
        disabled={loading || !config.url}
        onClick={() => void loadPersonas()}
      >
        {loading ? "…" : "Load personas / test connection"}
      </button>
      {ids.map((id) => {
        const persona = personas.find((item) => item.id === id);
        const override = Object.hasOwn(config.personas, id);
        return (
          <div className="settings-field" key={id}>
            <strong>
              {persona?.name ?? id}
              {persona?.planner === "builtin"
                ? " (switch to the external agent in Kakeratta)"
                : ""}
            </strong>
            <label className="settings-check">
              <input
                type="checkbox"
                checked={override}
                onChange={(event) => {
                  const profiles = { ...config.personas };
                  if (event.target.checked) {
                    profiles[id] = { ...config.defaultProfile };
                  } else delete profiles[id];
                  update({ personas: profiles });
                }}
              />
              Override default profile
            </label>
            {override && profileEditor(
              config.personas[id],
              (profile) =>
                update({ personas: { ...config.personas, [id]: profile } }),
            )}
          </div>
        );
      })}
      {error && <div className="dashboard-widget-error">{error}</div>}
      <div className="settings-field">
        <button
          type="button"
          className="settings-choice"
          disabled={status.state === "running" || !config.enabled ||
            !config.url}
          onClick={onCheckNow}
        >
          {status.state === "running" ? "Checking…" : "Check now"}
        </button>
        {status.message && (
          <small
            role="status"
            className="settings-hint"
          >
            {status.state === "error" ? "Failed: " : ""}
            {status.message}
          </small>
        )}
      </div>
    </>
  );
}
