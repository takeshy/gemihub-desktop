import { useCallback, useEffect, useState } from "react";
import { BookOpen, RefreshCw } from "lucide-react";
import { discoverOkfBundles, type OkfBundle } from "./okf";

export function OkfSettingsCard({ root, updateEndpoint, updateToken, onChange }: {
  root: string;
  updateEndpoint: string;
  updateToken: string;
  onChange: (value: { root: string; updateEndpoint: string; updateToken: string }) => void;
}) {
  const [draft, setDraft] = useState(root || "Knowledge");
  const [endpointDraft, setEndpointDraft] = useState(updateEndpoint);
  const [tokenDraft, setTokenDraft] = useState(updateToken);
  const [bundles, setBundles] = useState<OkfBundle[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => setDraft(root || "Knowledge"), [root]);
  useEffect(() => setEndpointDraft(updateEndpoint), [updateEndpoint]);
  useEffect(() => setTokenDraft(updateToken), [updateToken]);
  const refresh = useCallback(async (nextRoot = root || "Knowledge") => {
    setLoading(true);
    try { setBundles(await discoverOkfBundles(nextRoot)); }
    catch { setBundles([]); }
    finally { setLoading(false); }
  }, [root]);
  useEffect(() => { void refresh(); }, [refresh]);
  const normalized = draft.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "Knowledge";
  const normalizedEndpoint = endpointDraft.trim().replace(/\/+$/g, "");
  const dirty = normalized !== (root || "Knowledge") || normalizedEndpoint !== updateEndpoint || tokenDraft !== updateToken;
  return <section className="okf-settings-card">
    <header><BookOpen size={18} /><div><strong>OKF knowledge bundles</strong><small>Markdown knowledge selected per chat and injected as curated context.</small></div></header>
    <div className="okf-settings-row">
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Knowledge" />
      <button type="button" disabled={loading || !dirty} onClick={() => {
        onChange({ root: normalized, updateEndpoint: normalizedEndpoint, updateToken: tokenDraft });
        void refresh(normalized);
      }}><RefreshCw size={14} className={loading ? "spin" : ""} />Save</button>
    </div>
    <label className="okf-settings-field"><span>Managed update endpoint</span><input value={endpointDraft} onChange={(event) => setEndpointDraft(event.target.value)} placeholder="https://example.com/gemihub-okf or …/api/okf/gemihub" /><small>HTTPS distribution directory or GemiHub-compatible update API. Leave blank to disable update checks.</small></label>
    <label className="okf-settings-field"><span>Bearer token (optional)</span><input type="password" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} autoComplete="off" placeholder="Required only by authenticated update APIs" /></label>
    {bundles.length ? <div className="okf-settings-bundles">{bundles.map((bundle) => <div key={bundle.id}><BookOpen size={14} /><span><strong>{bundle.name}</strong><small>{bundle.id || "(root)"}</small></span></div>)}</div> : !loading ? <p>No OKF bundles found. Add a folder containing index.md under this path.</p> : null}
    <p>Choose active bundles from the book selector in each chat.</p>
  </section>;
}
