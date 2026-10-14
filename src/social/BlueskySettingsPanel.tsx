import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { BLUESKY_CHANGED_EVENT, type BlueskyAdapter, type BlueskyConnection } from "../lib/bluesky";

/** Turn Bluesky posting on and connect the account it publishes with. */
export function BlueskySettingsPanel({ enabled, adapter, onEnabledChange }: {
  enabled: boolean;
  adapter: BlueskyAdapter;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const [connection, setConnection] = useState<BlueskyConnection | null>(null);
  const [handle, setHandle] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    const next = await adapter.status();
    setConnection(next);
    window.dispatchEvent(new Event(BLUESKY_CHANGED_EVENT));
  };
  useEffect(() => {
    adapter.status().then(setConnection).catch(() => setConnection({ connected: false }));
  }, [adapter]);
  // Leaving the settings abandons a pending authorization.
  useEffect(() => () => { void adapter.cancelConnect(); }, [adapter]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="settings-info-card">
        <Send size={20} />
        <div>
          <strong>Bluesky</strong>
          <p>
            Shows a Bluesky button on Timeline posts while this is on and an
            account is connected. Pick posts of a conversation and publish
            each as text or as an image of how it looks in the Timeline. The
            connection uses Bluesky's authorization screen; your password is
            never entered in GemiHub.
          </p>
        </div>
      </section>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            onEnabledChange(event.target.checked);
            window.dispatchEvent(new Event(BLUESKY_CHANGED_EVENT));
          }}
        />
        Post Timeline threads to Bluesky
      </label>
      {connection?.connected
        ? (
          <div className="settings-field">
            <span>Account</span>
            <div>
              Connected as {connection.handle || connection.did}{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(async () => { await adapter.disconnect(); await refresh(); })}
              >
                Disconnect
              </button>
            </div>
          </div>
        )
        : (
          <label className="settings-field">
            <span>Handle</span>
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="alice.bsky.social"
              autoCapitalize="none"
              disabled={connecting}
            />
            {connecting
              ? <button type="button" onClick={() => void adapter.cancelConnect()}>Cancel connection</button>
              : (
                <button
                  type="button"
                  disabled={busy || !connection || !handle.trim()}
                  onClick={() => void run(async () => {
                    setConnecting(true);
                    try {
                      await adapter.connect(handle.trim());
                    } finally {
                      setConnecting(false);
                    }
                    await refresh();
                  })}
                >
                  Connect Bluesky
                </button>
              )}
            <small className="settings-hint">
              {connecting
                ? "Authorize the connection in the browser window that opened."
                : "Opens Bluesky's authorization screen in your browser."}
            </small>
          </label>
        )}
      {enabled && connection && !connection.connected && (
        <p className="settings-hint">Connect an account to show the Bluesky button on Timeline posts.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
