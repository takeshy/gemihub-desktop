import { useCallback, useEffect, useState } from "react";
import { BookOpen, RefreshCw } from "lucide-react";
import { discoverOkfBundles, type OkfBundle } from "./okf";

export function OkfSettingsCard({ root, onChange }: {
  root: string;
  onChange: (root: string) => void;
}) {
  const [draft, setDraft] = useState(root || "Knowledge");
  const [bundles, setBundles] = useState<OkfBundle[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => setDraft(root || "Knowledge"), [root]);
  const refresh = useCallback(async (nextRoot = root || "Knowledge") => {
    setLoading(true);
    try { setBundles(await discoverOkfBundles(nextRoot)); }
    catch { setBundles([]); }
    finally { setLoading(false); }
  }, [root]);
  useEffect(() => { void refresh(); }, [refresh]);
  const normalized = draft.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "Knowledge";
  const dirty = normalized !== (root || "Knowledge");
  return <section className="okf-settings-card">
    <header><BookOpen size={18} /><div><strong>OKF knowledge bundles</strong><small>Markdown knowledge selected per chat and injected as curated context.</small></div></header>
    <div className="okf-settings-row">
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Knowledge" />
      <button type="button" disabled={loading || !dirty} onClick={() => {
        onChange(normalized);
        void refresh(normalized);
      }}><RefreshCw size={14} className={loading ? "spin" : ""} />Save</button>
    </div>
    {bundles.length ? <div className="okf-settings-bundles">{bundles.map((bundle) => <div key={bundle.id}><BookOpen size={14} /><span><strong>{bundle.name}</strong><small>{bundle.id || "(root)"}</small></span></div>)}</div> : !loading ? <p>No OKF bundles found. Add a folder containing index.md under this path.</p> : null}
    <p>Choose active bundles from the book selector in each chat.</p>
  </section>;
}
