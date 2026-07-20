import { useState } from "react";
import { Check, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { fetchProviderModels } from "./modelProviders";
import {
  type ChatSettings,
  type LocalLLMFramework,
  localLLMFrameworks,
  type ModelProviderProfile,
  newModelProfile,
  selectModelProfile,
  syncActiveModelProfile,
  updateModelProfile,
} from "./settings";

export function ModelProviderManager(
  { settings, onChange }: {
    settings: ChatSettings;
    onChange: (settings: ChatSettings) => void;
  },
) {
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const synced = syncActiveModelProfile(settings);
  const patch = (id: string, changes: Partial<ModelProviderProfile>) => {
    onChange(updateModelProfile(synced, id, changes));
  };
  const add = (local: boolean) => {
    const profile = newModelProfile("openai", local);
    const next = {
      ...synced,
      modelProfiles: [...synced.modelProfiles, profile],
    };
    onChange(selectModelProfile(next, profile.id));
    setEditing(profile.id);
    setError("");
  };
  const remove = (id: string) => {
    const profiles = synced.modelProfiles.filter((item) => item.id !== id);
    let next = {
      ...synced,
      modelProfiles: profiles,
      selectedModelProfileId: synced.selectedModelProfileId === id
        ? ""
        : synced.selectedModelProfileId,
    };
    if (!next.selectedModelProfileId && profiles[0]) {
      next = selectModelProfile(next, profiles[0].id);
    }
    onChange(next);
    setEditing("");
  };
  const fetchModels = async (profile: ModelProviderProfile) => {
    setBusy(profile.id);
    setError("");
    try {
      const models = await fetchProviderModels(profile);
      patch(profile.id, {
        availableModels: models,
        enabledModels: profile.enabledModels.filter((model) =>
          models.includes(model)
        ),
      });
      if (!models.length) setError("No models were returned by this provider.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="model-provider-manager">
      <header>
        <div>
          <strong>Models</strong>
          <small>
            Add API providers and local OpenAI-compatible servers. Checked
            models appear in Chat.
          </small>
        </div>
        <span>
          <button type="button" onClick={() => add(false)}>
            <Plus size={13} />API provider
          </button>
          <button type="button" onClick={() => add(true)}>
            <Plus size={13} />Local LLM
          </button>
        </span>
      </header>
      {!synced.modelProfiles.length && (
        <div className="settings-empty">No API or local models configured.</div>
      )}
      <div className="model-provider-cards">
        {synced.modelProfiles.map((profile) => (
          <article
            key={profile.id}
            className={`model-provider-entry ${
              profile.id === synced.selectedModelProfileId ? "selected" : ""
            }`}
          >
            <div className="model-provider-row">
              <button
                type="button"
                className="model-provider-summary"
                onClick={() => onChange(selectModelProfile(synced, profile.id))}
              >
                <span>
                  <strong>{profile.name}</strong>
                  <small>
                    {profile.local
                      ? "Local LLM"
                      : profile.provider === "openai"
                      ? profile.openAICompatible
                        ? "OpenAI Compatible"
                        : "OpenAI"
                      : profile.provider} · {profile.enabledModels.length}{" "}
                    model{profile.enabledModels.length === 1 ? "" : "s"}
                  </small>
                </span>
                <i className={profile.enabledModels.length ? "configured" : ""}>
                  {profile.enabledModels.length
                    ? (
                      <>
                        <Check size={10} />Ready
                      </>
                    )
                    : "Configure"}
                </i>
              </button>
              <button
                type="button"
                className="model-provider-edit"
                title={editing === profile.id
                  ? "Close editor"
                  : "Edit provider"}
                aria-label={editing === profile.id
                  ? "Close provider editor"
                  : `Edit ${profile.name}`}
                onClick={() =>
                  setEditing(editing === profile.id ? "" : profile.id)}
              >
                <Pencil size={13} />
              </button>
            </div>
            {editing === profile.id && (
              <div className="model-provider-editor">
                <div className="rag-number-grid">
                  <label>
                    <span>Name</span>
                    <input
                      value={profile.name}
                      onChange={(event) =>
                        patch(profile.id, { name: event.target.value })}
                    />
                  </label>
                  {profile.local
                    ? (
                      <label>
                        <span>Type</span>
                        <div className="model-provider-fixed-type">
                          Local LLM
                        </div>
                      </label>
                    )
                    : (
                      <label>
                        <span>API provider</span>
                        <select
                          value={profile.provider === "openai" &&
                              profile.openAICompatible
                            ? "openai-compatible"
                            : profile.provider}
                          onChange={(event) => {
                            const value = event.target.value;
                            const compatible = value === "openai-compatible";
                            const provider = compatible
                              ? "openai"
                              : value as ModelProviderProfile["provider"];
                            const fresh = newModelProfile(
                              provider,
                              false,
                              compatible,
                            );
                            patch(profile.id, {
                              provider,
                              openAICompatible: compatible,
                              endpoint: fresh.endpoint,
                              availableModels: [],
                              enabledModels: [],
                              model: "",
                              username: "",
                              password: "",
                            });
                          }}
                        >
                          <option value="openai">OpenAI</option>
                          <option value="openai-compatible">
                            OpenAI Compatible
                          </option>
                          <option value="gemini">Google Gemini</option>
                          <option value="anthropic">Anthropic</option>
                        </select>
                      </label>
                    )}
                </div>
                {profile.local && (
                  <label>
                    <span>Framework</span>
                    <select
                      value={profile.localFramework}
                      onChange={(event) => {
                        const localFramework = event.target
                          .value as LocalLLMFramework;
                        const preset = localLLMFrameworks[localFramework];
                        patch(profile.id, {
                          localFramework,
                          name: preset.label,
                          endpoint: preset.endpoint,
                          availableModels: [],
                          enabledModels: [],
                          model: "",
                          username: "",
                          password: "",
                        });
                      }}
                    >
                      {Object.entries(localLLMFrameworks).map(
                        ([value, preset]) => (
                          <option key={value} value={value}>
                            {preset.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                )}
                <label>
                  <span>Base URL</span>
                  <input
                    value={profile.endpoint}
                    placeholder={profile.local
                      ? "http://127.0.0.1:11434/v1"
                      : "https://…"}
                    onChange={(event) =>
                      patch(profile.id, { endpoint: event.target.value })}
                  />
                </label>
                {profile.localFramework === "opencode" && profile.local && (
                  <div className="rag-number-grid">
                    <label>
                      <span>Username (optional)</span>
                      <input
                        value={profile.username}
                        autoComplete="off"
                        onChange={(event) =>
                          patch(profile.id, { username: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Password (optional)</span>
                      <input
                        type="password"
                        value={profile.password}
                        autoComplete="off"
                        onChange={(event) =>
                          patch(profile.id, { password: event.target.value })}
                      />
                    </label>
                  </div>
                )}
                <label>
                  <span>API key {profile.local && "(optional)"}</span>
                  <input
                    type="password"
                    value={profile.apiKey}
                    autoComplete="off"
                    onChange={(event) =>
                      patch(profile.id, { apiKey: event.target.value })}
                  />
                </label>
                <label>
                  <span>Enabled model IDs (comma-separated)</span>
                  <input
                    value={profile.enabledModels.join(", ")}
                    placeholder="model-name"
                    onChange={(event) => {
                      const enabledModels = event.target.value.split(",").map((
                        item,
                      ) => item.trim()).filter(Boolean);
                      patch(profile.id, {
                        enabledModels,
                        availableModels: [
                          ...new Set([
                            ...profile.availableModels,
                            ...enabledModels,
                          ]),
                        ],
                        model: enabledModels.includes(profile.model)
                          ? profile.model
                          : enabledModels[0] || "",
                      });
                    }}
                  />
                </label>
                <label className="check">
                  <span>Enabled</span>
                  <input
                    type="checkbox"
                    checked={profile.enabled}
                    onChange={(event) =>
                      patch(profile.id, { enabled: event.target.checked })}
                  />
                </label>
                <div className="model-provider-actions">
                  <button
                    type="button"
                    disabled={busy === profile.id || !profile.endpoint}
                    onClick={() => void fetchModels(profile)}
                  >
                    {busy === profile.id
                      ? <Loader2 size={13} className="spin" />
                      : <RefreshCw size={13} />}Fetch models
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => remove(profile.id)}
                  >
                    <Trash2 size={13} />Delete
                  </button>
                </div>
                {!!profile.availableModels.length && (
                  <fieldset className="model-checklist">
                    <legend>Enabled models</legend>
                    {profile.availableModels.map((model) => (
                      <label key={model}>
                        <input
                          type="checkbox"
                          checked={profile.enabledModels.includes(model)}
                          onChange={(event) =>
                            patch(profile.id, {
                              enabledModels: event.target.checked
                                ? [...profile.enabledModels, model]
                                : profile.enabledModels.filter((item) =>
                                  item !== model
                                ),
                              model: event.target.checked
                                ? profile.model || model
                                : profile.model === model
                                ? profile.enabledModels.find((item) =>
                                  item !== model
                                ) || ""
                                : profile.model,
                            })}
                        />
                        <span>{model}</span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
      {error && <div className="settings-status">{error}</div>}
    </section>
  );
}
