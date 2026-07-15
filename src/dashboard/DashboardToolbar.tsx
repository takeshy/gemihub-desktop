import { useEffect, useRef, useState } from "react";
import { ChevronDown, Code2, Columns3, Edit3, Eye, FilePlus, Home, LayoutDashboard, Plus, Redo2, Rows3, Undo2, X } from "lucide-react";
import type { DashboardFileEntry } from "./types";
import type { EqualizeLayoutDirection } from "../App";

function dashboardName(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.dashboard$/i, "") || "Dashboard";
}

function NameDialog({ title, initialValue, action, onSubmit, onClose }: { title: string; initialValue: string; action: string; onSubmit: (name: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <div className="dashboard-name-backdrop" onClick={onClose}><section className="dashboard-name-dialog" onClick={(event) => event.stopPropagation()}><header><strong>{title}</strong><button type="button" onClick={onClose}><X size={17} /></button></header><div><input autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && value.trim()) onSubmit(value.trim()); }} placeholder="Dashboard name" /></div><footer><button type="button" onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={!value.trim()} onClick={() => onSubmit(value.trim())}>{action}</button></footer></section></div>;
}

export function DashboardToolbar({ files, activePath, homePath, rawMode, canUndo, canRedo, hasWidgets, onSelect, onCreate, onRename, onDelete, onSetHome, onUndo, onRedo, onEqualize, onAddWidget, onToggleRaw }: {
  files: DashboardFileEntry[];
  activePath: string;
  homePath: string;
  rawMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasWidgets: boolean;
  onSelect: (path: string) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSetHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onEqualize: (direction: EqualizeLayoutDirection) => void;
  onAddWidget: () => void;
  onToggleRaw: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
        {menuOpen && <div className="dashboard-switcher"><div>{files.map((file) => <button type="button" key={file.path} className={file.path === activePath ? "active" : ""} onClick={() => { setMenuOpen(false); onSelect(file.path); }}>{file.path === homePath && <Home size={12} />}<span>{file.name || dashboardName(file.path)}</span></button>)}</div><button type="button" className="create" onClick={() => { setMenuOpen(false); setDialog("create"); }}><FilePlus size={14} />New Dashboard</button></div>}
      </div>
      <div className="dashboard-native-actions">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo"><Undo2 size={14} /></button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo"><Redo2 size={14} /></button>
        <button type="button" onClick={() => onEqualize("horizontal")} disabled={!hasWidgets} title="Align horizontally"><Columns3 size={14} /></button>
        <button type="button" onClick={() => onEqualize("vertical")} disabled={!hasWidgets} title="Align vertically"><Rows3 size={14} /></button>
        <button type="button" className="add" onClick={onAddWidget}><Plus size={14} /><span>Add Widget</span></button>
        <span />
        <button type="button" onClick={() => setDialog("rename")} disabled={!activePath} title="Rename Dashboard"><Edit3 size={13} /></button>
        <button type="button" className="danger" onClick={onDelete} disabled={!activePath} title="Delete Dashboard"><X size={13} /></button>
        {!isHome && <button type="button" onClick={onSetHome} disabled={!activePath} title="Set as Home"><Home size={13} /></button>}
        <button type="button" className={rawMode ? "active" : ""} onClick={onToggleRaw} disabled={!activePath} title={rawMode ? "Show Dashboard" : "Edit YAML"}>{rawMode ? <Eye size={14} /> : <Code2 size={14} />}</button>
      </div>
    </div>
    {dialog === "create" && <NameDialog title="New Dashboard" initialValue="" action="Create" onClose={() => setDialog(null)} onSubmit={(name) => { setDialog(null); onCreate(name); }} />}
    {dialog === "rename" && <NameDialog title="Rename Dashboard" initialValue={dashboardName(activePath)} action="Rename" onClose={() => setDialog(null)} onSubmit={(name) => { setDialog(null); onRename(name); }} />}
  </>;
}
