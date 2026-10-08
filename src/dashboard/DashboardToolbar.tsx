import { useEffect, useRef, useState } from "react";
import { ChevronDown, Code2, Columns3, Edit3, Eye, FilePlus, Home, LayoutDashboard, Plus, Redo2, Rows3, Undo2, X } from "lucide-react";
import type { DashboardFileEntry } from "./types";
import type { EqualizeLayoutDirection } from "../App";
import { SINGLE_DASHBOARD } from "./dashboardSession";

function dashboardName(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.dashboard$/i, "") || "Dashboard";
}

function NameDialog({ title, initialValue, action, onSubmit, onClose }: { title: string; initialValue: string; action: string; onSubmit: (name: string) => void | Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(name);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="dashboard-name-backdrop" onClick={() => { if (!busy) onClose(); }}><section className="dashboard-name-dialog" onClick={(event) => event.stopPropagation()}><header><strong>{title}</strong><button type="button" disabled={busy} onClick={onClose}><X size={17} /></button></header><div><input autoFocus value={value} disabled={busy} onChange={(event) => { setValue(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} placeholder="Dashboard name" />{error && <small className="error">{error}</small>}</div><footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={busy || !value.trim()} onClick={() => void submit()}>{busy ? `${action}…` : action}</button></footer></section></div>;
}

export function DashboardToolbar({ singleMode, dashboardChoiceRequest, onChooseDashboard, files, activePath, homePath, rawMode, canUndo, canRedo, activeLayoutDirection, onSelect, onCreate, onRename, onDelete, onSetHome, onUndo, onRedo, onLayoutDirection, onAddWidget, onToggleRaw }: {
  singleMode: boolean;
  dashboardChoiceRequest: number;
  onChooseDashboard: (path: string) => Promise<void>;
  files: DashboardFileEntry[];
  activePath: string;
  homePath: string;
  rawMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  activeLayoutDirection: EqualizeLayoutDirection;
  onSelect: (path: string) => void;
  onCreate: (name: string) => void | Promise<void>;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSetHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLayoutDirection: (direction: EqualizeLayoutDirection) => void;
  onAddWidget: () => void;
  onToggleRaw: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceBusy, setChoiceBusy] = useState(false);
  const [choiceError, setChoiceError] = useState("");
  useEffect(() => {
    if (dashboardChoiceRequest > 0) {
      setChoiceOpen(true);
      setChoiceError("");
    }
  }, [dashboardChoiceRequest]);
  useEffect(() => {
    if (!choiceOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !choiceBusy) setChoiceOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [choiceOpen, choiceBusy]);
  const [dialog, setDialog] = useState<"create" | "rename" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);
  const isHome = !!activePath && activePath === homePath;
  return <>
    <div className="dashboard-native-toolbar">
      <div className="dashboard-native-title" ref={menuRef}>
        <LayoutDashboard size={14} />
        <button type="button" onClick={() => setMenuOpen((value) => !value)}>{dashboardName(activePath)}<ChevronDown size={12} /></button>
        {isHome && <Home size={11} className="home" />}
        {menuOpen && <div className="dashboard-switcher"><div><button type="button" className={singleMode ? "active" : ""} onClick={() => { setMenuOpen(false); onSelect(SINGLE_DASHBOARD); }}>single</button>{files.map((file) => <button type="button" key={file.path} className={file.path === activePath ? "active" : ""} onClick={() => { setMenuOpen(false); onSelect(file.path); }}>{file.path === homePath && <Home size={12} />}<span>{file.name || dashboardName(file.path)}</span></button>)}</div><button type="button" className="create" onClick={() => { setMenuOpen(false); setDialog("create"); }}><FilePlus size={14} />New Dashboard</button></div>}
      </div>
      <div className="dashboard-native-actions">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo"><Undo2 size={14} /></button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo"><Redo2 size={14} /></button>
        <button type="button" className={activeLayoutDirection === "horizontal" ? "active" : ""} aria-pressed={activeLayoutDirection === "horizontal"} onClick={() => onLayoutDirection("horizontal")} title="Align horizontally"><Columns3 size={14} /></button>
        <button type="button" className={activeLayoutDirection === "vertical" ? "active" : ""} aria-pressed={activeLayoutDirection === "vertical"} onClick={() => onLayoutDirection("vertical")} title="Align vertically"><Rows3 size={14} /></button>
        <button type="button" className="add" onClick={onAddWidget}><Plus size={14} /><span>Add Widget</span></button>
        <span />
        <button type="button" onClick={() => setDialog("rename")} disabled={!activePath || singleMode} title="Rename Dashboard"><Edit3 size={13} /></button>
        <button type="button" className="danger" onClick={onDelete} disabled={!activePath || singleMode} title="Delete Dashboard"><X size={13} /></button>
        {!isHome && <button type="button" onClick={onSetHome} disabled={!activePath || singleMode} title="Set as Home"><Home size={13} /></button>}
        <button type="button" className={rawMode ? "active" : ""} onClick={onToggleRaw} disabled={!activePath || singleMode} title={rawMode ? "Show Dashboard" : "Edit YAML"}>{rawMode ? <Eye size={14} /> : <Code2 size={14} />}</button>
      </div>
    </div>
    {choiceOpen && <div className="dashboard-name-backdrop" onClick={() => { if (!choiceBusy) setChoiceOpen(false); }}>
      <section className="dashboard-name-dialog dashboard-choice-dialog" role="dialog" aria-modal="true" aria-label="Choose Dashboard" onClick={(event) => event.stopPropagation()}>
        <header><strong>Choose Dashboard</strong><button type="button" disabled={choiceBusy} onClick={() => setChoiceOpen(false)} aria-label="Close"><X size={17} /></button></header>
        <div>
          <p>Select an existing Dashboard or create one to split the view. Your open file will be carried over.</p>
          {files.map((file) => <button type="button" key={file.path} disabled={choiceBusy} onClick={async () => {
            setChoiceBusy(true);
            setChoiceError("");
            try { await onChooseDashboard(file.path); setChoiceOpen(false); }
            catch (error) { setChoiceError(error instanceof Error ? error.message : String(error)); }
            finally { setChoiceBusy(false); }
          }}>{file.name || dashboardName(file.path)}</button>)}
          {choiceError && <small className="error">{choiceError}</small>}
        </div>
        <footer><button type="button" disabled={choiceBusy} onClick={() => setChoiceOpen(false)}>Cancel</button><button type="button" className="primary" disabled={choiceBusy} onClick={() => { setChoiceOpen(false); setDialog("create"); }}><FilePlus size={14} />New Dashboard</button></footer>
      </section>
    </div>}
    {dialog === "create" && <NameDialog title="New Dashboard" initialValue="" action="Create" onClose={() => setDialog(null)} onSubmit={onCreate} />}
    {dialog === "rename" && <NameDialog title="Rename Dashboard" initialValue={dashboardName(activePath)} action="Rename" onClose={() => setDialog(null)} onSubmit={onRename} />}
  </>;
}
