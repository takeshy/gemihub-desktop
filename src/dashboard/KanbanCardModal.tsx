import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Code, ExternalLink, Eye, PenLine, Save, X } from "lucide-react";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { PdfViewer } from "../components/PdfViewer";
import { WysiwygEditor } from "../components/WysiwygEditor";
import { parseFrontmatter } from "../components/FrontmatterEditor";
import { readFile, writeFile } from "../lib/wailsBackend";
import { docKindFor } from "./documentKind";

type CardMode = "preview" | "wysiwyg" | "raw";

let sessionMode: CardMode = "preview";

interface ModalGeometry { left: number; top: number; width: number; height: number }
let sessionGeometry: ModalGeometry | null = null;

function initialGeometry(): ModalGeometry {
  const margin = 16;
  const width = Math.min(760, Math.max(320, window.innerWidth - margin * 2));
  const height = Math.min(720, Math.max(320, window.innerHeight * 0.85));
  return { left: Math.max(margin, (window.innerWidth - width) / 2), top: Math.max(margin, (window.innerHeight - height) / 2), width, height };
}

function clampGeometry(value: ModalGeometry): ModalGeometry {
  const margin = 8;
  const width = Math.min(value.width, Math.max(320, window.innerWidth - margin * 2));
  const height = Math.min(value.height, Math.max(280, window.innerHeight - margin * 2));
  return {
    width,
    height,
    left: Math.min(Math.max(margin, value.left), Math.max(margin, window.innerWidth - width - margin)),
    top: Math.min(Math.max(margin, value.top), Math.max(margin, window.innerHeight - height - margin)),
  };
}

function replaceBody(content: string, body: string): string {
  const parsed = parseFrontmatter(content);
  if (!parsed.hasFrontmatter) return body;
  const match = content.match(/^(---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?)/);
  return match ? `${match[1]}${body}` : body;
}

export function KanbanCardModal({ path, isDark, onNavigate, onSaved, onClose }: {
  path: string;
  isDark: boolean;
  onNavigate: () => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [mode, setMode] = useState<CardMode>(sessionMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [geometry, setGeometry] = useState<ModalGeometry>(() => clampGeometry(sessionGeometry ?? initialGeometry()));
  const interaction = useRef<{ kind: "move" | "resize"; x: number; y: number; initial: ModalGeometry } | null>(null);
  const parsed = useMemo(() => parseFrontmatter(content), [content]);
  const kind = docKindFor(path);
  const binaryPreview = kind === "pdf" || kind === "image";
  const dirty = content !== savedContent;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void readFile(path).then((file) => {
      if (cancelled) return;
      if (!file) { setError(`Cannot read ${path}`); setLoading(false); return; }
      setContent(file.content);
      setSavedContent(file.content);
      setLoading(false);
    }).catch((caught: unknown) => {
      if (!cancelled) { setError(caught instanceof Error ? caught.message : String(caught)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [path]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  });

  useEffect(() => {
    const clamp = () => setGeometry((current) => clampGeometry(current));
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  useEffect(() => { sessionGeometry = geometry; }, [geometry]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = interaction.current;
      if (!active) return;
      const dx = event.clientX - active.x;
      const dy = event.clientY - active.y;
      if (active.kind === "move") {
        setGeometry(clampGeometry({ ...active.initial, left: active.initial.left + dx, top: active.initial.top + dy }));
      } else {
        setGeometry(clampGeometry({
          ...active.initial,
          width: Math.max(Math.min(420, window.innerWidth - 16), active.initial.width + dx),
          height: Math.max(Math.min(320, window.innerHeight - 16), active.initial.height + dy),
        }));
      }
    };
    const end = () => { interaction.current = null; document.body.classList.remove("resizing-modal"); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.classList.remove("resizing-modal");
    };
  }, []);

  const beginInteraction = (kind: "move" | "resize", event: ReactPointerEvent) => {
    if (kind === "move" && (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    interaction.current = { kind, x: event.clientX, y: event.clientY, initial: geometry };
    document.body.classList.add("resizing-modal");
  };

  const changeMode = (next: CardMode) => { sessionMode = next; setMode(next); };
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await writeFile(path, content);
      setSavedContent(content);
      setError("");
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
      window.dispatchEvent(new CustomEvent("llm-hub:dashboard-data-changed", { detail: { path } }));
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  return createPortal(<div className="kanban-card-modal-backdrop" onClick={onClose}>
    <section
      className="kanban-card-modal"
      style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }}
      onClick={(event) => event.stopPropagation()}
    >
      <header onPointerDown={(event) => beginInteraction("move", event)}>
        <strong title={path}>{path.split(/[\\/]/).pop() || path}</strong>
        {!binaryPreview && <div className="kanban-card-modal-modes">
          <button type="button" className={mode === "preview" ? "active" : ""} onClick={() => changeMode("preview")} title="Preview"><Eye size={14} /></button>
          <button type="button" className={mode === "wysiwyg" ? "active" : ""} onClick={() => changeMode("wysiwyg")} title="WYSIWYG"><PenLine size={14} /></button>
          <button type="button" className={mode === "raw" ? "active" : ""} onClick={() => changeMode("raw")} title="Raw"><Code size={14} /></button>
        </div>}
        <button type="button" onClick={onNavigate} title="Open in widget"><ExternalLink size={16} /></button>
        <button type="button" onClick={onClose} title="Close"><X size={16} /></button>
      </header>
      <div className="kanban-card-modal-body">
        {loading ? <div className="dashboard-widget-empty">Loading…</div> : error && !content ? <div className="dashboard-widget-error">{error}</div> : kind === "pdf" ? <PdfViewer content={content} title={path} scalePercent={100} /> : kind === "image" ? <img className="dashboard-image" src={content} alt={path} /> : mode === "preview" ? <MarkdownPreview content={parsed.body} isDark={isDark} /> : mode === "wysiwyg" ? <WysiwygEditor value={parsed.body} onChange={(body) => setContent((current) => replaceBody(current, body))} /> : <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck={false} />}
      </div>
      <footer>
        <span>{error}</span>
        {!binaryPreview && <button type="button" disabled={!dirty || saving} onClick={() => void save()}><Save size={14} />{saving ? "Saving…" : "Save"}</button>}
      </footer>
      <button type="button" className="kanban-card-modal-resize" aria-label="Resize dialog" title="Drag to resize" onPointerDown={(event) => beginInteraction("resize", event)} />
    </section>
  </div>, document.body);
}
