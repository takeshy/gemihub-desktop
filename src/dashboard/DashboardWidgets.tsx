import {
  type DragEvent,
  type FormEvent,
  Fragment,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Code,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Folder,
  Globe,
  ImagePlus,
  KeyRound,
  Link,
  Loader2,
  Lock,
  PenLine,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import yaml from "js-yaml";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { WysiwygEditor } from "../components/WysiwygEditor";
import { EncryptedFileModal } from "../components/EncryptedFileModal";
import { parseFrontmatter } from "../components/FrontmatterEditor";
import { decodeMemoPath } from "../lib/memoPath";
import {
  isLocalDocumentHref,
  localHrefToPathCandidates,
  pathDirName,
  transformWikiLinks,
  wikiEmbedPathCandidates,
  wikiTargetToPath,
} from "../lib/wikiLinks";
import { encryptWorkspaceFile } from "../lib/fileEncryption";
import {
  appendEntryBlock,
  buildEntryBlock,
  deleteEntry,
  parseMemoFile,
  replaceEntryBody,
  setEntryPinned,
  uniqueEntryId,
} from "../lib/memoTimeline";
import {
  chat,
  checkWebEmbeddable,
  deleteFile,
  deleteWorkspaceFile,
  fileInventory,
  listMemoFiles,
  listWorkspaceFiles,
  readFile,
  readMemoFile,
  readWorkspaceFile,
  writeBinaryFile,
  writeFile,
  writeWorkspaceBinaryFile,
  writeWorkspaceFile,
} from "../lib/wailsBackend";
import type { ChatSettings } from "../llm/settings";
import {
  decryptFileContent,
  encryptFileContent,
  encryptPrivateKey,
  generateKeyPair,
  getEncryptedFileMetadata,
  reencryptFileContent,
  setEncryptedFileMetadata,
} from "../lib/hybridEncryption";
import { valueToString } from "../bases/values";
import {
  getSecretManagerSessionPassword,
  setSecretManagerSessionPassword,
} from "./secretManagerSession";
import {
  baseCellValue,
  type BaseDefinition,
  basePropertyLabel,
  type BaseViewDefinition,
  type DashboardDataRow,
  filterBaseRows,
  formatBaseCellValue,
  type KanbanDefinition,
  loadDashboardRows,
  parseKanbanDefinition,
  searchBaseRows,
  sortBaseRows,
} from "./dashboardData";
import { type BaseQueryData, queryBaseFiles } from "./baseEngine";
import { BaseViewRenderer } from "./BaseViewRenderer";
import type { DashboardWidget } from "./types";
import { KanbanCardModal } from "./KanbanCardModal";
import { WidgetDialog } from "./WidgetDialog";
import { appendTimelineEntry, timelineFolder } from "./timelineEvents";

function configText(
  config: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  return typeof config[key] === "string" ? config[key] as string : fallback;
}
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
function localDateKey(value: unknown): string {
  if (typeof value === "string") {
    const direct = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
  }
  const date = new Date(
    typeof value === "number" || typeof value === "string" ? value : NaN,
  );
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
    pad(date.getDate())
  }`;
}
function isBaseDateProperty(
  property: string,
  rows: DashboardDataRow[],
): boolean {
  if (/^(?:file\.)?[cm]time$/.test(property)) return true;
  return rows.some((row) => localDateKey(baseCellValue(row, property)) !== "");
}

export function WebDashboardWidget(
  { config }: { config: Record<string, unknown> },
) {
  const url = configText(config, "url");
  const [loading, setLoading] = useState(true);
  const [embeddable, setEmbeddable] = useState<boolean | null>(null);
  useEffect(() => {
    setLoading(true);
    setEmbeddable(null);
    if (!/^https?:\/\//i.test(url)) return;
    let cancelled = false;
    void checkWebEmbeddable(url).then((result) => {
      if (!cancelled) setEmbeddable(result.embeddable);
    }).catch(() => {
      if (!cancelled) setEmbeddable(true);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (!url) {
    return (
      <div className="dashboard-widget-empty centered">No URL configured.</div>
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    return (
      <div className="dashboard-widget-empty centered">
        Configure a valid HTTP or HTTPS URL.
      </div>
    );
  }
  let label = url;
  try {
    label = new URL(url).hostname || url;
  } catch { /* validated above */ }
  const showHeader = config.showHeader !== false;
  return (
    <div className={`dashboard-web-widget ${showHeader ? "with-header" : ""}`}>
      {showHeader && (
        <header>
          <Link size={12} />
          <span>{label}</span>
          <button
            type="button"
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            title="Open in new tab"
          >
            <ExternalLink size={12} />
          </button>
        </header>
      )}
      <div className="dashboard-web-frame">
        {embeddable === null && (
          <div className="dashboard-widget-loading">
            <Loader2 size={19} className="spin" />
          </div>
        )}
        {embeddable === false
          ? (
            <div className="dashboard-web-blocked">
              <Globe size={28} />
              <span>{label}</span>
              <button
                type="button"
                onClick={() =>
                  window.open(url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink size={13} />Open in new tab
              </button>
            </div>
          )
          : embeddable === true && (
            <>
              <iframe
                src={url}
                title={url}
                onLoad={() => setLoading(false)}
                sandbox="allow-forms allow-scripts allow-popups"
                referrerPolicy="no-referrer"
              />
              {loading && (
                <div className="dashboard-widget-loading">
                  <Loader2 size={19} className="spin" />
                </div>
              )}
            </>
          )}
      </div>
      {showHeader && <footer title={url}>{url}</footer>}
    </div>
  );
}

export function MemoListDashboardWidget(
  { memoDirPath, onOpenPath }: {
    memoDirPath: string;
    onOpenPath: (path: string) => void;
  },
) {
  const [items, setItems] = useState<
      Array<
        {
          source: string;
          memoPath: string;
          modTime: number;
          count: number;
          preview: string;
        }
      > | null
    >(null),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!memoDirPath) {
      setItems([]);
      return;
    }
    try {
      const entries = await listMemoFiles(memoDirPath);
      const next = await Promise.all(entries.map(async (entry) => {
        const source = entry.source ||
          decodeMemoPath(baseName(entry.memoPath).replace(/\.md$/i, "")) || "";
        if (!source) return null;
        const content = (await readMemoFile(entry.memoPath)).content;
        const parsed = parseMemoFile(content), newest = parsed.entries.at(-1);
        return {
          source,
          memoPath: entry.memoPath,
          modTime: entry.modTime,
          count: parsed.entries.length,
          preview: (newest?.body || newest?.quote || "").replace(/\s+/g, " ")
            .slice(0, 100),
        };
      }));
      setItems(
        next.filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a, b) => b.modTime - a.modTime),
      );
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [memoDirPath]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 300);
    };
    window.addEventListener("llm-hub:file-tree-refresh", refresh);
    window.addEventListener("llm-hub:dashboard-data-changed", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("llm-hub:file-tree-refresh", refresh);
      window.removeEventListener("llm-hub:dashboard-data-changed", refresh);
    };
  }, [load]);
  useEffect(() => setPage(0), [query]);
  const filtered = (items || []).filter((item) =>
    !query.trim() ||
    baseName(item.source).toLowerCase().includes(query.toLowerCase())
  );
  const pageSize = 20,
    pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)),
    safePage = Math.min(page, pageCount - 1),
    visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  if (!memoDirPath) {
    return (
      <div className="dashboard-widget-empty">
        Select a Workspace directory in Settings.
      </div>
    );
  }
  return (
    <div className="dashboard-memo-list-widget">
      <header>
        <Search size={13} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter documents"
        />
      </header>
      {error && <div className="dashboard-widget-error">{error}</div>}
      <div className="memo-list-rows">
        {items === null && (
          <div className="dashboard-widget-loading">
            <Loader2 size={16} className="spin" />
          </div>
        )}
        {items !== null && visible.length === 0 && (
          <div className="dashboard-widget-empty compact">No memos found.</div>
        )}
        {visible.map((item) => (
          <button
            type="button"
            key={item.memoPath}
            onClick={() => onOpenPath(item.source)}
            title={item.source}
          >
            <FileText size={14} />
            <span>
              <strong>{baseName(item.source)}</strong>
              <small>{item.source}</small>
              <em>
                {item.count} memo{item.count === 1 ? "" : "s"}
                {item.preview ? ` · ${item.preview}` : ""}
              </em>
            </span>
            <time>{new Date(item.modTime).toLocaleDateString()}</time>
          </button>
        ))}
      </div>
      {pageCount > 1 && (
        <footer className="memo-list-pager">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft size={14} />
          </button>
          <span>{safePage + 1} / {pageCount}</span>
          <button
            type="button"
            disabled={safePage + 1 >= pageCount}
            onClick={() =>
              setPage((value) => Math.min(pageCount - 1, value + 1))}
          >
            <ChevronRight size={14} />
          </button>
        </footer>
      )}
    </div>
  );
}

interface TimelineItem {
  path: string;
  id: string;
  index: number;
  createdAt: string;
  body: string;
  pinned: boolean;
}
function timelineTags(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(/(?:^|[\s([{])#([^\s#.,;:!?()[\]{}'"`<>]+)/gu)].map((
        match,
      ) => match[1].replace(/\/+$/, "")),
    ),
  ];
}
function withoutTimelineTags(body: string): string {
  return body.replace(/(^|[\s([{])#([^\s#.,;:!?()[\]{}'"`<>]+)/gu, "$1")
    .replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function collapsedTimelineBody(
  body: string,
  lineLimit: number,
  charLimit: number,
): string {
  const lines = body.split(/\r?\n/);
  const byLines = lines.length > lineLimit
    ? lines.slice(0, lineLimit).join("\n").trim()
    : body.trim();
  const clipped = byLines.length <= charLimit
    ? byLines
    : byLines.slice(0, charLimit).trimEnd();
  const withoutExpandedArticles = clipped.replace(
    /!\[\[([^\]\n]+?\.(?:md|markdown)(?:[|#][^\]\n]*)?)\]\]/gi,
    (_match, target: string) => `[[${target.split("|")[0].trim()}]]`,
  );
  return `${withoutExpandedArticles}\n\n...`;
}

function TimelinePostMarkdown({
  body,
  sourcePath,
  isDark,
  onLinkClick,
}: {
  body: string;
  sourcePath: string;
  isDark: boolean;
  onLinkClick: (
    href: string,
    event: ReactMouseEvent<HTMLElement>,
    sourcePath: string,
  ) => void;
}) {
  const baseDirPath = pathDirName(sourcePath);
  const [noteEmbeds, setNoteEmbeds] = useState<
    Record<string, { path: string; content: string } | null>
  >({});
  const [imagePreview, setImagePreview] = useState("");
  const noteTargets = useMemo(
    () =>
      [...body.matchAll(
        /!\[\[([^\]\n]+?\.(?:md|markdown)(?:[|#][^\]\n]*)?)\]\]/gi,
      )]
        .map((match) => match[1]),
    [body],
  );
  const resolveImageAt = useCallback(async (src: string, basePath: string) => {
    if (!src || /^(?:data:|blob:|https?:|\/\/)/i.test(src)) return src;
    for (const path of wikiEmbedPathCandidates(basePath, src)) {
      try {
        const file = await readWorkspaceFile(path);
        if (file?.content.startsWith("data:")) return file.content;
      } catch {
        // Try workspace-root and source-relative candidates in order.
      }
    }
    return src;
  }, []);
  const resolveImageSrc = useCallback(
    (src: string) => resolveImageAt(src, baseDirPath),
    [baseDirPath, resolveImageAt],
  );

  useEffect(() => {
    let cancelled = false;
    setNoteEmbeds({});
    void (async () => {
      for (const target of noteTargets) {
        let resolved: { path: string; content: string } | null = null;
        for (const path of wikiEmbedPathCandidates(baseDirPath, target)) {
          try {
            const file = await readWorkspaceFile(path);
            if (file && !file.content.startsWith("data:")) {
              resolved = {
                path,
                content: parseFrontmatter(file.content).body,
              };
              break;
            }
          } catch {
            // Try the Workspace-root and source-relative candidates.
          }
        }
        if (!cancelled) {
          setNoteEmbeds((current) => ({ ...current, [target]: resolved }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseDirPath, noteTargets]);

  useEffect(() => {
    if (!imagePreview) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview("");
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [imagePreview]);

  const parts = body.split(
    /(!\[\[[^\]\n]+?\.(?:md|markdown)(?:[|#][^\]\n]*)?\]\])/gi,
  );

  return (
    <>
      {parts.map((part, index) => {
        const noteMatch = part.match(/^!\[\[([^\]\n]+)\]\]$/);
        if (!noteMatch) {
          return part
            ? (
              <MarkdownPreview
                key={index}
                content={transformWikiLinks(part)}
                isDark={isDark}
                onLinkClick={(href, event) =>
                  onLinkClick(href, event, sourcePath)}
                resolveImageSrc={resolveImageSrc}
                onImageClick={setImagePreview}
              />
            )
            : null;
        }
        const embedded = noteEmbeds[noteMatch[1]];
        return (
          <div className="timeline-note-embed" key={index}>
            {embedded === undefined
              ? <span>…</span>
              : embedded === null
              ? (
                <MarkdownPreview
                  content={transformWikiLinks(`[[${noteMatch[1]}]]`)}
                  isDark={isDark}
                  onLinkClick={(href, event) =>
                    onLinkClick(href, event, sourcePath)}
                />
              )
              : (
                <MarkdownPreview
                  content={transformWikiLinks(embedded.content)}
                  isDark={isDark}
                  onLinkClick={(href, event) =>
                    onLinkClick(href, event, embedded.path)}
                  resolveImageSrc={(src) =>
                    resolveImageAt(src, pathDirName(embedded.path))}
                  onImageClick={setImagePreview}
                />
              )}
          </div>
        );
      })}
      {imagePreview && createPortal(
        <div
          className="timeline-image-lightbox"
          onClick={() => setImagePreview("")}
        >
          <button type="button" onClick={() => setImagePreview("")}>
            <X size={18} />
          </button>
          <img
            src={imagePreview}
            alt="Timeline image preview"
            onClick={(event) => event.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </>
  );
}

export function TimelineDashboardWidget(
  { config, isDark, settings, onChange, onOpenPath, onExternalPathOpened }: {
    config: Record<string, unknown>;
    isDark: boolean;
    settings: ChatSettings;
    onChange: (config: Record<string, unknown>) => void;
    onOpenPath: (path: string) => void;
    onExternalPathOpened: (path: string) => void;
  },
) {
  const name = configText(config, "name");
  const folder = timelineFolder(name);
  const composerMode = config.composerMode === "wysiwyg" ? "wysiwyg" : "raw";
  const pageSize = Math.max(1, Number(config.latestCount) || 20),
    collapseLines = Math.max(1, Number(config.collapseLineLimit) || 8),
    collapseChars = Math.max(80, Number(config.collapseCharLimit) || 520);
  const [items, setItems] = useState<TimelineItem[] | null>(null),
    [visibleCount, setVisibleCount] = useState(pageSize),
    [draft, setDraft] = useState(""),
    [attachments, setAttachments] = useState<File[]>([]),
    [aiBusy, setAIBusy] = useState(false),
    [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false),
    [word, setWord] = useState(""),
    [tag, setTag] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [pinnedOnly, setPinnedOnly] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false),
    [editing, setEditing] = useState<TimelineItem | null>(null),
    [expandedPosts, setExpandedPosts] = useState<Set<string>>(() => new Set()),
    [editDraft, setEditDraft] = useState(""),
    [aiTarget, setAITarget] = useState<"draft" | "edit" | null>(null),
    [previewPath, setPreviewPath] = useState(""),
    [aiInstruction, setAIInstruction] = useState(
      "Improve clarity while preserving meaning.",
    );
  const load = useCallback(async () => {
    try {
      const paths = (await listWorkspaceFiles()).filter((entry) =>
        entry.path.startsWith(`${folder}/`) && /\.md$/i.test(entry.path)
      ).map((entry) => entry.path).sort();
      const loaded = await Promise.all(
        paths.map(async (path) => ({
          path,
          file: await readWorkspaceFile(path),
        })),
      );
      const next = loaded.flatMap(({ path, file }) =>
        file
          ? parseMemoFile(file.content).entries.map((entry, index) => ({
            path,
            id: entry.id,
            index,
            createdAt: entry.createdAt,
            body: entry.body || entry.quote,
            pinned: entry.pinned,
          }))
          : []
      );
      setItems(
        next.sort((a, b) => {
          const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt);
          return byTime || b.index - a.index;
        }),
      );
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [folder]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 300);
    };
    window.addEventListener("llm-hub:file-tree-refresh", refresh);
    window.addEventListener("llm-hub:dashboard-data-changed", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("llm-hub:file-tree-refresh", refresh);
      window.removeEventListener("llm-hub:dashboard-data-changed", refresh);
    };
  }, [load]);
  useEffect(() => setVisibleCount(pageSize), [
    pageSize,
    word,
    tag,
    from,
    to,
    pinnedOnly,
  ]);
  const post = async () => {
    if (!draft.trim()) return;
    const now = new Date(),
      path = `${folder}/${now.toISOString().slice(0, 10)}.md`,
      current = (await readWorkspaceFile(path))?.content || "",
      id = uniqueEntryId(current, now);
    const embeds: string[] = [];
    for (const [index, file] of attachments.entries()) {
      const extension =
          file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "png",
        target = `${folder}/attachments/${
          now.toISOString().slice(0, 10)
        }/${id}_${String(index + 1).padStart(2, "0")}.${extension}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      await writeWorkspaceBinaryFile(target, btoa(binary));
      embeds.push(`![[${target}]]`);
    }
    await writeWorkspaceFile(
      path,
      appendEntryBlock(
        current,
        `timeline:${name}`,
        buildEntryBlock({
          createdAt: now.toISOString(),
          id,
          body: `${draft}${embeds.length ? `\n\n${embeds.join("\n")}` : ""}`,
        }),
      ),
    );
    setDraft("");
    setAttachments([]);
    setComposerOpen(false);
    window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
    await load();
  };
  const mutate = async (item: TimelineItem, kind: "pin" | "delete") => {
    const file = await readWorkspaceFile(item.path);
    if (!file) return;
    if (kind === "delete" && !confirm("Delete this timeline post?")) return;
    const next = kind === "pin"
      ? setEntryPinned(file.content, item.id, !item.pinned)
      : deleteEntry(file.content, item.id);
    if (next !== null) {
      await writeWorkspaceFile(item.path, next);
      await load();
    }
  };
  const saveEdit = async () => {
    if (!editing || !editDraft.trim()) return;
    const file = await readWorkspaceFile(editing.path);
    if (!file) return;
    const next = replaceEntryBody(file.content, editing.id, editDraft);
    if (next !== null) {
      await writeWorkspaceFile(editing.path, next);
      setEditing(null);
      await load();
    }
  };
  const rewrite = async (event: FormEvent) => {
    event.preventDefault();
    const source = aiTarget === "edit" ? editDraft : draft;
    if (!aiInstruction.trim() || !source.trim()) return;
    setAIBusy(true);
    try {
      const result = await chat({
        provider: settings.provider,
        endpoint: settings.endpoint,
        apiKey: settings.apiKey,
        localFramework: settings.localFramework,
        localUsername: settings.localUsername,
        localPassword: settings.localPassword,
        model: settings.model,
        vertexProjectId: settings.vertexProjectId,
        vertexLocation: settings.vertexLocation,
        systemPrompt:
          "Rewrite a short Markdown timeline post. Return only the rewritten Markdown.",
        messages: [{ role: "user", content: `${aiInstruction}\n\n${source}` }],
        enableFileTools: false,
        fileToolMode: "none",
        cliType: settings.cliType,
        cliPath: settings.cliPaths[settings.cliType],
        cliSessionId: "",
      });
      if (aiTarget === "edit") setEditDraft(result.content.trim());
      else setDraft(result.content.trim());
      setAITarget(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setAIBusy(false);
    }
  };
  const allItems = items || [],
    allTags = [...new Set(allItems.flatMap((item) => timelineTags(item.body)))]
      .sort();
  const filtered = allItems.filter((item) => {
    const day = item.createdAt.slice(0, 10),
      needle = word.trim().toLocaleLowerCase();
    return (!needle || item.body.toLocaleLowerCase().includes(needle)) &&
      (!tag ||
        timelineTags(item.body).some((value) =>
          value.toLocaleLowerCase() === tag.toLocaleLowerCase()
        )) &&
      (!from || day >= from) && (!to || day <= to) &&
      (!pinnedOnly || item.pinned);
  });
  const visible = filtered.slice(0, visibleCount).sort((a, b) => {
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return byTime || a.index - b.index;
  });
  const clearFilters = () => {
    setWord("");
    setTag("");
    setFrom("");
    setTo("");
    setPinnedOnly(false);
  };
  const hasFilters = !!(word || tag || from || to || pinnedOnly);
  const handleTimelineLinkClick = useCallback(
    (
      href: string,
      event: ReactMouseEvent<HTMLElement>,
      sourcePath: string,
    ) => {
      if (!isLocalDocumentHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      const paths = href.startsWith("#wiki:")
        ? wikiEmbedPathCandidates(pathDirName(sourcePath), href)
        : localHrefToPathCandidates(pathDirName(sourcePath) || folder, href);
      void (async () => {
        let resolved = paths[0] ?? "";
        for (const path of paths) {
          try {
            if (await readWorkspaceFile(path)) {
              resolved = path;
              break;
            }
          } catch {
            // Try the next Workspace-root or source-relative candidate.
          }
        }
        if (!resolved) return;
        if (/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(resolved)) {
          onExternalPathOpened(resolved);
        }
        setPreviewPath(resolved);
      })();
    },
    [folder, onExternalPathOpened],
  );
  if (!name) {
    return (
      <div className="dashboard-widget-empty centered">
        Select a timeline in widget settings.
      </div>
    );
  }
  return (
    <div className="dashboard-timeline-widget">
      <div className="timeline-toolbar">
        <strong>{name}</strong>
        <button
          type="button"
          className={filtersOpen || hasFilters ? "active" : ""}
          onClick={() => setFiltersOpen((value) => !value)}
          title="Filter"
        >
          <Search size={12} />
          {hasFilters && <i />}
        </button>
        {hasFilters && (
          <button type="button" onClick={clearFilters} title="Clear filters">
            <X size={12} />
          </button>
        )}
      </div>
      {filtersOpen && (
        <div className="timeline-filters">
          <label className="search">
            <Search size={12} />
            <input
              value={word}
              onChange={(event) => setWord(event.target.value)}
              placeholder="Search posts"
            />
          </label>
          <select value={tag} onChange={(event) => setTag(event.target.value)}>
            <option value="">All tags</option>
            {allTags.map((value) => <option key={value}>{value}</option>)}
          </select>
          <input
            aria-label="From"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <input
            aria-label="To"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
          <label className="timeline-pinned-only">
            <input
              type="checkbox"
              checked={pinnedOnly}
              onChange={(event) => setPinnedOnly(event.target.checked)}
            />Pinned only
          </label>
        </div>
      )}
      {error && <div className="dashboard-widget-error">{error}</div>}
      <div className="timeline-feed">
        {visibleCount < filtered.length && (
          <button
            type="button"
            className="timeline-load-more"
            onClick={() => setVisibleCount((count) => count + pageSize)}
          >
            Load older
          </button>
        )}
        {items === null
          ? (
            <div className="dashboard-widget-loading">
              <Loader2 size={18} className="spin" />
            </div>
          )
          : visible.length === 0
          ? (
            <div className="dashboard-widget-empty centered">
              No timeline posts.
            </div>
          )
          : visible.map((item) => {
            const tags = timelineTags(item.body),
              displayBody = withoutTimelineTags(item.body),
              hasMarkdownEmbed =
                /!\[\[[^\]\n]+?\.(?:md|markdown)(?:[|#][^\]\n]*)?\]\]/i
                  .test(displayBody),
              collapsed = hasMarkdownEmbed ||
                displayBody.length > collapseChars ||
                displayBody.split(/\r?\n/).length > collapseLines,
              postKey = `${item.path}:${item.id}`,
              expanded = expandedPosts.has(postKey),
              visibleBody = collapsed && !expanded
                ? collapsedTimelineBody(
                  displayBody,
                  collapseLines,
                  collapseChars,
                )
                : displayBody,
              isEditing = editing?.id === item.id && editing.path === item.path;
            return (
              <article
                key={`${item.path}:${item.id}`}
                className={item.pinned ? "pinned" : ""}
              >
                <header>
                  <time>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleString()
                      : ""}
                  </time>
                  <code>{item.id}</code>
                  {!isEditing && (
                    <div>
                      <button
                        type="button"
                        className={item.pinned ? "active" : ""}
                        onClick={() => void mutate(item, "pin")}
                      >
                        {item.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(item);
                          setEditDraft(item.body);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void mutate(item, "delete")}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </header>
                {isEditing
                  ? (
                    <div className="timeline-inline-editor">
                      <textarea
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                      />
                      <div>
                        <button
                          type="button"
                          onClick={() => setAITarget("edit")}
                          disabled={!editDraft.trim()}
                          title="Edit with AI"
                        >
                          <Sparkles size={13} />
                        </button>
                        <span>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="primary"
                            onClick={() => void saveEdit()}
                            disabled={!editDraft.trim()}
                          >
                            Save
                          </button>
                        </span>
                      </div>
                    </div>
                  )
                  : (
                    <>
                      <TimelinePostMarkdown
                        body={visibleBody}
                        sourcePath={item.path}
                        isDark={isDark}
                        onLinkClick={handleTimelineLinkClick}
                      />
                      {tags.length > 0 && (
                        <div className="timeline-tags">
                          {tags.map((value) => (
                            <button
                              type="button"
                              key={value}
                              onClick={() => {
                                setTag(value);
                                setFiltersOpen(true);
                              }}
                            >
                              #{value}
                            </button>
                          ))}
                        </div>
                      )}
                      {collapsed && (
                        <button
                          type="button"
                          className="timeline-post-toggle"
                          onClick={() =>
                            setExpandedPosts((current) => {
                              const next = new Set(current);
                              if (next.has(postKey)) next.delete(postKey);
                              else next.add(postKey);
                              return next;
                            })}
                        >
                          {expanded ? "Show less" : "Show more"}
                        </button>
                      )}
                    </>
                  )}
              </article>
            );
          })}
      </div>
      <div className={`timeline-composer-shell ${composerOpen ? "open" : ""}`}>
        {!composerOpen
          ? (
            <button
              type="button"
              className="timeline-new-button"
              onClick={() => setComposerOpen(true)}
              title="New post"
            >
              <Plus size={17} />
              <span>New post</span>
            </button>
          )
          : (
            <div className="timeline-composer">
              <div className="timeline-composer-mode">
                <span>
                  <Code size={11} />
                  {composerMode === "raw" ? "Raw" : "WYSIWYG"}
                </span>
              </div>
              <div
                className="timeline-composer-editor"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" && (event.ctrlKey || event.metaKey)
                  ) void post();
                }}
              >
                {composerMode === "wysiwyg"
                  ? <WysiwygEditor value={draft} onChange={setDraft} />
                  : (
                    <textarea
                      autoFocus
                      rows={3}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={`Post to ${name}…`}
                    />
                  )}
              </div>
              {attachments.length > 0 && (
                <div className="timeline-attachments">
                  {attachments.map((file, index) => (
                    <span key={`${file.name}:${index}`}>
                      {file.name}
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((items) =>
                            items.filter((_, itemIndex) =>
                              itemIndex !== index
                            )
                          )}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="timeline-composer-actions">
                <span>
                  <label title="Attach images">
                    <ImagePlus size={14} />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) =>
                        setAttachments([...event.target.files || []])}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={aiBusy || !draft.trim()}
                    onClick={() => setAITarget("draft")}
                    title="Edit with AI"
                  >
                    <Sparkles size={14} />
                  </button>
                </span>
                <span>
                  <button
                    type="button"
                    onClick={() => {
                      setComposerOpen(false);
                      setDraft("");
                      setAttachments([]);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={!draft.trim() && attachments.length === 0}
                    onClick={() => void post()}
                  >
                    Post
                  </button>
                </span>
              </div>
            </div>
          )}
      </div>
      {aiTarget && (
        <WidgetDialog
          title="Edit with AI"
          onClose={() => setAITarget(null)}
          className="timeline-ai-dialog"
        >
          <form className="timeline-ai-form" onSubmit={rewrite}>
            <label>
              Instructions<textarea
                autoFocus
                rows={5}
                value={aiInstruction}
                onChange={(event) => setAIInstruction(event.target.value)}
              />
            </label>
            <label>
              Preview<textarea
                readOnly
                rows={8}
                value={aiTarget === "edit" ? editDraft : draft}
              />
            </label>
            {error && <p className="dashboard-widget-error">{error}</p>}
            <footer>
              <button type="button" onClick={() => setAITarget(null)}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={aiBusy || !aiInstruction.trim()}
              >
                {aiBusy ? "Rewriting…" : "Apply"}
              </button>
            </footer>
          </form>
        </WidgetDialog>
      )}
      {previewPath && (
        <KanbanCardModal
          path={previewPath}
          isDark={isDark}
          onNavigate={() => {
            const path = previewPath;
            setPreviewPath("");
            onOpenPath(path);
          }}
          onSaved={() => void load()}
          onClose={() => setPreviewPath("")}
        />
      )}
    </div>
  );
}

function columns(
  definition: KanbanDefinition,
): Array<{ value: string; label: string }> {
  const source = Array.isArray(definition.columns)
    ? definition.columns
    : ["todo", "doing", "done"];
  const result = source.map((item) =>
    typeof item === "string"
      ? { value: item, label: item }
      : { value: item.value || "", label: item.label || item.value || "" }
  ).filter((item) => item.value);
  if (definition.showUnspecified) {
    result.push({ value: "", label: "Unspecified" });
  }
  return result;
}
export function KanbanDashboardWidget(
  { config, isDark, onChange, onOpenPath }: {
    config: Record<string, unknown>;
    isDark: boolean;
    onChange: (config: Record<string, unknown>) => void;
    onOpenPath: (path: string) => void;
  },
) {
  const [definition, setDefinition] = useState<KanbanDefinition>(config),
    [rows, setRows] = useState<DashboardDataRow[]>([]),
    [tagFilter, setTagFilter] = useState(""),
    [error, setError] = useState(""),
    [moveError, setMoveError] = useState(""),
    [previewPath, setPreviewPath] = useState("");
  const [showNewCard, setShowNewCard] = useState(false),
    [newTitle, setNewTitle] = useState(""),
    [newStatus, setNewStatus] = useState("");
  const [draggingPath, setDraggingPath] = useState(""),
    [dropTarget, setDropTarget] = useState<
      { path: string; position: "before" | "after" } | null
    >(null);
  const draggingPathRef = useRef("");
  const dragColumnRef = useRef<string | null>(null);
  const dropHandledRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const path = configText(config, "kanban");
      const parsed = path
        ? parseKanbanDefinition((await readFile(path))?.content || "")
        : null;
      const storedOrder = Array.isArray(config.cardOrder)
        ? config.cardOrder.filter((item): item is string =>
          typeof item === "string"
        )
        : [];
      const next: KanbanDefinition = {
        ...config,
        ...(parsed || {}),
        cardOrder: storedOrder,
      };
      setDefinition(next);
      let loaded = filterBaseRows(
        await loadDashboardRows(
          configText(next, "folder"),
          next.workspaceOnly === true,
        ),
        next.filter,
      );
      const order = storedOrder,
        positions = new Map(order.map((id, index) => [id, index]));
      loaded = [...loaded].sort((left, right) =>
        (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
        left.path.localeCompare(right.path)
      );
      setRows(loaded.slice(0, Number(next.limit) || 500));
      setError(parsed === null && path ? `Cannot read ${path}` : "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [config]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("llm-hub:dashboard-data-changed", refresh);
    return () =>
      window.removeEventListener("llm-hub:dashboard-data-changed", refresh);
  }, [load]);
  const statusKey = configText(definition, "statusProperty", "status"),
    titleKey = configText(definition, "titleProperty", "title"),
    boardColumns = columns(definition),
    tags = [
      ...new Set(
        rows.flatMap((row) => row.cells["file.tags"] as string[] || []),
      ),
    ].sort(),
    visibleRows = tagFilter
      ? rows.filter((row) =>
        (row.cells["file.tags"] as string[] || []).includes(tagFilter)
      )
      : rows;
  const move = async (
    row: DashboardDataRow,
    status: string,
    target = dropTarget,
  ) => {
    const oldStatus = String(row.frontmatter[statusKey] ?? ""),
      parsed = parseFrontmatter(row.content),
      frontmatter = { ...parsed.frontmatter, [statusKey]: status };
    const previousRows = rows;
    setMoveError("");
    setRows((current) =>
      current.map((item) =>
        item.path === row.path
          ? {
            ...item,
            frontmatter: { ...item.frontmatter, [statusKey]: status },
            cells: { ...item.cells, [statusKey]: status },
          }
          : item
      )
    );
    const currentOrder = Array.isArray(config.cardOrder)
        ? config.cardOrder.filter((item): item is string =>
          typeof item === "string"
        )
        : rows.map((item) => item.id),
      nextOrder = currentOrder.filter((id) => id !== row.id);
    const targetRow = target
      ? rows.find((item) => item.path === target.path)
      : null;
    const targetIds = rows.filter((item) =>
        item.id !== row.id &&
        String(item.frontmatter[statusKey] ?? "") === status
      ).map((item) => item.id),
      lastTarget = [...targetIds].reverse().find((id) =>
        nextOrder.includes(id)
      );
    const insertAt = targetRow && nextOrder.includes(targetRow.id)
      ? nextOrder.indexOf(targetRow.id) + (target?.position === "after" ? 1 : 0)
      : lastTarget
      ? nextOrder.indexOf(lastTarget) + 1
      : nextOrder.length;
    nextOrder.splice(insertAt, 0, row.id);
    try {
      const writeBoardFile = definition.workspaceOnly === true
        ? writeWorkspaceFile
        : writeFile;
      await writeBoardFile(
        row.path,
        `---\n${
          yaml.dump(frontmatter, { lineWidth: -1, noRefs: true }).trimEnd()
        }\n---\n${parsed.body.replace(/^\s+/, "")}`,
      );
      const timelineName = configText(definition, "timelineName");
      if (timelineName && oldStatus !== status) {
        const oldLabel = boardColumns.find((column) =>
          column.value === oldStatus
        )?.label || oldStatus || "Unspecified";
        const nextLabel = boardColumns.find((column) =>
          column.value === status
        )?.label || status || "Unspecified";
        const kanbanName = configText(
          definition,
          "title",
          baseName(configText(config, "kanban")).replace(/\.kanban$/i, "") ||
            "Kanban",
        );
        const title = String(row.frontmatter[titleKey] || row.name);
        await appendTimelineEntry(
          timelineName,
          `> [!info] Kanban · ${kanbanName}\n> [[${row.path}|${title}]]\n> \`${oldLabel}\` → \`${nextLabel}\``,
        );
      }
      onChange({ ...config, cardOrder: nextOrder });
      window.dispatchEvent(
        new CustomEvent("llm-hub:dashboard-data-changed", {
          detail: { path: row.path },
        }),
      );
      await load();
    } catch (caught) {
      setRows(previousRows);
      setMoveError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      draggingPathRef.current = "";
      dragColumnRef.current = null;
      dropHandledRef.current = false;
      setDraggingPath("");
      setDropTarget(null);
    }
  };
  useEffect(() => {
    if (!boardColumns.some((column) => column.value === newStatus)) {
      setNewStatus(boardColumns[0]?.value || "");
    }
  }, [boardColumns, newStatus]);
  useEffect(() => {
    if (!showNewCard) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowNewCard(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [showNewCard]);
  if (loading) {
    return (
      <div className="dashboard-widget-loading centered">
        <Loader2 size={18} className="spin" />
      </div>
    );
  }
  if (configText(config, "kanban") && error) {
    return (
      <div className="dashboard-widget-empty centered">
        Kanban file not found.
      </div>
    );
  }
  if (
    !configText(config, "kanban") && !configText(definition, "folder") &&
    !configText(definition, "title")
  ) {
    return (
      <div className="dashboard-widget-empty centered">
        Pick or create a Kanban file in widget settings.
      </div>
    );
  }
  if (!configText(definition, "folder")) {
    return (
      <div className="dashboard-widget-empty centered">
        Select a folder in the Kanban settings.
      </div>
    );
  }
  const create = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const status = newStatus;
    const folder = configText(definition, "folder").replace(/^\/+|\/+$/g, ""),
      file = title.replace(/[\\/:*?"<>|#^[\]]/g, "").trim() ||
        `card-${Date.now()}`;
    const existing = new Set(
      (definition.workspaceOnly === true
        ? await listWorkspaceFiles()
        : await fileInventory()).map((entry) => entry.path),
    );
    let path = `${folder ? `${folder}/` : ""}${file}.md`, suffix = 2;
    while (existing.has(path)) {
      path = `${folder ? `${folder}/` : ""}${file} ${suffix++}.md`;
    }
    const writeBoardFile = definition.workspaceOnly === true
      ? writeWorkspaceFile
      : writeFile;
    await writeBoardFile(
      path,
      `---\n${
        yaml.dump({ [titleKey]: title, [statusKey]: status }, {
          lineWidth: -1,
          noRefs: true,
        }).trimEnd()
      }\n---\n\n`,
    );
    onChange({
      ...config,
      cardOrder: [
        ...new Set([
          ...(Array.isArray(config.cardOrder)
            ? config.cardOrder.filter((item): item is string =>
              typeof item === "string"
            )
            : rows.map((item) => item.id)),
          path,
        ]),
      ],
    });
    window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
    window.dispatchEvent(
      new CustomEvent("llm-hub:dashboard-data-changed", { detail: { path } }),
    );
    await load();
    setShowNewCard(false);
    setNewTitle("");
    setPreviewPath(path);
  };
  return (
    <div className="dashboard-kanban-widget">
      <header className="kanban-board-header">
        <strong>
          {configText(
            definition,
            "title",
            baseName(configText(config, "kanban")).replace(/\.kanban$/i, "") ||
              "Kanban",
          )}
        </strong>
        {error && <span className="dashboard-inline-error">{error}</span>}
        {moveError && (
          <span className="dashboard-inline-error">{moveError}</span>
        )}
        {tags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
          >
            <option value="">All tags</option>
            {tags.map((tag) => <option key={tag}>{tag}</option>)}
          </select>
        )}
        <button type="button" onClick={() => setShowNewCard(true)}>
          <Plus size={13} />New Card
        </button>
      </header>
      <div
        className="kanban-columns"
        onDragEnterCapture={(event) => {
          event.preventDefault();
        }}
        onDragOverCapture={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const section = (event.target as HTMLElement).closest<HTMLElement>(
            "[data-kanban-column-index]",
          );
          if (section) {
            const index = Number(section.dataset.kanbanColumnIndex);
            dragColumnRef.current = boardColumns[index]?.value ?? null;
          }
        }}
      >
        {boardColumns.map((column, index) => (
          <section
            key={column.value || "__unspecified"}
            data-kanban-column-index={index}
            className={`kanban-accent-${index % 8}`}
            onDragEnter={(event) => {
              event.preventDefault();
              dragColumnRef.current = column.value;
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              dragColumnRef.current = column.value;
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                if (dragColumnRef.current === column.value) {
                  dragColumnRef.current = null;
                }
                setDropTarget(null);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const path = event.dataTransfer.getData("text/dashboard-card") ||
                event.dataTransfer.getData("text/plain") ||
                draggingPathRef.current;
              const row = rows.find((item) => item.path === path);
              if (row) {
                dropHandledRef.current = true;
                void move(row, column.value);
              }
            }}
          >
            <header>
              <strong>{column.label}</strong>
              <span>
                {visibleRows.filter((row) =>
                  String(row.frontmatter[statusKey] ?? "") === column.value
                ).length}
              </span>
            </header>
            {visibleRows.filter((row) =>
              String(row.frontmatter[statusKey] ?? "") === column.value
            ).map((row) => (
              <button
                type="button"
                draggable
                key={row.path}
                className={`${draggingPath === row.path ? "dragging" : ""} ${
                  dropTarget?.path === row.path
                    ? `drop-${dropTarget.position}`
                    : ""
                }`}
                onDragStart={(event: DragEvent) => {
                  draggingPathRef.current = row.path;
                  dragColumnRef.current = null;
                  dropHandledRef.current = false;
                  setDraggingPath(row.path);
                  event.dataTransfer.effectAllowed = "move";
                  try {
                    event.dataTransfer.setData(
                      "text/dashboard-card",
                      row.path,
                    );
                    event.dataTransfer.setData("text/plain", row.path);
                  } catch {
                    // Some desktop WebViews reject custom drag data. The ref
                    // above remains available for the drop operation.
                  }
                }}
                onDragOver={(event) => {
                  const draggedPath = draggingPathRef.current || draggingPath;
                  if (!draggedPath || draggedPath === row.path) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = "move";
                  dragColumnRef.current = column.value;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setDropTarget({
                    path: row.path,
                    position: event.clientY < rect.top + rect.height / 2
                      ? "before"
                      : "after",
                  });
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const path = event.dataTransfer.getData(
                    "text/dashboard-card",
                  ) || event.dataTransfer.getData("text/plain") ||
                    draggingPathRef.current;
                  const dragged = rows.find((item) => item.path === path);
                  if (dragged) {
                    dropHandledRef.current = true;
                    void move(dragged, column.value);
                  }
                }}
                onDragEnd={() => {
                  const path = draggingPathRef.current;
                  const targetColumn = dragColumnRef.current;
                  const dragged = rows.find((item) => item.path === path);
                  if (
                    !dropHandledRef.current && dragged && targetColumn !== null
                  ) {
                    dropHandledRef.current = true;
                    void move(dragged, targetColumn, null);
                    return;
                  }
                  draggingPathRef.current = "";
                  dragColumnRef.current = null;
                  dropHandledRef.current = false;
                  setDraggingPath("");
                  setDropTarget(null);
                }}
                onClick={() => setPreviewPath(row.path)}
              >
                <strong>{String(row.frontmatter[titleKey] || row.name)}</strong>
                {(definition.displayFields || []).slice(0, 3).map((field) => {
                  const key = typeof field === "string"
                    ? field
                    : field.field || "";
                  return key
                    ? (
                      <small key={key}>
                        {key}: {String(row.frontmatter[key] ?? "")}
                      </small>
                    )
                    : null;
                })}
              </button>
            ))}
            <div
              className="kanban-column-drop-zone"
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = "move";
                dragColumnRef.current = column.value;
                setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const path = event.dataTransfer.getData(
                  "text/dashboard-card",
                ) || event.dataTransfer.getData("text/plain") ||
                  draggingPathRef.current;
                const dragged = rows.find((item) => item.path === path);
                if (dragged) {
                  dropHandledRef.current = true;
                  void move(dragged, column.value, null);
                }
              }}
              aria-label={`Drop card in ${column.label}`}
            />
          </section>
        ))}
      </div>
      {showNewCard && (
        <div
          className="kanban-new-card-backdrop"
          onClick={() => setShowNewCard(false)}
        >
          <form
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <header>
              <strong>New Card</strong>
              <button type="button" onClick={() => setShowNewCard(false)}>
                <X size={14} />
              </button>
            </header>
            <label>
              Title<input
                autoFocus
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="Card title"
              />
            </label>
            <label>
              Column<select
                value={newStatus}
                onChange={(event) => setNewStatus(event.target.value)}
              >
                {boardColumns.map((column) => (
                  <option key={column.value} value={column.value}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            <footer>
              <button type="button" onClick={() => setShowNewCard(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={!newTitle.trim()}
              >
                Create
              </button>
            </footer>
          </form>
        </div>
      )}
      {previewPath && (
        <KanbanCardModal
          path={previewPath}
          fileScope={definition.workspaceOnly === true
            ? "workspace"
            : "directory"}
          isDark={isDark}
          onNavigate={() => {
            setPreviewPath("");
            onOpenPath(previewPath);
          }}
          onSaved={() => void load()}
          onClose={() => setPreviewPath("")}
        />
      )}
    </div>
  );
}

export function BaseDashboardWidget({
  config,
  isDark,
  onChange,
  onOpenPath,
}: {
  config: Record<string, unknown>;
  settings: ChatSettings;
  isDark: boolean;
  onChange: (config: Record<string, unknown>) => void;
  onOpenPath: (path: string) => void;
}) {
  const [rows, setRows] = useState<DashboardDataRow[]>([]);
  const [baseData, setBaseData] = useState<BaseQueryData | null>(null);
  const [definition, setDefinition] = useState<BaseDefinition | null>(null);
  const [groupHeaders, setGroupHeaders] = useState<Record<string, string>>({});
  const [summaryCells, setSummaryCells] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [viewSort, setViewSort] = useState("");
  const [filterProperty, setFilterProperty] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [error, setError] = useState("");
  const [controlOpen, setControlOpen] = useState<
    "search" | "filter" | "sort" | null
  >(null);
  const [editingCell, setEditingCell] = useState<
    { path: string; property: string; value: string } | null
  >(null);
  const [previewPath, setPreviewPath] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const path = configText(config, "base");
    setLoading(true);
    if (!path) {
      setError("");
      setDefinition(null);
      setBaseData(null);
      setRows([]);
      setGroupHeaders({});
      setSummaryCells({});
      setLoading(false);
      return;
    }
    try {
      const file = await readFile(path);
      if (!file) {
        setError(`Cannot read ${path}`);
        return;
      }
      const inventory = await listWorkspaceFiles();
      const vaultFiles = await Promise.all(inventory.map(async (entry) => {
        const markdown = !entry.binary && /\.md(?:own)?$/i.test(entry.path);
        const source = markdown ? await readWorkspaceFile(entry.path) : null;
        return {
          id: entry.path,
          name: entry.path,
          mimeType: markdown ? "text/markdown" : "application/octet-stream",
          modifiedTime: new Date(entry.modTime || Date.now()).toISOString(),
          createdTime: new Date(
            entry.createdTime || entry.modTime || Date.now(),
          )
            .toISOString(),
          content: source?.content,
        };
      }));
      const queried = queryBaseFiles(
        file.content,
        selected || configText(config, "view"),
        vaultFiles,
      );
      const limit = typeof queried.view.limit === "number"
        ? queried.view.limit
        : 500;
      setRows(queried.rows.slice(0, limit));
      setBaseData({ ...queried, rows: queried.rows.slice(0, limit) });
      setDefinition(queried.compiled.config as unknown as BaseDefinition);
      setGroupHeaders(
        Object.fromEntries(queried.result.groupedData.flatMap((group) => {
          const first = group.entries[0]?.file.path;
          if (!first) return [];
          const details = [...group.summaries.entries()].map((
            [property, value],
          ) =>
            `${
              basePropertyLabel(
                queried.compiled.config as unknown as BaseDefinition,
                property,
              )
            }: ${valueToString(value)}`
          );
          return [[
            first,
            [valueToString(group.key), ...details].filter(Boolean).join(" · "),
          ]];
        })),
      );
      setSummaryCells(
        Object.fromEntries(
          Object.entries(queried.view.summaries || {}).map((
            [property, summary],
          ) => [
            property,
            `${summary}: ${
              valueToString(
                queried.result.getSummaryValue(
                  queried.result.data,
                  property,
                  summary,
                ),
              )
            }`,
          ]),
        ),
      );
      setSelected(queried.view.name);
      setError("");
    } catch (caught) {
      setBaseData(null);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [config, selected]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("llm-hub:dashboard-data-changed", refresh);
    return () =>
      window.removeEventListener("llm-hub:dashboard-data-changed", refresh);
  }, [load]);
  useEffect(() => {
    setViewSort("");
    setFilterProperty("");
    setFilterValue("");
    setQuery("");
  }, [selected]);
  useEffect(() => {
    if (!controlOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setControlOpen(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [controlOpen]);

  const views = definition?.views || [];
  const view = views.find((item) => item.name === selected) || views[0];
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row.cells)))]
    .sort();
  const quickFilterIsDate = !!filterProperty &&
    isBaseDateProperty(filterProperty, rows);
  const order = view?.order?.length
    ? view.order
    : ["file.name", ...Object.keys(rows[0]?.frontmatter || {}).slice(0, 5)];
  let visibleRows = searchBaseRows(rows, query);
  if (filterProperty && filterValue.trim()) {
    if (quickFilterIsDate) {
      visibleRows = visibleRows.filter((row) =>
        localDateKey(baseCellValue(row, filterProperty)) === filterValue
      );
    } else {
      const needle = filterValue.trim().toLocaleLowerCase();
      visibleRows = visibleRows.filter((row) =>
        String(baseCellValue(row, filterProperty) ?? "").toLocaleLowerCase()
          .includes(needle)
      );
    }
  }
  visibleRows = sortBaseRows(visibleRows, viewSort || undefined);
  const displayBaseData = baseData
    ? {
      ...baseData,
      rows: visibleRows,
      result: query || filterProperty || filterValue || viewSort
        ? { ...baseData.result, groupedData: [] }
        : baseData.result,
    }
    : null;

  const editCell = async (
    row: DashboardDataRow,
    property: string,
    next: string,
  ) => {
    if (property.startsWith("file.") || property.startsWith("formula.")) return;
    const key = property.replace(/^note\./, ""), current = row.frontmatter[key];
    const value: unknown = typeof current === "number"
      ? Number(next)
      : typeof current === "boolean"
      ? next.toLowerCase() === "true"
      : Array.isArray(current)
      ? next.split(",").map((item) => item.trim()).filter(Boolean)
      : next;
    const parsed = parseFrontmatter(row.content);
    await writeWorkspaceFile(
      row.path,
      `---\n${
        yaml.dump({ ...parsed.frontmatter, [key]: value }, {
          lineWidth: -1,
          noRefs: true,
        }).trimEnd()
      }\n---\n${parsed.body.replace(/^\s+/, "")}`,
    );
    window.dispatchEvent(
      new CustomEvent("llm-hub:dashboard-data-changed", {
        detail: { path: row.path },
      }),
    );
    await load();
  };
  const cell = (row: DashboardDataRow, key: string) => {
    return formatBaseCellValue(row, key);
  };
  if (loading) {
    return (
      <div className="dashboard-widget-loading centered">
        <Loader2 size={18} className="spin" />
      </div>
    );
  }
  if (!configText(config, "base")) {
    return (
      <div className="dashboard-widget-empty centered icon">
        <Database size={24} />Select a Base file in widget settings.
      </div>
    );
  }
  return (
    <div className="dashboard-base-widget">
      <header className="base-view-header">
        <span title={configText(config, "base")}>
          {configText(config, "base")}
        </span>
        {views.length > 1 && (
          <select
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              onChange({ ...config, view: event.target.value });
            }}
          >
            {views.map((item) => <option key={item.name}>{item.name}</option>)}
          </select>
        )}
        <div>
          <button
            type="button"
            className={query ? "active" : ""}
            title="Search"
            aria-label="Search"
            onClick={() =>
              setControlOpen((value) => value === "search" ? null : "search")}
          >
            <Search size={12} />
            {query && <span className="base-control-active-dot" />}
          </button>
          <button
            type="button"
            className={filterProperty || filterValue ? "active" : ""}
            title="Filter"
            aria-label="Filter"
            onClick={() =>
              setControlOpen((value) => value === "filter" ? null : "filter")}
          >
            <Filter size={12} />
            {(filterProperty || filterValue) && (
              <span className="base-control-active-dot" />
            )}
          </button>
          <button
            type="button"
            className={viewSort ? "active" : ""}
            title="Sort"
            aria-label="Sort"
            onClick={() =>
              setControlOpen((value) => value === "sort" ? null : "sort")}
          >
            <ArrowUpDown size={12} />
            {viewSort && <span className="base-control-active-dot" />}
          </button>
          <button type="button" title="Refresh" onClick={() => void load()}>
            <RefreshCw size={12} />
          </button>
        </div>
      </header>
      {controlOpen && (
        <>
          <button
            type="button"
            className="base-control-scrim"
            aria-label="Close controls"
            onClick={() => setControlOpen(null)}
          />
          <div className="base-view-popover">
            {controlOpen === "search"
              ? (
                <>
                  <header>
                    <strong>Search</strong>
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                      >
                        Reset
                      </button>
                    )}
                  </header>
                  <label className="base-search-control">
                    <Search size={13} />
                    <input
                      autoFocus
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search rows"
                    />
                    {query && (
                      <button
                        type="button"
                        title="Clear search"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </label>
                </>
              )
              : controlOpen === "filter"
              ? (
                <>
                  <header>
                    <strong>Filter</strong>
                    {(filterProperty || filterValue) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilterProperty("");
                          setFilterValue("");
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </header>
                  <label>
                    <span>Property</span>
                    <select
                      value={filterProperty}
                      onChange={(event) => {
                        setFilterProperty(event.target.value);
                        setFilterValue("");
                      }}
                    >
                      <option value="">Select property…</option>
                      {fields.map((field) => (
                        <option key={field} value={field}>
                          {basePropertyLabel(definition, field)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{quickFilterIsDate ? "Date" : "Contains"}</span>
                    <input
                      type={quickFilterIsDate ? "date" : "text"}
                      value={filterValue}
                      disabled={!filterProperty}
                      onChange={(event) => setFilterValue(event.target.value)}
                    />
                  </label>
                </>
              )
              : (
                <>
                  <header>
                    <strong>Sort</strong>
                    {viewSort && (
                      <button
                        type="button"
                        onClick={() => setViewSort("")}
                      >
                        Reset
                      </button>
                    )}
                  </header>
                  <div className="base-sort-options">
                    <button
                      type="button"
                      className={!viewSort ? "active" : ""}
                      onClick={() => {
                        setViewSort("");
                        setControlOpen(null);
                      }}
                    >
                      Configured sort
                    </button>
                    {fields.flatMap((
                      field,
                    ) => [
                      <button
                        type="button"
                        key={field}
                        className={viewSort === field ? "active" : ""}
                        onClick={() => {
                          setViewSort(field);
                          setControlOpen(null);
                        }}
                      >
                        {basePropertyLabel(definition, field)} ↑
                      </button>,
                      <button
                        type="button"
                        key={`-${field}`}
                        className={viewSort === `-${field}` ? "active" : ""}
                        onClick={() => {
                          setViewSort(`-${field}`);
                          setControlOpen(null);
                        }}
                      >
                        {basePropertyLabel(definition, field)} ↓
                      </button>,
                    ])}
                  </div>
                </>
              )}
          </div>
        </>
      )}
      {error
        ? <div className="dashboard-widget-error centered">{error}</div>
        : displayBaseData
        ? (
          <BaseViewRenderer
            data={displayBaseData}
            definition={definition}
            onOpenPath={setPreviewPath}
          />
        )
        : view?.type === "cards"
        ? (
          <div className="base-cards">
            {visibleRows.map((row) => (
              <section
                key={row.path}
                className={groupHeaders[row.path] ? "base-group-start" : ""}
              >
                {groupHeaders[row.path] && <h4>{groupHeaders[row.path]}</h4>}
                <button
                  type="button"
                  onClick={() => setPreviewPath(row.path)}
                >
                  <strong>{cell(row, order[0]) || row.name}</strong>
                  {order.slice(1, 5).map((key) => (
                    <small key={key}>
                      {basePropertyLabel(definition, key)}: {cell(row, key)}
                    </small>
                  ))}
                </button>
              </section>
            ))}
          </div>
        )
        : view?.type === "list"
        ? (
          <div className="base-list">
            {visibleRows.map((row) => (
              <section
                key={row.path}
                className={groupHeaders[row.path] ? "base-group-start" : ""}
              >
                {groupHeaders[row.path] && <h4>{groupHeaders[row.path]}</h4>}
                <button
                  type="button"
                  onClick={() => setPreviewPath(row.path)}
                >
                  <strong>{cell(row, order[0]) || row.name}</strong>
                  <span>
                    {order.slice(1, 4).map((key) => cell(row, key)).filter(
                      Boolean,
                    ).join(" · ")}
                  </span>
                </button>
              </section>
            ))}
          </div>
        )
        : (
          <div className="base-table">
            <table>
              <thead>
                <tr>
                  {order.map((key) => (
                    <th key={key}>{basePropertyLabel(definition, key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <Fragment key={row.path}>
                    {groupHeaders[row.path] && (
                      <tr className="base-group-row">
                        <th colSpan={order.length}>{groupHeaders[row.path]}</th>
                      </tr>
                    )}
                    <tr>
                      {order.map((key) => {
                        const editing = editingCell?.path === row.path &&
                          editingCell.property === key;
                        return (
                          <td
                            key={key}
                            title={key.startsWith("file.") ||
                                key.startsWith("formula.")
                              ? "Double-click to preview"
                              : "Double-click to edit"}
                            onDoubleClick={() =>
                              key.startsWith("file.") ||
                                key.startsWith("formula.")
                                ? setPreviewPath(row.path)
                                : setEditingCell({
                                  path: row.path,
                                  property: key,
                                  value: cell(row, key),
                                })}
                          >
                            {editing
                              ? (
                                <input
                                  autoFocus
                                  value={editingCell.value}
                                  onChange={(event) =>
                                    setEditingCell({
                                      ...editingCell,
                                      value: event.target.value,
                                    })}
                                  onBlur={() => {
                                    const value = editingCell.value;
                                    setEditingCell(null);
                                    void editCell(row, key, value);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                      setEditingCell(null);
                                    }
                                    if (event.key === "Enter") {
                                      event.currentTarget.blur();
                                    }
                                  }}
                                />
                              )
                              : cell(row, key)}
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
              {Object.keys(summaryCells).length > 0 && (
                <tfoot>
                  <tr>
                    {order.map((key) => (
                      <td key={key}>{summaryCells[key] || ""}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      {previewPath && (
        <KanbanCardModal
          path={previewPath}
          fileScope="workspace"
          isDark={isDark}
          onNavigate={() => {
            const path = previewPath;
            setPreviewPath("");
            onOpenPath(path);
          }}
          onSaved={() => void load()}
          onClose={() => setPreviewPath("")}
        />
      )}
    </div>
  );
}

interface SecretEntry {
  path: string;
  content: string;
  description: string;
  publicMetadata: Record<string, string>;
}
interface SecretMetadataField {
  id: string;
  key: string;
  value: string;
}
export function SecretManagerDashboardWidget(
  { config, managerId }: { config: Record<string, unknown>; managerId: string },
) {
  const folder = configText(config, "folder").replace(/^\/+|\/+$/g, ""),
    [entries, setEntries] = useState<SecretEntry[] | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false),
    [viewing, setViewing] = useState<SecretEntry | null>(null),
    [fileViewing, setFileViewing] = useState(""),
    [busy, setBusy] = useState(false),
    [autoUnlocking, setAutoUnlocking] = useState(false);
  const [name, setName] = useState(""),
    [directory, setDirectory] = useState(""),
    [description, setDescription] = useState(""),
    [secretValue, setSecretValue] = useState(""),
    [password, setPassword] = useState(() =>
      getSecretManagerSessionPassword(managerId)
    );
  const [createKind, setCreateKind] = useState<"secret" | "file">("secret"),
    [selectedFile, setSelectedFile] = useState(""),
    [fileChoices, setFileChoices] = useState<string[]>([]);
  const [metadataFields, setMetadataFields] = useState<SecretMetadataField[]>(
      [],
    ),
    [viewPassword, setViewPassword] = useState(""),
    [viewValue, setViewValue] = useState<string | null>(null),
    [editMode, setEditMode] = useState(false),
    [copied, setCopied] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  );
  const load = useCallback(async () => {
    try {
      const paths = (await listWorkspaceFiles()).filter((entry) =>
        entry.path.toLowerCase().endsWith(".encrypted") &&
        (!folder || entry.path.startsWith(`${folder}/`))
      ).map((entry) => entry.path);
      const values = await Promise.all(paths.map(async (path) => {
        const content = (await readWorkspaceFile(path))?.content || "",
          metadata = getEncryptedFileMetadata(content);
        return {
          path,
          content,
          description: metadata.description || "",
          publicMetadata: metadata.publicMetadata || {},
        };
      }));
      setEntries(values);
      setError("");
    } catch (caught) {
      setEntries([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [folder]);
  useEffect(() => {
    void load();
  }, [load]);
  const metadataRecord = (fields: SecretMetadataField[]) =>
    Object.fromEntries(
      fields.map((field) => [field.key.trim(), field.value]).filter(([key]) =>
        key
      ),
    );
  const resetCreate = () => {
    setName("");
    setDirectory("");
    setDescription("");
    setSecretValue("");
    setCreateKind("secret");
    setSelectedFile("");
    setPassword(getSecretManagerSessionPassword(managerId));
    setMetadataFields([]);
    setError("");
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (createKind === "file") {
      if (!selectedFile || !password) return;
      setBusy(true);
      setError("");
      try {
        await encryptWorkspaceFile(
          `workspace://${selectedFile}`,
          password,
          metadataRecord(metadataFields),
        );
        setSecretManagerSessionPassword(managerId, password);
        await load();
        setCreateOpen(false);
        resetCreate();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
      return;
    }
    const safe = name.replace(/[\\/:*?"<>|]/g, "").trim();
    if (!safe || !password || !secretValue) return;
    const prefix = [folder, directory.replace(/^\/+|\/+$/g, "")].filter(Boolean)
      .join("/");
    const path = `${prefix ? `${prefix}/` : ""}${safe}.encrypted`;
    if ((entries || []).some((entry) => entry.path === path)) {
      setError("A secret with this name already exists.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const keys = await generateKeyPair(),
        protectedKey = await encryptPrivateKey(keys.privateKey, password),
        content = await encryptFileContent(
          secretValue,
          keys.publicKey,
          protectedKey.encryptedPrivateKey,
          protectedKey.salt,
          { description, publicMetadata: metadataRecord(metadataFields) },
        );
      await writeWorkspaceFile(path, content);
      setSecretManagerSessionPassword(managerId, password);
      await load();
      setCreateOpen(false);
      resetCreate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  const openSecret = async (entry: SecretEntry) => {
    if (entry.publicMetadata.sourceKind === "workspace-file") {
      setFileViewing(`workspace://${entry.path}`);
      return;
    }
    const savedPassword = getSecretManagerSessionPassword(managerId);
    setViewing(entry);
    setViewPassword(savedPassword);
    setViewValue(null);
    setEditMode(false);
    setCopied(false);
    setError("");
    setDescription(entry.description);
    setMetadataFields(
      Object.entries(entry.publicMetadata).map(([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value,
      })),
    );
    if (!savedPassword) return;
    setBusy(true);
    setAutoUnlocking(true);
    try {
      setViewValue(await decryptFileContent(entry.content, savedPassword));
    } catch {
      setSecretManagerSessionPassword(managerId, "");
      setPassword("");
      setViewPassword("");
      setError(
        "Could not decrypt the secret. Enter the manager password again.",
      );
    } finally {
      setBusy(false);
      setAutoUnlocking(false);
    }
  };
  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!viewing || !viewPassword) return;
    setBusy(true);
    try {
      setViewValue(await decryptFileContent(viewing.content, viewPassword));
      setSecretManagerSessionPassword(managerId, viewPassword);
      setPassword(viewPassword);
      setError("");
    } catch {
      setError("Could not decrypt the secret. Check the password.");
    } finally {
      setBusy(false);
    }
  };
  const update = async (event: FormEvent) => {
    event.preventDefault();
    if (!viewing || viewValue === null || !viewPassword) return;
    setBusy(true);
    try {
      const encrypted = await reencryptFileContent(
        viewing.content,
        viewValue,
        viewPassword,
      );
      const nextContent = setEncryptedFileMetadata(encrypted, {
        description,
        publicMetadata: metadataRecord(metadataFields),
      });
      await writeWorkspaceFile(viewing.path, nextContent);
      await load();
      setViewing({
        ...viewing,
        content: nextContent,
        description,
        publicMetadata: metadataRecord(metadataFields),
      });
      setEditMode(false);
      setError("");
    } catch {
      setError("Could not update the secret. Check the password.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (entry: SecretEntry) => {
    if (!confirm(`Delete ${entry.path}?`)) return;
    await deleteWorkspaceFile(entry.path);
    window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
    if (viewing?.path === entry.path) setViewing(null);
    await load();
  };
  const needle = query.trim().toLocaleLowerCase(),
    visible = (entries || []).filter((entry) =>
      `${entry.path}\n${entry.description}\n${
        Object.entries(entry.publicMetadata).flat().join("\n")
      }`.toLocaleLowerCase().includes(needle)
    );
  const relativePath = (entry: SecretEntry) =>
    folder && entry.path.startsWith(`${folder}/`)
      ? entry.path.slice(folder.length + 1)
      : entry.path;
  const rootEntries = visible.filter((entry) =>
    !relativePath(entry).includes("/")
  );
  const groupedEntries = [
    ...visible.reduce((groups, entry) => {
      const relative = relativePath(entry);
      if (!relative.includes("/")) return groups;
      const directory = relative.slice(0, relative.lastIndexOf("/"));
      groups.set(directory, [...(groups.get(directory) || []), entry]);
      return groups;
    }, new Map<string, SecretEntry[]>()).entries(),
  ].sort(([left], [right]) => left.localeCompare(right));
  const secretRow = (entry: SecretEntry) => (
    <div
      role="button"
      tabIndex={0}
      key={entry.path}
      onClick={() => void openSecret(entry)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") void openSecret(entry);
      }}
    >
      <KeyRound size={15} />
      <span>
        <strong>{baseName(entry.path).replace(/\.encrypted$/i, "")}</strong>
        <small className="secret-entry-details">
          {[
            entry.description,
            ...Object.entries(entry.publicMetadata).map(([key, value]) =>
              `${key}: ${value}`
            ),
            entry.path,
          ].filter(Boolean).join(" · ")}
        </small>
      </span>
      <button
        type="button"
        title="Delete"
        onClick={(event) => {
          event.stopPropagation();
          void remove(entry);
        }}
      >
        <X size={11} />
      </button>
    </div>
  );
  const secretRows = (
    <>
      {groupedEntries.map(([directory, group]) => {
        const expanded = !!query.trim() || expandedGroups[directory] === true;
        return (
          <section className="secret-group" key={directory}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() =>
                setExpandedGroups((current) => ({
                  ...current,
                  [directory]: !current[directory],
                }))}
            >
              {expanded
                ? <ChevronDown size={14} />
                : <ChevronRight size={14} />}
              <Folder size={15} />
              <strong>{directory}</strong>
              <span>{group.length}</span>
            </button>
            {expanded && <div>{group.map(secretRow)}</div>}
          </section>
        );
      })}
      {rootEntries.map(secretRow)}
    </>
  );
  const metadataEditor = (
    <div className="secret-metadata-editor">
      <header>
        <span>Public metadata</span>
        <button
          type="button"
          onClick={() =>
            setMetadataFields((
              fields,
            ) => [...fields, { id: crypto.randomUUID(), key: "", value: "" }])}
        >
          <Plus size={11} />Add field
        </button>
      </header>
      {metadataFields.map((field) => (
        <div key={field.id}>
          <input
            value={field.key}
            onChange={(event) =>
              setMetadataFields((fields) =>
                fields.map((item) =>
                  item.id === field.id
                    ? { ...item, key: event.target.value }
                    : item
                )
              )}
            placeholder="Field name"
          />
          <input
            value={field.value}
            onChange={(event) =>
              setMetadataFields((fields) =>
                fields.map((item) =>
                  item.id === field.id
                    ? { ...item, value: event.target.value }
                    : item
                )
              )}
            placeholder="Field value"
          />
          <button
            type="button"
            onClick={() =>
              setMetadataFields((fields) =>
                fields.filter((item) => item.id !== field.id)
              )}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
  return (
    <div className="dashboard-secret-widget">
      <header>
        <label>
          <Search size={12} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, description, account"
          />
        </label>
        <span>{visible.length}</span>
        <button
          type="button"
          className="primary"
          onClick={() => {
            resetCreate();
            void listWorkspaceFiles().then((items) =>
              setFileChoices(
                items.map((item) => item.path).filter((path) =>
                  !path.toLowerCase().endsWith(".encrypted")
                ),
              )
            );
            setCreateOpen(true);
          }}
        >
          <Plus size={12} />New Secret
        </button>
      </header>
      <div className="secret-folder-bar" title={folder || "Workspace root"}>
        <Folder size={13} />
        <span>{folder || "Workspace root"}</span>
      </div>
      {error && !createOpen && !viewing && (
        <div className="dashboard-widget-error">{error}</div>
      )}
      <div className="secret-list">
        {entries === null && (
          <div className="dashboard-widget-loading">
            <Loader2 size={16} className="spin" />
          </div>
        )}
        {entries !== null && visible.length === 0 && (
          <div className="dashboard-widget-empty secret-empty">
            <Lock size={21} />No secrets found.
          </div>
        )}
        {secretRows}
      </div>
      {createOpen && (
        <WidgetDialog
          title="New Secret"
          onClose={() => setCreateOpen(false)}
          className="secret-dialog"
        >
          <form className="secret-dialog-form" onSubmit={create}>
            <fieldset className="secret-create-kind">
              <legend>Encrypt</legend>
              <label>
                <input
                  type="radio"
                  name="secret-create-kind"
                  checked={createKind === "secret"}
                  onChange={() => setCreateKind("secret")}
                />Secret value
              </label>
              <label>
                <input
                  type="radio"
                  name="secret-create-kind"
                  checked={createKind === "file"}
                  onChange={() => setCreateKind("file")}
                />Existing file
              </label>
            </fieldset>
            {createKind === "secret"
              ? (
                <label>
                  Name<input
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Secret name"
                  />
                </label>
              )
              : (
                <label>
                  File
                  <div className="secret-file-select">
                    <FileText size={16} />
                    <select
                      autoFocus
                      required
                      value={selectedFile}
                      onChange={(event) => setSelectedFile(event.target.value)}
                    >
                      <option value="">Select a Workspace file…</option>
                      {fileChoices.map((path) => (
                        <option key={path} value={path}>{path}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} />
                  </div>
                  <small>
                    The source is replaced with a self-contained .encrypted
                    file.
                  </small>
                </label>
              )}
            {createKind === "secret" && (
              <label>
                Directory{" "}
                <small>
                  Optional, relative to the configured secret folder.
                </small>
                <input
                  value={directory}
                  onChange={(event) => setDirectory(event.target.value)}
                  placeholder="Accounts/Work"
                />
              </label>
            )}
            <label>
              Description{" "}
              <small>Visible metadata must not contain a secret.</small>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {metadataEditor}
            {createKind === "secret" && (
              <label>
                Value<textarea
                  required
                  rows={7}
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                  spellCheck={false}
                />
              </label>
            )}
            <label>
              Manager password<input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <small>
                Reused by this secret manager for the current session only.
              </small>
            </label>
            {error && <p className="dashboard-widget-error">{error}</p>}
            <footer>
              <button type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={busy || !password || (createKind === "secret"
                  ? !name.trim() || !secretValue
                  : !selectedFile)}
              >
                {busy
                  ? "Encrypting…"
                  : createKind === "file"
                  ? "Encrypt file"
                  : "Create"}
              </button>
            </footer>
          </form>
        </WidgetDialog>
      )}
      {viewing && (
        <WidgetDialog
          title={baseName(viewing.path).replace(/\.encrypted$/i, "")}
          onClose={() => setViewing(null)}
          className="secret-dialog"
        >
          {autoUnlocking
            ? (
              <div className="secret-dialog-unlocking">
                <Loader2 size={22} className="spin" />
                <span>Unlocking…</span>
              </div>
            )
            : viewValue === null
            ? (
              <form className="secret-dialog-form" onSubmit={unlock}>
                {viewing.description && <p>{viewing.description}</p>}
                {Object.keys(viewing.publicMetadata).length > 0 && (
                  <dl>
                    {Object.entries(viewing.publicMetadata).map((
                      [key, value],
                    ) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="hint">
                  Enter this secret manager's password. It will be reused for
                  the current session.
                </p>
                <label>
                  Password<input
                    autoFocus
                    type="password"
                    value={viewPassword}
                    onChange={(event) => setViewPassword(event.target.value)}
                  />
                </label>
                {error && <p className="dashboard-widget-error">{error}</p>}
                <footer>
                  <button
                    type="submit"
                    className="primary"
                    disabled={busy || !viewPassword}
                  >
                    {busy ? "Unlocking…" : "Unlock"}
                  </button>
                </footer>
              </form>
            )
            : editMode
            ? (
              <form className="secret-dialog-form" onSubmit={update}>
                <label>
                  Description<textarea
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                {metadataEditor}
                <label>
                  Value<textarea
                    rows={7}
                    required
                    value={viewValue}
                    onChange={(event) => setViewValue(event.target.value)}
                    spellCheck={false}
                  />
                </label>
                {error && <p className="dashboard-widget-error">{error}</p>}
                <footer>
                  <button type="button" onClick={() => setEditMode(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </button>
                </footer>
              </form>
            )
            : (
              <div className="secret-dialog-view">
                {viewing.description && <p>{viewing.description}</p>}
                <header>
                  <strong>Value</strong>
                  <span>
                    <button type="button" onClick={() => setEditMode(true)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(viewValue);
                        setCopied(true);
                      }}
                    >
                      <Clipboard size={12} />
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </span>
                </header>
                <textarea
                  readOnly
                  rows={7}
                  value={viewValue}
                  spellCheck={false}
                />
              </div>
            )}
        </WidgetDialog>
      )}
      {fileViewing && (
        <EncryptedFileModal
          path={fileViewing}
          onClose={() => setFileViewing("")}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

export function UnknownDashboardWidget(
  { widget }: { widget: DashboardWidget },
) {
  return (
    <div className="dashboard-unknown-widget">
      <Puzzle size={24} />
      <span>Unsupported widget: {widget.type}</span>
    </div>
  );
}
