import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Clipboard, FileText, Loader2, MessageSquare, Pencil, Search, Settings2, Sparkles, X } from "lucide-react";
import { chat, getAdjacentRAGChunks, searchRAG, type RAGSearchResult } from "../lib/wailsBackend";
import { configuredChatProviders, type ChatSettings } from "./settings";

interface ChunkEditState {
  index: number;
  result: RAGSearchResult;
  text: string;
  before: RAGSearchResult[];
  after: RAGSearchResult[];
  hasPrevious: boolean;
  hasNext: boolean;
  refined: boolean;
}

function appendWithoutOverlap(existing: string, added: string, direction: "before" | "after"): string {
  const left = direction === "before" ? added : existing;
  const right = direction === "before" ? existing : added;
  const maximum = Math.min(left.length, right.length, 2000);
  let overlap = 0;
  for (let length = maximum; length > 0; length--) {
    if (left.slice(-length) === right.slice(0, length)) { overlap = length; break; }
  }
  return `${left}${overlap ? "" : "\n\n"}${right.slice(overlap)}`;
}

export function RAGSearchPanel({ directoryBase, settings, onSettingsChange, onOpenSettings, onOpenFile, onChatWithResults }: { directoryBase: string; settings: ChatSettings; onSettingsChange: (settings: ChatSettings) => void; onOpenSettings: () => void; onOpenFile: (path: string) => void; onChatWithResults: (results: RAGSearchResult[]) => void }) {
  const names = Object.keys(settings.ragSettings);
  const [selectedName, setSelectedName] = useState(() => settings.selectedRagSetting ?? names[0] ?? "");
  const selectedSetting = selectedName ? settings.ragSettings[selectedName] : undefined;
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(selectedSetting?.topK ?? 5);
  const [threshold, setThreshold] = useState(selectedSetting?.scoreThreshold ?? 0.3);
  const [extensions, setExtensions] = useState((selectedSetting?.searchFileExtensions ?? []).join(", "));
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<RAGSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [edited, setEdited] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<ChunkEditState | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (selectedName && settings.ragSettings[selectedName]) return;
    setSelectedName(settings.selectedRagSetting ?? names[0] ?? "");
  }, [names.join("\0"), selectedName, settings.ragSettings, settings.selectedRagSetting]);

  useEffect(() => {
    if (!selectedSetting) return;
    setTopK(selectedSetting.topK);
    setThreshold(selectedSetting.scoreThreshold);
    setExtensions(selectedSetting.searchFileExtensions.join(", "));
    setResults([]);
    setSelected(new Set());
    setSearched(false);
  }, [selectedName]);

  const filteredResults = useMemo(() => {
    const terms = keyword.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return results;
    return results.filter((result) => terms.every((term) => result.text.toLowerCase().includes(term) || result.filePath.toLowerCase().includes(term)));
  }, [keyword, results]);

  const runSearch = async () => {
    if (!query.trim() || !selectedName || !selectedSetting || loading) return;
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const fallbackKey = selectedSetting.embeddingProvider === "gemini" && settings.provider === "gemini" ? settings.apiKey : "";
      const result = await searchRAG(selectedName, query.trim(), {
        ...selectedSetting,
        topK,
        scoreThreshold: threshold,
        searchFileExtensions: extensions.split(",").map((item) => item.trim().replace(/^\./, "")).filter(Boolean),
        embeddingApiKey: selectedSetting.embeddingApiKey || fallbackKey,
      });
      setResults(result);
      setSelected(new Set());
      setExpanded(new Set());
      setSearched(true);
      setEdited(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelected = (index: number) => setSelected((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  const toggleExpanded = (index: number) => setExpanded((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; });
  const copySelected = async () => {
    const chosen = results.filter((_, index) => selected.has(index));
    if (!chosen.length) return;
    await navigator.clipboard.writeText(chosen.map((result) => `[Source: ${result.filePath}${result.pageLabel ? ` · ${result.pageLabel}` : ""}]\n${result.text}`).join("\n\n---\n\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const loadAdjacent = async (direction: "before" | "after") => {
    if (!editing || editBusy) return;
    setEditBusy(true);
    setEditError("");
    try {
      const before = direction === "before" ? editing.before.length + 3 : editing.before.length;
      const after = direction === "after" ? editing.after.length + 3 : editing.after.length;
      const adjacent = await getAdjacentRAGChunks(selectedName, editing.result.filePath, editing.result.chunkIndex, before, after);
      const previous = adjacent.filter((chunk) => chunk.chunkIndex < editing.result.chunkIndex);
      const next = adjacent.filter((chunk) => chunk.chunkIndex > editing.result.chunkIndex);
      const existing = new Set([...editing.before, ...editing.after].map((chunk) => chunk.chunkIndex));
      const added = (direction === "before" ? previous : next).filter((chunk) => !existing.has(chunk.chunkIndex));
      if (!added.length) {
        setEditing({ ...editing, hasPrevious: direction === "before" ? false : editing.hasPrevious, hasNext: direction === "after" ? false : editing.hasNext });
        return;
      }
      const addedText = added.sort((left, right) => left.chunkIndex - right.chunkIndex).map((chunk) => chunk.text).join("\n\n");
      setEditing({
        ...editing,
        text: appendWithoutOverlap(editing.text, addedText, direction),
        before: direction === "before" ? previous : editing.before,
        after: direction === "after" ? next : editing.after,
        hasPrevious: direction === "before" ? previous.length >= before : editing.hasPrevious,
        hasNext: direction === "after" ? next.length >= after : editing.hasNext,
      });
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setEditBusy(false);
    }
  };

  const refineWithAI = async () => {
    if (!editing || editBusy || !configuredChatProviders(settings).includes(settings.provider)) return;
    setEditBusy(true);
    setEditError("");
    try {
      const result = await chat({
        provider: settings.provider,
        endpoint: settings.endpoint,
        apiKey: settings.apiKey,
        model: settings.model,
        vertexProjectId: settings.vertexProjectId,
        vertexLocation: settings.vertexLocation,
        systemPrompt: "Refine a retrieved RAG excerpt for the user's search. Preserve factual wording and source meaning, remove irrelevant passages, and return only the refined excerpt without commentary.",
        messages: [{ role: "user", content: `Search query:\n${query}\n\nRetrieved excerpt:\n${editing.text}` }],
        enableFileTools: false,
        fileToolMode: "none",
        cliType: settings.cliType,
        cliPath: settings.cliPaths[settings.cliType],
        cliSessionId: "",
      });
      setEditing({ ...editing, text: result.content.trim() || editing.text, refined: true });
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setEditBusy(false);
    }
  };

  const saveEdit = () => {
    if (!editing) return;
    setResults((current) => current.map((result, index) => index === editing.index ? { ...result, text: editing.text } : result));
    setEdited((current) => new Set(current).add(editing.index));
    setEditing(null);
  };

  if (!names.length) return <section className="rag-search-panel rag-search-empty"><Search size={26} /><strong>No RAG settings</strong><span>Create and sync a RAG setting before searching.</span><button type="button" onClick={onOpenSettings}>Open RAG settings</button></section>;

  return <section className="rag-search-panel">
    <header className="rag-search-header"><div><Search size={17} /><strong>RAG Search</strong></div><button type="button" onClick={onOpenSettings} title="RAG settings"><Settings2 size={16} /></button></header>
    <div className="rag-search-controls">
      <div className="rag-search-setting-row"><select value={selectedName} disabled={loading} onChange={(event) => { const name = event.target.value; setSelectedName(name); onSettingsChange({ ...settings, selectedRagSetting: name }); }}>{names.map((name) => <option key={name} value={name}>RAG: {name}</option>)}</select></div>
      <div className="rag-search-parameters"><label>Top K<input type="number" min="1" max="999" value={topK} onChange={(event) => setTopK(Math.max(1, Math.min(999, Number(event.target.value) || 1)))} /></label><label>Score<input type="number" min="0" max="1" step="0.05" value={threshold} onChange={(event) => setThreshold(Math.max(0, Math.min(1, Number(event.target.value) || 0)))} /></label><label>Ext.<input value={extensions} placeholder="md, pdf" onChange={(event) => setExtensions(event.target.value)} /></label></div>
      <div className="rag-search-query"><textarea rows={2} value={query} placeholder="Search indexed files…" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void runSearch(); } }} /><button type="button" disabled={loading || !query.trim()} onClick={() => void runSearch()}>{loading ? <Loader2 size={17} className="spin" /> : <Search size={17} />}</button></div>
    </div>
    <div className="rag-search-results">
      {results.length > 0 && <div className="rag-search-result-tools"><input value={keyword} placeholder="Filter results" onChange={(event) => setKeyword(event.target.value)} /><span>{filteredResults.length} chunks</span><button type="button" disabled={!selected.size} onClick={() => onChatWithResults(results.filter((_, index) => selected.has(index)))}><MessageSquare size={14} />Chat</button><button type="button" disabled={!selected.size} onClick={() => void copySelected()}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copied" : "Copy"}</button></div>}
      {error && <div className="rag-search-error">{error}</div>}
      {searched && !loading && !results.length && !error && <div className="rag-search-no-results">No matching chunks.</div>}
      {filteredResults.map((result) => { const index = results.indexOf(result); const isExpanded = expanded.has(index); return <article key={`${result.filePath}-${result.chunkIndex}-${index}`} className={selected.has(index) ? "selected" : ""}>
        <header><label><input type="checkbox" checked={selected.has(index)} onChange={() => toggleSelected(index)} /><span className="rag-search-score">{result.score.toFixed(3)}</span></label><button type="button" className="rag-search-file" onClick={() => onOpenFile(`project://${result.filePath}`)} title="Open file"><FileText size={13} /><span>{result.filePath}</span>{result.pageLabel && <small>{result.pageLabel}</small>}{edited.has(index) && <em>edited</em>}</button><button type="button" className="rag-search-edit" onClick={() => { setEditError(""); setEditing({ index, result, text: result.text, before: [], after: [], hasPrevious: result.chunkIndex > 0, hasNext: true, refined: false }); }} title="Edit result"><Pencil size={13} /></button><button type="button" className="rag-search-expand" onClick={() => toggleExpanded(index)}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button></header>
        <p className={isExpanded ? "expanded" : ""}>{result.text}</p>
      </article>; })}
    </div>
    {editing && <div className="rag-edit-backdrop" onMouseDown={() => !editBusy && setEditing(null)}><section className="rag-edit-modal" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><strong>{editing.result.filePath.split("/").at(-1)}</strong><small>{editing.result.filePath}{editing.result.pageLabel ? ` · ${editing.result.pageLabel}` : ""}</small></div><button type="button" disabled={editBusy} onClick={() => setEditing(null)}><X size={16} /></button></header>
      <button type="button" className="rag-edit-adjacent" disabled={editBusy || !editing.hasPrevious} onClick={() => void loadAdjacent("before")}>▲ Load previous 3 chunks</button>
      <textarea value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} />
      <button type="button" className="rag-edit-adjacent" disabled={editBusy || !editing.hasNext} onClick={() => void loadAdjacent("after")}>▼ Load next 3 chunks</button>
      {editError && <div className="rag-search-error">{editError}</div>}
      <footer><button type="button" disabled={editBusy || !configuredChatProviders(settings).includes(settings.provider)} onClick={() => void refineWithAI()}>{editBusy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}AI Refine</button><span /><button type="button" disabled={editBusy} onClick={() => setEditing(null)}>Cancel</button><button type="button" className="primary" disabled={editBusy} onClick={saveEdit}>Save</button></footer>
    </section></div>}
  </section>;
}
