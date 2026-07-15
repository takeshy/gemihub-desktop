import { useEffect, useRef, useState } from "react";
import { BookOpen, Plus, X } from "lucide-react";
import type { OkfBundle } from "./okf";

export function OkfSelector({ bundles, activeIds, disabled, onToggle, onRefresh }: {
  bundles: OkfBundle[];
  activeIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  if (!bundles.length) return null;
  return (
    <div className="chat-okf-selector" ref={ref}>
      <BookOpen size={14} />
      {bundles.filter((bundle) => activeIds.includes(bundle.id)).map((bundle) => (
        <span key={bundle.id} title={bundle.id || "(root)"}>
          {bundle.name}
          <button type="button" disabled={disabled} onClick={() => onToggle(bundle.id)}><X size={10} /></button>
        </span>
      ))}
      <button type="button" className="add" disabled={disabled} title="OKF knowledge bundles" onClick={() => {
        if (!open) onRefresh();
        setOpen((value) => !value);
      }}><Plus size={12} /></button>
      {open && <div className="chat-okf-menu">
        <header><strong>OKF knowledge bundles</strong><small>{bundles.length} found</small></header>
        {bundles.map((bundle) => <label key={bundle.id}>
          <input type="checkbox" checked={activeIds.includes(bundle.id)} disabled={disabled} onChange={() => onToggle(bundle.id)} />
          <span><strong>{bundle.name}</strong><small>{bundle.builtin ? "built-in" : bundle.id || "(root)"}</small></span>
        </label>)}
      </div>}
    </div>
  );
}
