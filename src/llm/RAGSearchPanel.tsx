import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  FileText,
  List,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import {
  cancelRAGSync,
  chat,
  getAdjacentRAGChunks,
  getRAGIndexedFiles,
  onRAGSyncProgress,
  type RAGIndexedFile,
  type RAGSearchResult,
  type RAGSetting,
  readWorkspaceFile,
  readWorkspacePDFPages,
  searchRAG,
  syncRAG,
} from "../lib/wailsBackend";
import {
  type ChatSettings,
  configuredModelOptions,
  resolveRAGSetting,
  selectConfiguredModel,
  selectedModelOptionKey,
} from "./settings";
import { PdfViewer } from "../components/PdfViewer";
import { contentMatches, type RAGFilterRow } from "./ragSearchFilters";
import { type FileRef, fileRef } from "../lib/fileRef";

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

type FilterRow = RAGFilterRow;
type ChatFile = { path: string; content: string; rag?: boolean };

function appendWithoutOverlap(
  existing: string,
  added: string,
  direction: "before" | "after",
): string {
  const left = direction === "before" ? added : existing;
  const right = direction === "before" ? existing : added;
  const maximum = Math.min(left.length, right.length, 2000);
  let overlap = 0;
  for (let length = maximum; length > 0; length--) {
    if (left.slice(-length) === right.slice(0, length)) {
      overlap = length;
      break;
    }
  }
  return `${left}${overlap ? "" : "\n\n"}${right.slice(overlap)}`;
}

function mediaName(result: RAGSearchResult): string {
  const file = result.filePath.split("/").at(-1) || result.filePath;
  return result.pageLabel ? `${file} (${result.pageLabel})` : file;
}

export function RAGSearchPanel({
  directoryBase,
  settings,
  onSettingsChange,
  onOpenSettings,
  onOpenFile,
  onChatWithResults,
}: {
  directoryBase: string;
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  onOpenSettings: () => void;
  onOpenFile: (file: FileRef) => void;
  onChatWithResults: (files: ChatFile[]) => void;
}) {
  const names = Object.keys(settings.ragSettings);
  const [selectedName, setSelectedName] = useState(() =>
    settings.selectedRagSetting ?? names[0] ?? ""
  );
  const selectedSetting = selectedName
    ? settings.ragSettings[selectedName]
    : undefined;
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(selectedSetting?.topK ?? 5);
  const [threshold, setThreshold] = useState(
    selectedSetting?.scoreThreshold ?? 0.3,
  );
  const [extensions, setExtensions] = useState(
    (selectedSetting?.searchFileExtensions ?? []).join(", "),
  );
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
  const filterCounter = useRef(1);
  const [filters, setFilters] = useState<FilterRow[]>([{ id: 0, value: "" }]);
  const [filterUndo, setFilterUndo] = useState<Map<number, string>>(new Map());
  const [suggesting, setSuggesting] = useState<number | null>(null);
  const models = configuredModelOptions(settings);
  const [refineModel, setRefineModel] = useState(() =>
    selectedModelOptionKey(settings)
  );
  const [previews, setPreviews] = useState<Map<number, string>>(new Map());
  const [showConfig, setShowConfig] = useState(false);
  const [targetDraft, setTargetDraft] = useState(
    (selectedSetting?.targetFolders ?? []).join("\n"),
  );
  const [excludeDraft, setExcludeDraft] = useState(
    (selectedSetting?.excludePatterns ?? []).join("\n"),
  );
  const [indexedFiles, setIndexedFiles] = useState<RAGIndexedFile[]>([]);
  const [showIndexed, setShowIndexed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<
    { processed: number; total: number; filePath?: string } | null
  >(null);
  const [syncStatus, setSyncStatus] = useState("");

  useEffect(() => {
    if (selectedName && settings.ragSettings[selectedName]) return;
    setSelectedName(settings.selectedRagSetting ?? names[0] ?? "");
  }, [
    names.join("\0"),
    selectedName,
    settings.ragSettings,
    settings.selectedRagSetting,
  ]);

  useEffect(() => {
    if (!selectedSetting) return;
    setTopK(selectedSetting.topK);
    setThreshold(selectedSetting.scoreThreshold);
    setExtensions(selectedSetting.searchFileExtensions.join(", "));
    setTargetDraft(selectedSetting.targetFolders.join("\n"));
    setExcludeDraft(selectedSetting.excludePatterns.join("\n"));
    setResults([]);
    setSelected(new Set());
    setSearched(false);
  }, [selectedName]);

  useEffect(() =>
    onRAGSyncProgress((progress) => {
      if (progress.name === selectedName) setSyncProgress(progress);
    }), [selectedName]);

  useEffect(() => {
    if (!showConfig || !selectedName) return;
    void getRAGIndexedFiles(selectedName).then(setIndexedFiles).catch(() =>
      setIndexedFiles([])
    );
  }, [selectedName, showConfig]);

  const filteredResults = useMemo(
    () =>
      results.map((result, index) => ({ result, index }))
        .filter(({ result }) =>
          contentMatches(`${result.filePath} ${result.text}`, filters)
        ),
    [filters, results],
  );
  const visibleSelected = useMemo(() =>
    filteredResults
      .map(({ index }) => index)
      .filter((index) => selected.has(index)), [filteredResults, selected]);

  const updateRAG = (patch: Partial<RAGSetting>) => {
    if (!selectedName || !selectedSetting) return;
    onSettingsChange({
      ...settings,
      ragSettings: {
        ...settings.ragSettings,
        [selectedName]: { ...selectedSetting, ...patch },
      },
    });
  };

  const runSearch = async () => {
    if (!query.trim() || !selectedName || !selectedSetting || loading) return;
    setLoading(true);
    setError("");
    setCopied(false);
    try {
      const result = await searchRAG(selectedName, query.trim(), {
        ...resolveRAGSetting(settings, selectedSetting),
        topK,
        scoreThreshold: threshold,
        searchFileExtensions: extensions.split(",").map((item) =>
          item.trim().replace(/^\./, "")
        ).filter(Boolean),
      });
      setResults(result);
      setSelected(new Set());
      setExpanded(new Set());
      setSearched(true);
      setEdited(new Set());
      setPreviews(new Map());
      setFilters([{ id: filterCounter.current++, value: "" }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const runSync = async () => {
    if (!selectedName || !selectedSetting) return;
    if (syncing) {
      await cancelRAGSync(selectedName);
      return;
    }
    setSyncing(true);
    setSyncStatus("");
    setError("");
    setSyncProgress(null);
    try {
      const setting = resolveRAGSetting(settings, selectedSetting);
      let result = await syncRAG(selectedName, setting);
      let embedded = result.embedded;
      const errors = [...result.errors];
      while (result.deferredFiles > 0) {
        result = await syncRAG(selectedName, setting);
        embedded += result.embedded;
        errors.push(...result.errors);
      }
      setSyncStatus(
        `${result.fileCount} files · ${result.chunkCount} chunks · embedded ${embedded}${
          errors.length ? ` · ${errors.length} errors` : ""
        }`,
      );
      setIndexedFiles(await getRAGIndexedFiles(selectedName));
      updateRAG({ lastFullSync: Date.now() });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setSyncStatus(
        /cancel/i.test(message) ? "Sync cancelled" : `Sync failed: ${message}`,
      );
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  };

  const loadPreview = async (index: number, result: RAGSearchResult) => {
    if (
      !result.contentType || result.contentType === "text" ||
      previews.has(index)
    ) return;
    try {
      const file = result.contentType === "pdf" && result.pageLabel
        ? await readWorkspacePDFPages(result.filePath, result.pageLabel)
        : await readWorkspaceFile(result.filePath);
      if (file?.content.startsWith("data:")) {
        setPreviews((current) => new Map(current).set(index, file.content));
      }
    } catch { /* Preview remains unavailable. */ }
  };

  const toggleExpanded = (index: number) => {
    const opening = !expanded.has(index);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    if (opening && results[index]) void loadPreview(index, results[index]);
  };
  const toggleSelected = (index: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const toggleSelectAll = () =>
    setSelected((current) => {
      const next = new Set(current);
      const all = filteredResults.length > 0 &&
        filteredResults.every(({ index }) => next.has(index));
      for (const { index } of filteredResults) {
        all ? next.delete(index) : next.add(index);
      }
      return next;
    });

  const buildChatFiles = async (): Promise<ChatFile[]> => {
    const files: ChatFile[] = [];
    for (const index of [...visibleSelected].sort((a, b) => a - b)) {
      const result = results[index];
      if (!result) continue;
      if (result.contentType && result.contentType !== "text") {
        const file = result.contentType === "pdf" && result.pageLabel
          ? await readWorkspacePDFPages(result.filePath, result.pageLabel)
          : await readWorkspaceFile(result.filePath);
        if (file?.content) {
          files.push({
            path: mediaName(result),
            content: file.content,
            rag: true,
          });
        }
        continue;
      }
      files.push({
        path: `[RAG] ${mediaName(result)}#chunk-${result.chunkIndex}`,
        content: `[Source: ${result.filePath}] (relevance: ${
          result.score.toFixed(3)
        })\n\n${result.text}`,
        rag: true,
      });
    }
    return files;
  };

  const copySelected = async () => {
    const chosen = [...selected].sort((a, b) => a - b).map((index) =>
      results[index]
    ).filter(Boolean);
    if (!chosen.length) return;
    await navigator.clipboard.writeText(
      chosen.map((result) =>
        `[Source: ${result.filePath}${
          result.pageLabel ? ` · ${result.pageLabel}` : ""
        }]\n${result.text}`
      ).join("\n\n---\n\n"),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const aiSettings = refineModel
    ? selectConfiguredModel(settings, refineModel)
    : settings;
  const suggestFilter = async (id: number) => {
    const value = filters.find((row) => row.id === id)?.value.trim();
    if (!value || !refineModel || suggesting !== null) return;
    setFilterUndo((current) => new Map(current).set(id, value));
    setSuggesting(id);
    try {
      const response = await chat({
        provider: aiSettings.provider,
        endpoint: aiSettings.endpoint,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        vertexProjectId: aiSettings.vertexProjectId,
        vertexLocation: aiSettings.vertexLocation,
        systemPrompt:
          "Expand search keywords with synonyms, related terms, alternate phrasings, and English translations when useful. Return only 5-15 space-separated terms, including the originals.",
        messages: [{ role: "user", content: value }],
        enableFileTools: false,
        fileToolMode: "none",
        cliType: aiSettings.cliType,
        cliPath: aiSettings.cliPaths[aiSettings.cliType],
        cliSessionId: "",
      });
      setFilters((current) =>
        current.map((row) =>
          row.id === id
            ? { ...row, value: response.content.trim() || value }
            : row
        )
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSuggesting(null);
    }
  };

  const loadAdjacent = async (direction: "before" | "after") => {
    if (!editing || editBusy) return;
    setEditBusy(true);
    setEditError("");
    try {
      const before = direction === "before"
        ? editing.before.length + 3
        : editing.before.length;
      const after = direction === "after"
        ? editing.after.length + 3
        : editing.after.length;
      const adjacent = await getAdjacentRAGChunks(
        selectedName,
        editing.result.filePath,
        editing.result.chunkIndex,
        before,
        after,
      );
      const previous = adjacent.filter((chunk) =>
        chunk.chunkIndex < editing.result.chunkIndex
      );
      const next = adjacent.filter((chunk) =>
        chunk.chunkIndex > editing.result.chunkIndex
      );
      const existing = new Set(
        [...editing.before, ...editing.after].map((chunk) => chunk.chunkIndex),
      );
      const added = (direction === "before" ? previous : next).filter((chunk) =>
        !existing.has(chunk.chunkIndex)
      );
      if (!added.length) {
        setEditing({
          ...editing,
          hasPrevious: direction === "before" ? false : editing.hasPrevious,
          hasNext: direction === "after" ? false : editing.hasNext,
        });
        return;
      }
      const addedText = added.sort((a, b) => a.chunkIndex - b.chunkIndex).map((
        chunk,
      ) => chunk.text).join("\n\n");
      setEditing({
        ...editing,
        text: appendWithoutOverlap(editing.text, addedText, direction),
        before: direction === "before" ? previous : editing.before,
        after: direction === "after" ? next : editing.after,
        hasPrevious: direction === "before"
          ? previous.length >= before
          : editing.hasPrevious,
        hasNext: direction === "after" ? next.length >= after : editing.hasNext,
      });
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setEditBusy(false);
    }
  };

  const refineEdit = async () => {
    if (!editing || editBusy || !refineModel) return;
    setEditBusy(true);
    setEditError("");
    try {
      const response = await chat({
        provider: aiSettings.provider,
        endpoint: aiSettings.endpoint,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        vertexProjectId: aiSettings.vertexProjectId,
        vertexLocation: aiSettings.vertexLocation,
        systemPrompt:
          "Refine the retrieved excerpt for the search while preserving facts. Remove irrelevant passages and return only the excerpt.",
        messages: [{
          role: "user",
          content: `Query:\n${query}\n\nExcerpt:\n${editing.text}`,
        }],
        enableFileTools: false,
        fileToolMode: "none",
        cliType: aiSettings.cliType,
        cliPath: aiSettings.cliPaths[aiSettings.cliType],
        cliSessionId: "",
      });
      setEditing({
        ...editing,
        text: response.content.trim() || editing.text,
        refined: true,
      });
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setEditBusy(false);
    }
  };

  const saveEdit = () => {
    if (!editing) return;
    setResults((current) =>
      current.map((result, index) =>
        index === editing.index ? { ...result, text: editing.text } : result
      )
    );
    setEdited((current) => new Set(current).add(editing.index));
    setEditing(null);
  };

  if (!names.length) {
    return (
      <section className="rag-search-panel rag-search-empty">
        <Search size={26} />
        <strong>No RAG settings</strong>
        <span>Create and sync a RAG setting before searching.</span>
        <button type="button" onClick={onOpenSettings}>
          Open RAG settings
        </button>
      </section>
    );
  }

  return (
    <section className="rag-search-panel">
      <header className="rag-search-header">
        <div>
          <Search size={17} />
          <strong>RAG Search</strong>
        </div>
        <button
          type="button"
          onClick={() => setShowConfig((value) => !value)}
          title="Search and index settings"
        >
          <Settings2 size={16} />
        </button>
      </header>
      <div className="rag-search-controls">
        <div className="rag-search-setting-row">
          <select
            value={selectedName}
            disabled={loading || syncing}
            onChange={(event) => {
              const name = event.target.value;
              setSelectedName(name);
              onSettingsChange({ ...settings, selectedRagSetting: name });
            }}
          >
            {names.map((name) => (
              <option key={name} value={name}>RAG: {name}</option>
            ))}
          </select>
        </div>
        {showConfig && selectedSetting && (
          <div className="rag-search-inline-config">
            <label>
              Chunk size<input
                type="number"
                min="100"
                value={selectedSetting.chunkSize}
                onChange={(event) =>
                  updateRAG({
                    chunkSize: Math.max(100, Number(event.target.value) || 100),
                  })}
              />
            </label>
            <label>
              Overlap<input
                type="number"
                min="0"
                value={selectedSetting.chunkOverlap}
                onChange={(event) =>
                  updateRAG({
                    chunkOverlap: Math.max(0, Number(event.target.value) || 0),
                  })}
              />
            </label>
            <label>
              PDF pages<input
                type="number"
                min="1"
                max="6"
                value={selectedSetting.pdfChunkPages}
                onChange={(event) =>
                  updateRAG({
                    pdfChunkPages: Math.max(
                      1,
                      Math.min(6, Number(event.target.value) || 1),
                    ),
                  })}
              />
            </label>
            <label>
              Target folders<textarea
                rows={2}
                value={targetDraft}
                onChange={(event) => setTargetDraft(event.target.value)}
                onBlur={() =>
                  updateRAG({
                    targetFolders: targetDraft.split(/\r?\n/).map((value) =>
                      value.trim()
                    ).filter(Boolean),
                  })}
              />
            </label>
            <label>
              Exclude patterns<textarea
                rows={2}
                value={excludeDraft}
                onChange={(event) => setExcludeDraft(event.target.value)}
                onBlur={() =>
                  updateRAG({
                    excludePatterns: excludeDraft.split(/\r?\n/).map((value) =>
                      value.trim()
                    ).filter(Boolean),
                  })}
              />
            </label>
            <div className="rag-search-sync">
              <button type="button" onClick={() => void runSync()}>
                {syncing ? <X size={14} /> : <RefreshCw size={14} />}
                {syncing ? "Cancel" : "Sync Index"}
              </button>
              <button
                type="button"
                onClick={() => setShowIndexed((value) => !value)}
              >
                <List size={14} />Indexed files
              </button>
            </div>
            {syncProgress && (
              <>
                <progress
                  value={syncProgress.processed}
                  max={Math.max(1, syncProgress.total)}
                />
                <small>
                  {syncProgress.filePath || "Scanning"}{" "}
                  ({syncProgress.processed}/{syncProgress.total})
                </small>
              </>
            )}
            {syncStatus && <small>{syncStatus}</small>}
            {showIndexed && (
              <div className="rag-indexed-files">
                {indexedFiles.length
                  ? indexedFiles.map((file) => (
                    <button
                      key={file.filePath}
                      type="button"
                      onClick={() => onOpenFile(fileRef("workspace", file.filePath))}
                    >
                      <span>{file.filePath}</span>
                      <small>{file.chunks} chunks</small>
                    </button>
                  ))
                  : <small>No indexed files.</small>}
              </div>
            )}
            <button
              type="button"
              className="rag-search-full-settings"
              onClick={onOpenSettings}
            >
              Open full RAG settings
            </button>
          </div>
        )}
        <div className="rag-search-parameters">
          <label>
            Top K<input
              type="number"
              min="1"
              max="999"
              value={topK}
              onChange={(event) =>
                setTopK(
                  Math.max(1, Math.min(999, Number(event.target.value) || 1)),
                )}
            />
          </label>
          <label>
            Score<input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(event) =>
                setThreshold(
                  Math.max(0, Math.min(1, Number(event.target.value) || 0)),
                )}
            />
          </label>
          <label>
            Ext.<input
              value={extensions}
              placeholder="md, pdf"
              onChange={(event) => setExtensions(event.target.value)}
            />
          </label>
        </div>
        <div className="rag-search-query">
          <textarea
            rows={2}
            value={query}
            placeholder="Search indexed files…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void runSearch();
              }
            }}
          />
          <button
            type="button"
            disabled={loading || !query.trim()}
            onClick={() => void runSearch()}
          >
            {loading
              ? <Loader2 size={17} className="spin" />
              : <Search size={17} />}
          </button>
        </div>
      </div>
      <div className="rag-search-results">
        {results.length > 0 && (
          <div className="rag-search-filter-stack">
            <select
              value={refineModel}
              onChange={(event) => setRefineModel(event.target.value)}
            >
              <option value="">AI model for suggestions/refine</option>
              {models.map((model) => (
                <option key={model.key} value={model.key}>{model.label}</option>
              ))}
            </select>
            {filters.map((filter) => (
              <div key={filter.id} className="rag-search-filter-row">
                <input
                  value={filter.value}
                  placeholder='Filter: terms are OR, rows are AND; use "phrase"'
                  onChange={(event) =>
                    setFilters((current) =>
                      current.map((row) =>
                        row.id === filter.id
                          ? { ...row, value: event.target.value }
                          : row
                      )
                    )}
                />
                {filterUndo.has(filter.id) && (
                  <button
                    type="button"
                    title="Undo AI suggestion"
                    onClick={() => {
                      const value = filterUndo.get(filter.id) || "";
                      setFilters((current) =>
                        current.map((row) =>
                          row.id === filter.id ? { ...row, value } : row
                        )
                      );
                      setFilterUndo((current) => {
                        const next = new Map(current);
                        next.delete(filter.id);
                        return next;
                      });
                    }}
                  >
                    <Undo2 size={13} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={!filter.value.trim() || !refineModel ||
                    suggesting !== null}
                  title="Expand with AI"
                  onClick={() =>
                    void suggestFilter(filter.id)}
                >
                  {suggesting === filter.id
                    ? <Loader2 size={13} className="spin" />
                    : <Sparkles size={13} />}
                </button>
                {filters.length > 1 && (
                  <button
                    type="button"
                    title="Remove filter"
                    onClick={() =>
                      setFilters((current) =>
                        current.filter((row) => row.id !== filter.id)
                      )}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setFilters((
                  current,
                ) => [...current, { id: filterCounter.current++, value: "" }])}
            >
              <Plus size={13} />Add filter
            </button>
          </div>
        )}
        {results.length > 0 && (
          <div className="rag-search-result-tools">
            <label>
              <input
                type="checkbox"
                checked={filteredResults.length > 0 &&
                  filteredResults.every(({ index }) => selected.has(index))}
                onChange={toggleSelectAll}
              />All
            </label>
            <span>
              {filteredResults.length} chunks · {visibleSelected.length}{" "}
              selected
            </span>
            <button
              type="button"
              disabled={!visibleSelected.length}
              onClick={() => void buildChatFiles().then(onChatWithResults)}
            >
              <MessageSquare size={14} />Chat
            </button>
            <button
              type="button"
              disabled={!selected.size}
              onClick={() => void copySelected()}
            >
              {copied ? <Check size={14} /> : <Clipboard size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        {error && <div className="rag-search-error">{error}</div>}
        {searched && !loading && !results.length && !error && (
          <div className="rag-search-no-results">No matching chunks.</div>
        )}
        {filteredResults.map(({ result, index }) => {
          const isExpanded = expanded.has(index);
          const contentType = result.contentType || "text";
          const preview = previews.get(index);
          return (
            <article
              key={`${result.filePath}-${result.chunkIndex}-${index}`}
              className={selected.has(index) ? "selected" : ""}
            >
              <header>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggleSelected(index)}
                  />
                  <span className="rag-search-score">
                    {result.score.toFixed(3)}
                  </span>
                </label>
                <button
                  type="button"
                  className="rag-search-file"
                  onClick={() => onOpenFile(fileRef("workspace", result.filePath))}
                  title="Open file"
                >
                  <FileText size={13} />
                  <span>{result.filePath}</span>
                  {result.pageLabel && <small>{result.pageLabel}</small>}
                  {edited.has(index) && <em>edited</em>}
                </button>
                {contentType === "text" && (
                  <button
                    type="button"
                    className="rag-search-edit"
                    onClick={() => {
                      setEditError("");
                      setEditing({
                        index,
                        result,
                        text: result.text,
                        before: [],
                        after: [],
                        hasPrevious: result.chunkIndex > 0,
                        hasNext: true,
                        refined: false,
                      });
                    }}
                    title="Edit result"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                <button
                  type="button"
                  className="rag-search-expand"
                  onClick={() => toggleExpanded(index)}
                >
                  {isExpanded
                    ? <ChevronDown size={14} />
                    : <ChevronRight size={14} />}
                </button>
              </header>
              {isExpanded && contentType !== "text"
                ? (
                  <div className="rag-media-preview">
                    {preview
                      ? contentType === "pdf"
                        ? (
                          <PdfViewer
                            content={preview}
                            title={result.filePath}
                            scalePercent={100}
                          />
                        )
                        : contentType === "image"
                        ? <img src={preview} alt={result.filePath} />
                        : contentType === "audio"
                        ? <audio src={preview} controls />
                        : <video src={preview} controls />
                      : <span>Preview unavailable.</span>}
                  </div>
                )
                : <p className={isExpanded ? "expanded" : ""}>{result.text}</p>}
            </article>
          );
        })}
      </div>
      {editing && (
        <div
          className="rag-edit-backdrop"
          onMouseDown={() => !editBusy && setEditing(null)}
        >
          <section
            className="rag-edit-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <strong>{editing.result.filePath.split("/").at(-1)}</strong>
                <small>
                  {editing.result.filePath}
                  {editing.result.pageLabel
                    ? ` · ${editing.result.pageLabel}`
                    : ""}
                </small>
              </div>
              <button
                type="button"
                disabled={editBusy}
                onClick={() => setEditing(null)}
              >
                <X size={16} />
              </button>
            </header>
            <button
              type="button"
              className="rag-edit-adjacent"
              disabled={editBusy || !editing.hasPrevious}
              onClick={() => void loadAdjacent("before")}
            >
              ▲ Load previous 3 chunks
            </button>
            <textarea
              value={editing.text}
              onChange={(event) =>
                setEditing({ ...editing, text: event.target.value })}
            />
            <button
              type="button"
              className="rag-edit-adjacent"
              disabled={editBusy || !editing.hasNext}
              onClick={() => void loadAdjacent("after")}
            >
              ▼ Load next 3 chunks
            </button>
            {editError && <div className="rag-search-error">{editError}</div>}
            <footer>
              <button
                type="button"
                disabled={editBusy || !refineModel}
                onClick={() => void refineEdit()}
              >
                {editBusy
                  ? <Loader2 size={14} className="spin" />
                  : <Sparkles size={14} />}AI Refine
              </button>
              <span />
              <button
                type="button"
                disabled={editBusy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={editBusy}
                onClick={saveEdit}
              >
                Save
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
