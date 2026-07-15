import { BookOpen, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { GemihubOkfUpdateInfo } from "./gemihubOkfUpdate";

export function OkfUpdateDialog({ update, updating, error, onUpdate, onClose }: {
  update: GemihubOkfUpdateInfo;
  updating: boolean;
  error: string;
  onUpdate: () => void;
  onClose: () => void;
}) {
  const description = update.currentVersion
    ? `GemiHub OKF ${update.manifest.version} is available. Installed version: ${update.currentVersion}.`
    : `This GemiHub OKF predates managed updates. Install the official ${update.manifest.version} release?`;
  return createPortal(<div className="okf-update-backdrop" onClick={() => { if (!updating) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="okf-update-title" className="okf-update-dialog" onClick={(event) => event.stopPropagation()}>
      <header><span><BookOpen size={19} /></span><div><strong id="okf-update-title">Update GemiHub knowledge</strong><p>{description}</p></div><button type="button" disabled={updating} onClick={onClose} aria-label="Close"><X size={17} /></button></header>
      <p>Official documents are replaced after checksum verification. Extra files are kept.</p>
      {error && <div className="okf-update-error">{error}</div>}
      <footer><button type="button" disabled={updating} onClick={onClose}>Later</button><button type="button" className="primary" disabled={updating} onClick={onUpdate}>{updating && <Loader2 size={14} className="spin" />}{updating ? "Updating…" : "Update"}</button></footer>
    </section>
  </div>, document.body);
}
