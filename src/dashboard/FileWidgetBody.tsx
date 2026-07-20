import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  ChevronsRight,
  Copy,
  ExternalLink,
  FileArchive,
  FilePlus2,
  SquarePen,
} from "lucide-react";
import { useI18n } from "../i18n/context";
import { MarkdownPreview } from "../components/MarkdownPreview";
import {
  AddFrontmatterButton,
  FrontmatterEditor,
  parseFrontmatter,
  replaceFrontmatterBody,
} from "../components/FrontmatterEditor";
import { PdfViewer, type PdfViewerHandle } from "../components/PdfViewer";
import { WysiwygEditor } from "../components/WysiwygEditor";
import { ImageViewer } from "../components/ImageViewer";
import { isEpubFileName } from "../lib/epub";
import { memoFilePathFor } from "../lib/memoPath";
import {
  buildEntryBlock,
  deleteEntry,
  type MemoEntry,
  parseMemoFile,
  replaceEntryBody,
  serializeMemoFile,
  setEntryPinned,
  uniqueEntryId,
} from "../lib/memoTimeline";
import {
  buildTextIndex,
  clearHighlight,
  clearMemoHighlights,
  ensureHighlightStyles,
  findQuoteMatch,
  normalizeAnchorText,
  selectionContextFor,
  setHighlight,
  setMemoHighlights,
  type TextIndex,
} from "../lib/textAnchor";
import {
  appendMemoFile,
  hasWailsBackend,
  openLocalFileDefault,
  readFile,
  readLocalFile,
  readMemoFile,
  writeBinaryFile,
  writeMemoFileAtomic,
  writeWorkspaceBinaryFile,
} from "../lib/wailsBackend";
import {
  isLocalDocumentHref,
  localHrefToPathCandidates,
  pathDirName,
  transformWikiLinks,
  wikiTargetToPath,
} from "../lib/wikiLinks";
import {
  type MemoDraft,
  memoHoverPreview,
  MemoTimelinePanel,
} from "./MemoTimelinePanel";
import type { MarkdownMode } from "../App";
import type { DashboardWidget } from "./types";
import { BaseFileView } from "./BaseFileView";
import { KanbanFileView } from "./KanbanFileView";
import { CanvasFileView } from "../canvas/CanvasFileView";
import { docKindFor } from "./documentKind";
import type { ActiveSelection } from "../llm/selection";
import { appendTimelineEntry, memoTimelineBody } from "./timelineEvents";
import { WorkflowFileView } from "../workflow/WorkflowFileView";
import { memoChatDraft } from "./memoChat";

const FLASH_MS = 1000;
const TOAST_MS = 2500;

interface ResolvedGroup {
  key: string;
  range: Range;
  win: Window;
  inFrame: boolean;
  entryIds: string[];
}

interface SelectionPopup {
  x: number;
  y: number;
  draft: MemoDraft;
}

interface HoverPopover {
  x: number;
  y: number;
  count: number;
  preview: string;
}

interface WikiLinkPopup {
  x: number;
  y: number;
  path: string;
}

function HtmlDocumentFrame({
  content,
  title,
  fontScale,
  widthScale,
  frameRef,
  onFrameLoad,
  emptyLabel,
}: {
  content: string;
  title: string;
  fontScale: number;
  widthScale: number;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  onFrameLoad: () => void;
  emptyLabel: string;
}) {
  const [url, setUrl] = useState("");
  const contentWidth = `${Math.round(1120 * widthScale / 100)}px`;

  useEffect(() => {
    if (!content) {
      setUrl("");
      return;
    }

    const blob = new Blob([content], {
      type: "text/html;charset=utf-8",
    });
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [content]);

  const applyViewAdjustments = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;

    doc.documentElement.style.setProperty("--view-font-scale", `${fontScale}%`);
    doc.documentElement.style.setProperty("--view-content-width", contentWidth);
    const styleId = "mdwys-view-adjustments";
    const style = doc.getElementById(styleId) ?? doc.createElement("style");
    style.id = styleId;
    style.textContent = `
      html { font-size: ${fontScale}% !important; }
      body {
        font-size: 1rem !important;
        line-height: 1.75 !important;
        padding-left: clamp(12px, 2vw, 28px) !important;
        padding-right: clamp(12px, 2vw, 28px) !important;
      }
      .epub-book {
        width: min(100%, ${contentWidth}) !important;
        max-width: none !important;
      }
    `;
    if (!style.parentNode) {
      doc.head.appendChild(style);
    }
  }, [contentWidth, fontScale, frameRef]);

  useEffect(() => {
    applyViewAdjustments();
  }, [applyViewAdjustments]);

  if (!url) return <div className="dashboard-empty">{emptyLabel}</div>;

  return (
    <iframe
      ref={frameRef}
      className="dashboard-web"
      src={url}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      onLoad={() => {
        applyViewAdjustments();
        onFrameLoad();
      }}
      style={{
        ["--view-font-scale" as string]: `${fontScale}%`,
        ["--view-content-width" as string]: contentWidth,
      }}
    />
  );
}

function pageFromAnchor(anchor: string): number | null {
  const match = anchor.match(/^page=(\d+)$/);
  return match ? Number(match[1]) : null;
}

function spineFromAnchor(anchor: string): number | null {
  const match = anchor.match(/^spine=(\d+)$/);
  return match ? Number(match[1]) : null;
}

function latestEntryId(entries: MemoEntry[], ids: string[]): string {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const sorted = [...ids].sort((a, b) =>
    (byId.get(b)?.createdAt ?? "").localeCompare(byId.get(a)?.createdAt ?? "")
  );
  return sorted[0] ?? ids[0];
}

export function FileWidgetBody({
  widget,
  fallbackFileName,
  fallbackContent,
  isDark,
  onConfigChange,
  memoDirPath,
  memoSyncTimeline,
  onOpenPath,
  onOpenPathMaximized,
  onNavigatePath,
  onActivate,
  onSelectionChange,
  aiAvailable,
  onAskAI,
  onAskMemoAI,
}: {
  widget: DashboardWidget;
  fallbackFileName: string;
  fallbackContent: string;
  isDark: boolean;
  onConfigChange: (config: Record<string, unknown>) => void;
  memoDirPath: string;
  memoSyncTimeline: string;
  onOpenPath: (path: string) => void;
  onOpenPathMaximized: (path: string) => void;
  onNavigatePath: (path: string) => void;
  onActivate: () => void;
  onSelectionChange: (selection: ActiveSelection | null) => void;
  aiAvailable: boolean;
  onAskAI: (selection: ActiveSelection) => void;
  onAskMemoAI: (draft: string) => void;
}) {
  const { t: tr } = useI18n();
  const filePath = typeof widget.config.filePath === "string"
    ? widget.config.filePath
    : typeof widget.config.path === "string"
    ? widget.config.path
    : "";
  const fileName = typeof widget.config.fileName === "string"
    ? widget.config.fileName
    : filePath.split("/").pop() || fallbackFileName;
  const documentContent = typeof widget.config.content === "string"
    ? widget.config.content
    : fallbackContent;
  const markdownMode: MarkdownMode =
    widget.config.mode === "preview" || widget.config.mode === "wysiwyg" ||
      widget.config.mode === "raw"
      ? widget.config.mode
      : "preview";
  const viewFontScale = typeof widget.config.viewFontScale === "number"
    ? Math.max(70, Math.min(240, widget.config.viewFontScale))
    : 100;
  const viewWidthScale = typeof widget.config.viewWidthScale === "number"
    ? Math.max(70, Math.min(180, widget.config.viewWidthScale))
    : 100;
  const memoPanelOpen = widget.config.memoPanelOpen === true;
  const memoPanelCollapsed = widget.config.memoPanelCollapsed === true;
  // Highlights stay on while the panel is open OR merely collapsed («);
  // only closing with × turns them off. Clicking a highlight while
  // collapsed re-expands the panel (openPanel).
  const memoPanelVisible = memoPanelOpen && !memoPanelCollapsed;
  const kind = docKindFor(fileName);
  const selectionPath = filePath || fileName;
  const downloadPath = widget.config.fileScope === "workspace"
    ? `workspace://${filePath}`
    : widget.config.fileScope === "files"
    ? `files://${filePath}`
    : filePath;

  const uploadMarkdownImage = useCallback(
    async (file: File): Promise<string> => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () =>
          reject(reader.error ?? new Error("Could not read image."));
        reader.onload = () =>
          resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
        reader.readAsDataURL(file);
      });
      const safeName = file.name.replace(/[^\w.-]+/g, "-") || "image";
      const attachmentName = `${Date.now()}-${safeName}`;
      const slash = filePath.replaceAll("\\", "/").lastIndexOf("/");
      const directory = slash >= 0 ? filePath.slice(0, slash + 1) : "";
      const target = `${directory}attachments/${attachmentName}`;
      if (widget.config.fileScope === "workspace") {
        await writeWorkspaceBinaryFile(target, base64);
      } else if (widget.config.fileScope === "files") {
        await writeBinaryFile(`files://${target}`, base64);
      } else await writeBinaryFile(target, base64);
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
      return `attachments/${attachmentName}`;
    },
    [filePath, widget.config.fileScope],
  );

  const memoFilePath = useMemo(
    () => (memoDirPath && filePath
      ? memoFilePathFor(memoDirPath, filePath)
      : ""),
    [memoDirPath, filePath],
  );
  const wikiBaseDirPath = useMemo(() => pathDirName(filePath) || memoDirPath, [
    filePath,
    memoDirPath,
  ]);
  const parsedFrontmatter = useMemo(
    () => parseFrontmatter(kind === "external" ? "" : documentContent),
    [documentContent, kind],
  );
  const markdownBody =
    parsedFrontmatter.hasFrontmatter && parsedFrontmatter.valid
      ? parsedFrontmatter.body
      : documentContent;
  const previewContent = useMemo(() => transformWikiLinks(markdownBody), [
    markdownBody,
  ]);

  const [memoEntries, setMemoEntries] = useState<MemoEntry[]>([]);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError] = useState("");
  const [draft, setDraft] = useState<MemoDraft | null>(null);
  const [selPopup, setSelPopup] = useState<SelectionPopup | null>(null);
  const [hover, setHover] = useState<HoverPopover | null>(null);
  const [wikiLinkPopup, setWikiLinkPopup] = useState<WikiLinkPopup | null>(
    null,
  );
  const [toast, setToast] = useState("");
  const [flashEntryId, setFlashEntryId] = useState<string | null>(null);
  const [unresolvedIds, setUnresolvedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [frameLoadTick, setFrameLoadTick] = useState(0);
  const [pdfPagesTick, setPdfPagesTick] = useState(0);
  const [pdfReloadVersion, setPdfReloadVersion] = useState(0);

  const contentWrapRef = useRef<HTMLDivElement | null>(null);
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const pdfRef = useRef<PdfViewerHandle | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resolvedGroupsRef = useRef<ResolvedGroup[]>([]);
  const resolvedByIdRef = useRef(
    new Map<string, { range: Range; win: Window }>(),
  );
  const toastTimerRef = useRef(0);
  const flashTimerRef = useRef(0);
  const memoEntriesRef = useRef<MemoEntry[]>([]);
  const recoveredPdfPathRef = useRef("");
  memoEntriesRef.current = memoEntries;

  useEffect(() => {
    recoveredPdfPathRef.current = "";
    setPdfReloadVersion(0);
  }, [selectionPath]);

  const recoverPdfFromDisk = useCallback(() => {
    if (!filePath || widget.config.encrypted === true) return;
    if (recoveredPdfPathRef.current === selectionPath) return;
    recoveredPdfPathRef.current = selectionPath;
    const absolute = /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(filePath);
    const readPath = absolute ? filePath : downloadPath;
    void (absolute ? readLocalFile(readPath) : readFile(readPath)).then(
      (file) => {
        if (!file?.content) return;
        onConfigChange({
          ...widget.config,
          fileName: file.fileName,
          content: file.content,
        });
        setPdfReloadVersion((value) => value + 1);
      },
    ).catch((reloadError) => {
      console.warn("Could not recover PDF from disk.", reloadError);
    });
  }, [
    downloadPath,
    fileName,
    filePath,
    onConfigChange,
    selectionPath,
    widget.config,
  ]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  const flashEntry = useCallback((entryId: string) => {
    setFlashEntryId(entryId);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(
      () => setFlashEntryId(null),
      FLASH_MS + 200,
    );
  }, []);

  useEffect(() => () => {
    window.clearTimeout(toastTimerRef.current);
    window.clearTimeout(flashTimerRef.current);
  }, []);

  useEffect(() => {
    ensureHighlightStyles(document);
  }, []);

  // ---- memo file IO -------------------------------------------------------

  const reloadMemo = useCallback(async () => {
    if (!memoFilePath) {
      setMemoEntries([]);
      return;
    }
    setMemoLoading(true);
    try {
      const result = await readMemoFile(memoFilePath);
      setMemoEntries(
        result.exists ? parseMemoFile(result.content).entries : [],
      );
      setMemoError("");
    } catch (error) {
      console.error(error);
      setMemoError("メモファイルを読み込めませんでした。");
    } finally {
      setMemoLoading(false);
    }
  }, [memoFilePath]);

  useEffect(() => {
    void reloadMemo();
  }, [reloadMemo]);

  const postMemo = useCallback(
    async (body: string, postDraft: MemoDraft | null) => {
      if (!memoFilePath || !filePath) {
        throw new Error("memo path is not configured");
      }
      const now = new Date();
      // §8.6: always re-read right before writing so concurrent panels for the
      // same document cannot clobber each other's posts.
      const current = await readMemoFile(memoFilePath);
      const id = uniqueEntryId(current.content, now);
      const block = buildEntryBlock({
        createdAt: now.toISOString(),
        id,
        anchor: postDraft?.anchor || null,
        quotePrefix: postDraft?.quotePrefix ?? "",
        quoteSuffix: postDraft?.quoteSuffix ?? "",
        quote: postDraft?.quote ?? "",
        body,
      });
      if (!current.exists || !current.content.trim()) {
        await writeMemoFileAtomic(
          memoFilePath,
          serializeMemoFile(filePath, [block]),
        );
      } else {
        // §8.1: posting appends; appendEntryBlock's separator shape, applied as
        // a pure suffix so existing bytes stay untouched.
        await appendMemoFile(memoFilePath, `\n\n---\n\n${block}\n`);
      }
      let timelineSyncError = "";
      if (memoSyncTimeline.trim()) {
        try {
          await appendTimelineEntry(
            memoSyncTimeline,
            memoTimelineBody(filePath, fileName, postDraft?.quote || "", body),
          );
        } catch (error) {
          // The memo is already durable. Do not make a sync failure invite a
          // retry that would duplicate the source memo.
          console.warn("Could not sync memo post to Timeline.", error);
          timelineSyncError =
            `メモは保存されましたが、Timelineへの連携に失敗しました: ${
              error instanceof Error ? error.message : String(error)
            }`;
        }
      }
      await reloadMemo();
      if (timelineSyncError) setMemoError(timelineSyncError);
    },
    [fileName, filePath, memoFilePath, memoSyncTimeline, reloadMemo],
  );

  const rewriteMemo = useCallback(
    async (mutate: (content: string) => string | null) => {
      if (!memoFilePath) throw new Error("memo path is not configured");
      const current = await readMemoFile(memoFilePath);
      if (!current.exists) throw new Error("memo file is missing");
      const next = mutate(current.content);
      if (next === null) {
        await reloadMemo();
        throw new Error("entry not found");
      }
      await writeMemoFileAtomic(memoFilePath, next);
      await reloadMemo();
    },
    [memoFilePath, reloadMemo],
  );

  const editMemo = useCallback(
    (id: string, body: string) =>
      rewriteMemo((content) => replaceEntryBody(content, id, body)),
    [rewriteMemo],
  );
  const deleteMemo = useCallback(
    (id: string) => rewriteMemo((content) => deleteEntry(content, id)),
    [rewriteMemo],
  );
  const togglePinMemo = useCallback(
    (id: string, pinned: boolean) =>
      rewriteMemo((content) => setEntryPinned(content, id, pinned)),
    [rewriteMemo],
  );

  const resolveWikiLinkPath = useCallback(
    async (href: string): Promise<string> => {
      const paths = href.startsWith("#wiki")
        ? [
          wikiTargetToPath(
            wikiBaseDirPath,
            decodeURIComponent(href.replace(/^#wiki(embed)?:/, "")),
          ),
        ]
        : localHrefToPathCandidates(wikiBaseDirPath, href);
      for (const path of paths) {
        try {
          const absolute = /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path);
          if (absolute ? await readLocalFile(path) : await readFile(path)) {
            return path;
          }
        } catch {
          // Try the next candidate.
        }
      }
      return paths[0] ?? "";
    },
    [wikiBaseDirPath],
  );

  const resolveMarkdownImageSrc = useCallback(
    async (src: string): Promise<string> => {
      if (!src || /^(?:data:|blob:|https?:|\/\/)/i.test(src)) return src;
      const paths = src.startsWith("#wikiembed:")
        ? [
          wikiTargetToPath(
            wikiBaseDirPath,
            decodeURIComponent(src.slice("#wikiembed:".length)),
          ),
        ]
        : localHrefToPathCandidates(wikiBaseDirPath, src);
      for (const path of paths) {
        try {
          const absolute = /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path);
          const file = absolute
            ? await readLocalFile(path)
            : await readFile(path);
          if (file?.content.startsWith("data:")) return file.content;
        } catch {
          // Try workspace-relative and parent-root candidates in order.
        }
      }
      return src;
    },
    [wikiBaseDirPath],
  );

  const openWikiLink = useCallback(
    (href: string, event: ReactMouseEvent<HTMLElement>) => {
      if (!isLocalDocumentHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      setWikiLinkPopup(null);
      void resolveWikiLinkPath(href).then((path) => {
        if (path) onNavigatePath(path);
      });
    },
    [onNavigatePath, resolveWikiLinkPath],
  );

  const openWikiLinkMenu = useCallback(
    (href: string, event: ReactMouseEvent<HTMLElement>) => {
      if (!isLocalDocumentHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = contentWrapRef.current?.getBoundingClientRect();
      const rawX = rect ? event.clientX - rect.left : event.clientX;
      const rawY = rect ? event.clientY - rect.top : event.clientY;
      const x = rect ? Math.max(4, Math.min(rawX, rect.width - 190)) : rawX;
      const y = rect ? Math.max(4, Math.min(rawY, rect.height - 48)) : rawY;
      void resolveWikiLinkPath(href).then((path) => {
        if (path) setWikiLinkPopup({ x, y, path });
      });
    },
    [resolveWikiLinkPath],
  );

  // ---- anchor resolution & highlights -------------------------------------

  const epubSectionFor = useCallback(
    (doc: Document, spine: number): Element | null => {
      return doc.getElementById(`epub-chapter-${spine + 1}`);
    },
    [],
  );

  const applyHighlights = useCallback(() => {
    if (!memoPanelOpen) {
      resolvedGroupsRef.current = [];
      resolvedByIdRef.current = new Map();
      setMemoHighlights(widget.id, window, []);
      const hiddenFrameWin = frameRef.current?.contentWindow;
      if (hiddenFrameWin) {
        setMemoHighlights(`${widget.id}:frame`, hiddenFrameWin, []);
      } else clearMemoHighlights(`${widget.id}:frame`);
      setUnresolvedIds((previous) => (previous.size ? new Set() : previous));
      return;
    }
    const anchored = memoEntriesRef.current.filter((entry) =>
      entry.parsed && entry.anchor !== null && entry.quote
    );
    const groups = new Map<string, ResolvedGroup>();
    const byId = new Map<string, { range: Range; win: Window }>();
    const unresolved = new Set<string>();
    const indexCache = new Map<Node, TextIndex>();

    const indexFor = (root: Node): TextIndex => {
      let index = indexCache.get(root);
      if (!index) {
        index = buildTextIndex(root);
        indexCache.set(root, index);
      }
      return index;
    };

    const record = (
      entry: MemoEntry,
      root: Node,
      win: Window,
      inFrame: boolean,
      scope: string,
    ) => {
      const match = findQuoteMatch(
        indexFor(root),
        entry.quote,
        entry.quotePrefix,
        entry.quoteSuffix,
      );
      if (!match) {
        unresolved.add(entry.id);
        return;
      }
      const key = `${scope}:${match.start}-${match.end}`;
      const group = groups.get(key);
      if (group) {
        group.entryIds.push(entry.id);
      } else {
        groups.set(key, {
          key,
          range: match.range,
          win,
          inFrame,
          entryIds: [entry.id],
        });
      }
      byId.set(entry.id, { range: match.range, win });
    };

    if (
      kind === "markdown" && markdownMode === "preview" &&
      previewRootRef.current
    ) {
      for (const entry of anchored) {
        record(entry, previewRootRef.current, window, false, "md");
      }
    } else if (
      (kind === "html" || kind === "epub") &&
      frameRef.current?.contentDocument?.body
    ) {
      const doc = frameRef.current.contentDocument;
      const win = frameRef.current.contentWindow;
      if (doc && win) {
        ensureHighlightStyles(doc);
        for (const entry of anchored) {
          const spine = kind === "epub" && entry.anchor
            ? spineFromAnchor(entry.anchor)
            : null;
          const scopeRoot = spine !== null
            ? epubSectionFor(doc, spine) ?? doc.body
            : doc.body;
          record(
            entry,
            scopeRoot,
            win,
            true,
            spine !== null ? `spine-${spine}` : "doc",
          );
        }
      }
    } else if (kind === "pdf" && pdfRef.current) {
      const pdf = pdfRef.current;
      const pageCount = pdf.getPageCount();
      for (const entry of anchored) {
        const page = entry.anchor ? pageFromAnchor(entry.anchor) : null;
        if (page === null || page < 1 || (pageCount > 0 && page > pageCount)) {
          unresolved.add(entry.id);
          continue;
        }
        const layer = pdf.getTextLayer(page);
        // Unrendered pages stay in an unknown state (§8.4: resolution runs
        // against the currently displayed range only).
        if (!layer || !layer.childElementCount) continue;
        record(entry, layer, window, false, `page-${page}`);
      }
    } else if (kind === "text" && textareaRef.current) {
      const haystack = normalizeAnchorText(textareaRef.current.value);
      for (const entry of anchored) {
        if (!haystack.includes(normalizeAnchorText(entry.quote))) {
          unresolved.add(entry.id);
        }
      }
    }

    const groupList = [...groups.values()];
    resolvedGroupsRef.current = groupList;
    resolvedByIdRef.current = byId;

    const mainRanges = groupList.filter((group) => !group.inFrame).map((
      group,
    ) => group.range);
    setMemoHighlights(widget.id, window, mainRanges);
    const frameWin = frameRef.current?.contentWindow;
    if (frameWin) {
      setMemoHighlights(
        `${widget.id}:frame`,
        frameWin,
        groupList.filter((group) => group.inFrame).map((group) => group.range),
      );
    } else {
      // The widget may have switched away from an iframe document.
      clearMemoHighlights(`${widget.id}:frame`);
    }

    setUnresolvedIds((previous) => {
      if (
        previous.size === unresolved.size &&
        [...unresolved].every((id) => previous.has(id))
      ) return previous;
      return unresolved;
    });
  }, [kind, markdownMode, epubSectionFor, widget.id, memoPanelOpen]);

  useEffect(() => () => {
    clearMemoHighlights(widget.id);
    clearMemoHighlights(`${widget.id}:frame`);
  }, [widget.id]);

  useEffect(() => {
    const timer = window.setTimeout(applyHighlights, 150);
    return () => window.clearTimeout(timer);
  }, [
    applyHighlights,
    memoEntries,
    documentContent,
    viewFontScale,
    viewWidthScale,
    frameLoadTick,
    pdfPagesTick,
  ]);

  // ---- pointer interactions (hover popover, highlight click) --------------

  const hostPointFor = useCallback(
    (clientX: number, clientY: number, inFrame: boolean) => {
      const wrapRect = contentWrapRef.current?.getBoundingClientRect();
      if (!wrapRect) return { x: 0, y: 0 };
      if (!inFrame) {
        return { x: clientX - wrapRect.left, y: clientY - wrapRect.top };
      }
      const frameRect = frameRef.current?.getBoundingClientRect();
      return {
        x: clientX + (frameRect?.left ?? 0) - wrapRect.left,
        y: clientY + (frameRect?.top ?? 0) - wrapRect.top,
      };
    },
    [],
  );

  const hitTest = useCallback(
    (
      clientX: number,
      clientY: number,
      inFrame: boolean,
    ): ResolvedGroup | null => {
      for (const group of resolvedGroupsRef.current) {
        if (group.inFrame !== inFrame) continue;
        for (const rect of group.range.getClientRects()) {
          if (
            clientX >= rect.left - 2 && clientX <= rect.right + 2 &&
            clientY >= rect.top - 2 && clientY <= rect.bottom + 2
          ) {
            return group;
          }
        }
      }
      return null;
    },
    [],
  );

  const handlePointerHover = useCallback(
    (clientX: number, clientY: number, inFrame: boolean) => {
      const group = hitTest(clientX, clientY, inFrame);
      if (!group) {
        setHover(null);
        return;
      }
      const entries = memoEntriesRef.current;
      const latestId = latestEntryId(entries, group.entryIds);
      const latest = entries.find((entry) => entry.id === latestId);
      if (!latest) {
        setHover(null);
        return;
      }
      const point = hostPointFor(clientX, clientY, inFrame);
      setHover({
        x: point.x,
        y: point.y + 14,
        count: group.entryIds.length,
        preview: memoHoverPreview(latest),
      });
    },
    [hitTest, hostPointFor],
  );

  const openPanel = useCallback(() => {
    if (!memoPanelVisible) {
      onConfigChange({
        ...widget.config,
        memoPanelOpen: true,
        memoPanelCollapsed: false,
      });
    }
  }, [memoPanelVisible, onConfigChange, widget.config]);

  const handleHighlightClick = useCallback(
    (
      clientX: number,
      clientY: number,
      inFrame: boolean,
      selectionWin: Window,
    ): boolean => {
      const selection = selectionWin.getSelection();
      if (selection && !selection.isCollapsed) return false;
      const group = hitTest(clientX, clientY, inFrame);
      if (!group) return false;
      openPanel();
      flashEntry(latestEntryId(memoEntriesRef.current, group.entryIds));
      return true;
    },
    [flashEntry, hitTest, openPanel],
  );

  // ---- selection → memo draft ----------------------------------------------

  const selectionScopeFor = useCallback(
    (node: Node): { root: Node; anchor: string } | null => {
      if (kind === "markdown") {
        return markdownMode === "preview" && previewRootRef.current
          ? { root: previewRootRef.current, anchor: "text" }
          : null;
      }
      if (kind === "html" || kind === "epub") {
        const doc = frameRef.current?.contentDocument;
        if (!doc?.body) return null;
        if (kind === "epub") {
          // nodeType instead of instanceof: iframe nodes are cross-realm.
          const element = node.nodeType === Node.ELEMENT_NODE
            ? (node as Element)
            : node.parentElement;
          const section = element?.closest("section.epub-chapter");
          const match = section?.id.match(/^epub-chapter-(\d+)$/);
          if (match) {
            return {
              root: section as Element,
              anchor: `spine=${Number(match[1]) - 1}`,
            };
          }
        }
        return { root: doc.body, anchor: "text" };
      }
      if (kind === "pdf") {
        const pageNode = node.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node.parentElement;
        const pageElement = pageNode?.closest<HTMLElement>("[data-pdf-page]");
        const page = pageElement ? Number(pageElement.dataset.pdfPage) : 0;
        if (!page) return null;
        const layer = pdfRef.current?.getTextLayer(page);
        return layer ? { root: layer, anchor: `page=${page}` } : null;
      }
      return null;
    },
    [kind, markdownMode],
  );

  const buildSelectionDraft = useCallback((win: Window): MemoDraft | null => {
    const selection = win.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return null;
    }
    const quote = selection.toString();
    if (!normalizeAnchorText(quote)) return null;
    const range = selection.getRangeAt(0);
    const scope = selectionScopeFor(range.startContainer);
    if (!scope) return null;
    const root = scope.root;
    // NOTE: no `instanceof Node` guard here — iframe (EPUB/HTML) nodes live in
    // another realm, where host-window instanceof checks are always false.
    if (
      !root.contains(range.startContainer) || !root.contains(range.endContainer)
    ) return null;
    const context = selectionContextFor(buildTextIndex(root), quote, range);
    return {
      anchor: scope.anchor,
      quote,
      quotePrefix: context.prefix,
      quoteSuffix: context.suffix,
    };
  }, [selectionScopeFor]);

  // §7.2: right-clicking a selection opens the「メモに追加」context menu.
  // Returns true when our menu is shown (suppressing the native one).
  const handleSelectionContextMenu = useCallback(
    (
      clientX: number,
      clientY: number,
      win: Window,
      inFrame: boolean,
    ): boolean => {
      const selectionDraft = buildSelectionDraft(win);
      if (!selectionDraft) return false;
      const point = hostPointFor(clientX, clientY, inFrame);
      setSelPopup({ x: point.x, y: point.y + 2, draft: selectionDraft });
      return true;
    },
    [buildSelectionDraft, hostPointFor],
  );

  const handleTextareaContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLTextAreaElement>) => {
      const textarea = event.currentTarget;
      const { selectionStart, selectionEnd, value } = textarea;
      if (selectionStart === selectionEnd) return;
      const quote = value.slice(selectionStart, selectionEnd);
      if (!normalizeAnchorText(quote)) return;
      event.preventDefault();
      const point = hostPointFor(event.clientX, event.clientY, false);
      setSelPopup({
        x: point.x,
        y: point.y + 2,
        draft: {
          anchor: "text",
          quote,
          quotePrefix: normalizeAnchorText(
            value.slice(Math.max(0, selectionStart - 40), selectionStart),
          ).slice(-30),
          quoteSuffix: normalizeAnchorText(
            value.slice(selectionEnd, selectionEnd + 40),
          ).slice(0, 30),
        },
      });
    },
    [hostPointFor],
  );

  const reportTextareaSelection = useCallback(
    (textarea: HTMLTextAreaElement) => {
      const { selectionStart, selectionEnd, value } = textarea;
      const text = value.slice(selectionStart, selectionEnd);
      onSelectionChange(
        text
          ? {
            path: selectionPath,
            text,
            start: selectionStart,
            end: selectionEnd,
          }
          : null,
      );
    },
    [onSelectionChange, selectionPath],
  );

  const reportWindowSelection = useCallback(
    (win: Window, root?: Node | null) => {
      const selection = win.getSelection();
      if (!selection || !selection.rangeCount) return;
      if (
        root &&
        (!root.contains(selection.anchorNode) ||
          !root.contains(selection.focusNode))
      ) return;
      if (selection.isCollapsed) {
        onSelectionChange(null);
        return;
      }
      const text = selection.toString();
      onSelectionChange(
        text ? { path: selectionPath, text, start: -1, end: -1 } : null,
      );
    },
    [onSelectionChange, selectionPath],
  );

  useEffect(() => {
    const onSelection = () =>
      reportWindowSelection(window, contentWrapRef.current);
    document.addEventListener("selectionchange", onSelection);
    return () => document.removeEventListener("selectionchange", onSelection);
  }, [reportWindowSelection]);

  const memoConfigured = Boolean(memoDirPath && filePath && hasWailsBackend());
  const selectionActionsAvailable = memoConfigured || aiAvailable;

  useEffect(() => {
    if (!selPopup) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelPopup(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selPopup]);

  const adoptDraft = useCallback(() => {
    if (!selPopup) return;
    setDraft(selPopup.draft);
    setSelPopup(null);
    openPanel();
    window.getSelection()?.removeAllRanges();
    frameRef.current?.contentWindow?.getSelection()?.removeAllRanges();
  }, [openPanel, selPopup]);

  const copySelection = useCallback(async () => {
    if (!selPopup) return;
    try {
      await navigator.clipboard.writeText(selPopup.draft.quote);
    } catch {
      // Clipboard API can be unavailable in non-secure webview contexts;
      // fall back to copying the still-active selection.
      const frameDoc = frameRef.current?.contentDocument;
      const copied = document.execCommand("copy") ||
        frameDoc?.execCommand("copy");
      if (!copied) {
        showToast(tr("memo.copyFailed"));
        setSelPopup(null);
        return;
      }
    }
    setSelPopup(null);
    showToast(tr("memo.copied"));
  }, [selPopup, showToast, tr]);

  // Attach listeners inside the iframe document (EPUB/HTML).
  useEffect(() => {
    if (kind !== "html" && kind !== "epub") return;
    const doc = frameRef.current?.contentDocument;
    const win = frameRef.current?.contentWindow;
    if (!doc || !win) return;

    const onContextMenu = (event: globalThis.MouseEvent) => {
      if (!selectionActionsAvailable) return;
      if (handleSelectionContextMenu(event.clientX, event.clientY, win, true)) {
        event.preventDefault();
      }
    };
    const onMouseMove = (event: globalThis.MouseEvent) =>
      handlePointerHover(event.clientX, event.clientY, true);
    const onClick = (event: globalThis.MouseEvent) => {
      handleHighlightClick(event.clientX, event.clientY, true, win);
    };
    const onMouseDown = () => {
      onActivate();
      setSelPopup(null);
    };
    const onSelection = () => reportWindowSelection(win, doc.body);
    doc.addEventListener("contextmenu", onContextMenu);
    doc.addEventListener("mousemove", onMouseMove);
    doc.addEventListener("click", onClick);
    doc.addEventListener("mousedown", onMouseDown);
    doc.addEventListener("selectionchange", onSelection);
    return () => {
      doc.removeEventListener("contextmenu", onContextMenu);
      doc.removeEventListener("mousemove", onMouseMove);
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("mousedown", onMouseDown);
      doc.removeEventListener("selectionchange", onSelection);
    };
  }, [
    kind,
    frameLoadTick,
    selectionActionsAvailable,
    handleSelectionContextMenu,
    handlePointerHover,
    handleHighlightClick,
    onActivate,
    reportWindowSelection,
  ]);

  // ---- timeline → document jumps (§7.4) ------------------------------------

  const flashRange = useCallback((win: Window, range: Range) => {
    setHighlight(win, "mdwys-memo-flash", [range]);
    window.setTimeout(() => clearHighlight(win, "mdwys-memo-flash"), FLASH_MS);
  }, []);

  const scrollRangeIntoView = useCallback((range: Range) => {
    const node = range.startContainer;
    // nodeType instead of instanceof: iframe nodes are cross-realm.
    const element = node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const jumpToAnchor = useCallback((entry: MemoEntry) => {
    if (!entry.anchor) return;

    if (kind === "pdf") {
      const page = pageFromAnchor(entry.anchor);
      const pdf = pdfRef.current;
      if (
        page === null || !pdf || page < 1 ||
        page > Math.max(1, pdf.getPageCount())
      ) {
        showToast(tr("memo.broken"));
        return;
      }
      pdf.scrollToPage(page);
      let tries = 0;
      const attempt = () => {
        const layer = pdf.getTextLayer(page);
        if (layer && layer.childElementCount) {
          const match = findQuoteMatch(
            buildTextIndex(layer),
            entry.quote,
            entry.quotePrefix,
            entry.quoteSuffix,
          );
          if (match) {
            scrollRangeIntoView(match.range);
            flashRange(window, match.range);
          }
          // Quote missing on the page: §6.1 keeps the page jump, no highlight.
          return;
        }
        if (++tries < 15) window.setTimeout(attempt, 200);
      };
      window.setTimeout(attempt, 250);
      return;
    }

    if (kind === "epub" || kind === "html") {
      const doc = frameRef.current?.contentDocument;
      const win = frameRef.current?.contentWindow;
      if (!doc?.body || !win) {
        showToast(tr("memo.broken"));
        return;
      }
      const spine = kind === "epub" ? spineFromAnchor(entry.anchor) : null;
      const section = spine !== null ? epubSectionFor(doc, spine) : null;
      const root = section ?? doc.body;
      const match = entry.quote
        ? findQuoteMatch(
          buildTextIndex(root),
          entry.quote,
          entry.quotePrefix,
          entry.quoteSuffix,
        )
        : null;
      if (match) {
        scrollRangeIntoView(match.range);
        flashRange(win, match.range);
        return;
      }
      if (section) {
        // §6.2: reflow-safe fallback — jump to the spine section top.
        section.scrollIntoView({ block: "start", behavior: "smooth" });
        return;
      }
      showToast(tr("memo.broken"));
      return;
    }

    if (kind === "markdown") {
      if (markdownMode !== "preview" || !previewRootRef.current) {
        showToast(tr("memo.previewOnly"));
        return;
      }
      const match = findQuoteMatch(
        buildTextIndex(previewRootRef.current),
        entry.quote,
        entry.quotePrefix,
        entry.quoteSuffix,
      );
      if (!match) {
        showToast(tr("memo.broken"));
        return;
      }
      scrollRangeIntoView(match.range);
      flashRange(window, match.range);
      return;
    }

    if (kind === "text" && textareaRef.current) {
      const textarea = textareaRef.current;
      const value = textarea.value;
      let at = value.indexOf(entry.quote);
      if (at === -1) {
        // Whitespace-flexible fallback matching (§6).
        const pattern = normalizeAnchorText(entry.quote)
          .split(" ")
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("\\s+");
        const match = value.match(new RegExp(pattern));
        at = match?.index ?? -1;
      }
      if (at === -1) {
        showToast(tr("memo.broken"));
        return;
      }
      textarea.focus();
      textarea.setSelectionRange(at, at + entry.quote.length);
      const lineHeight =
        Number.parseFloat(getComputedStyle(textarea).lineHeight) || 20;
      const lineNumber = value.slice(0, at).split("\n").length - 1;
      textarea.scrollTop = Math.max(
        0,
        lineNumber * lineHeight - textarea.clientHeight / 2,
      );
      return;
    }

    showToast(tr("memo.broken"));
  }, [
    kind,
    markdownMode,
    epubSectionFor,
    flashRange,
    scrollRangeIntoView,
    showToast,
    tr,
  ]);

  // ---- content rendering ----------------------------------------------------

  const renderContent = () => {
    if (kind === "external") {
      return (
        <div className="binary-download-view">
          <div>
            <FileArchive size={32} />
            <h3>{fileName}</h3>
            <p>このファイル形式はアプリ内でプレビューできません。</p>
            <button
              type="button"
              onClick={() =>
                void openLocalFileDefault(downloadPath).catch((error) =>
                  alert(error instanceof Error ? error.message : String(error))
                )}
              disabled={!filePath}
            >
              <ExternalLink size={16} />外部アプリで開く
            </button>
          </div>
        </div>
      );
    }
    if (kind === "canvas") {
      return (
        <CanvasFileView
          content={documentContent}
          path={filePath || fileName}
          isDark={isDark}
          onChange={(content) =>
            onConfigChange({ ...widget.config, fileName, content })}
          onOpenPath={onOpenPathMaximized}
        />
      );
    }

    if (kind === "base") {
      return (
        <BaseFileView
          content={documentContent}
          path={filePath || fileName}
          isDark={isDark}
          onChange={(content) =>
            onConfigChange({ ...widget.config, fileName, content })}
          onOpenPath={onOpenPath}
        />
      );
    }

    if (kind === "kanban") {
      return (
        <KanbanFileView
          content={documentContent}
          path={filePath || fileName}
          isDark={isDark}
          onChange={(content) =>
            onConfigChange({ ...widget.config, fileName, content })}
          onOpenPath={onOpenPath}
        />
      );
    }

    if (kind === "workflow") {
      return (
        <WorkflowFileView
          content={documentContent}
          isDark={isDark}
          onChange={(content) =>
            onConfigChange({ ...widget.config, fileName, content })}
        />
      );
    }

    if (kind === "html" || kind === "epub") {
      return (
        <HtmlDocumentFrame
          content={documentContent}
          title={fileName}
          fontScale={viewFontScale}
          widthScale={viewWidthScale}
          frameRef={frameRef}
          onFrameLoad={() => setFrameLoadTick((value) => value + 1)}
          emptyLabel={tr("doc.openHtml")}
        />
      );
    }

    if (kind === "image") {
      return documentContent
        ? (
          <ImageViewer src={documentContent} alt={fileName} />
        )
        : <div className="dashboard-empty">{tr("doc.openImage")}</div>;
    }

    if (kind === "pdf") {
      return (
        <PdfViewer
          key={`${selectionPath}:${pdfReloadVersion}`}
          ref={pdfRef}
          content={documentContent}
          title={fileName}
          scalePercent={viewFontScale}
          onTextLayerRendered={() => setPdfPagesTick((value) => value + 1)}
          onLoadError={recoverPdfFromDisk}
        />
      );
    }

    if (kind === "audio" || kind === "video") {
      if (!documentContent) {
        return <div className="dashboard-empty">Open a {kind} file</div>;
      }
      return (
        <div className="dashboard-media-frame">
          {kind === "audio"
            ? <audio src={documentContent} controls />
            : <video src={documentContent} controls />}
        </div>
      );
    }

    if (kind === "text") {
      return (
        <textarea
          ref={textareaRef}
          className="raw-editor widget-raw-editor"
          value={documentContent}
          onChange={(event) =>
            onConfigChange({
              ...widget.config,
              fileName,
              content: event.target.value,
            })}
          onSelect={(event) => reportTextareaSelection(event.currentTarget)}
          onContextMenu={(event) =>
            selectionActionsAvailable && handleTextareaContextMenu(event)}
          spellCheck={false}
          aria-label={tr("doc.openText")}
        />
      );
    }

    // Markdown.
    if (markdownMode === "preview") {
      return (
        <div className="markdown-with-properties">
          {parsedFrontmatter.hasFrontmatter && (
            <FrontmatterEditor
              parsed={parsedFrontmatter}
              readOnly
              onChange={() => undefined}
            />
          )}
          <div
            ref={previewRootRef}
            className="dashboard-scaled-preview"
            style={{
              fontSize: `${viewFontScale}%`,
              ["--view-content-width" as string]: `${
                Math.round(1120 * viewWidthScale / 100)
              }px`,
            }}
          >
            <MarkdownPreview
              content={previewContent}
              isDark={isDark}
              onLinkClick={openWikiLink}
              onLinkContextMenu={openWikiLinkMenu}
              resolveImageSrc={resolveMarkdownImageSrc}
            />
          </div>
        </div>
      );
    }
    if (markdownMode === "wysiwyg") {
      return (
        <div className="markdown-with-properties">
          {widget.config.showProperties !== false &&
            (parsedFrontmatter.hasFrontmatter
              ? (
                <FrontmatterEditor
                  parsed={parsedFrontmatter}
                  onChange={(next) =>
                    onConfigChange({
                      ...widget.config,
                      fileName,
                      content: next,
                      mode: markdownMode,
                    })}
                />
              )
              : (
                <AddFrontmatterButton
                  onClick={() =>
                    onConfigChange({
                      ...widget.config,
                      fileName,
                      content: `---\n---\n${documentContent}`,
                      mode: markdownMode,
                    })}
                />
              ))}
          <WysiwygEditor
            value={markdownBody}
            onImageChange={uploadMarkdownImage}
            onChange={(next) =>
              onConfigChange({
                ...widget.config,
                fileName,
                content: replaceFrontmatterBody(documentContent, next),
                mode: markdownMode,
              })}
          />
        </div>
      );
    }
    return (
      <textarea
        className="raw-editor widget-raw-editor"
        value={documentContent}
        onChange={(event) =>
          onConfigChange({
            ...widget.config,
            fileName,
            content: event.target.value,
            mode: markdownMode,
          })}
        onSelect={(event) => reportTextareaSelection(event.currentTarget)}
        spellCheck={false}
        aria-label="Raw Markdown"
      />
    );
  };

  const interactive = kind === "markdown" || kind === "pdf";

  return (
    <div className="file-widget-body">
      {memoPanelOpen && memoPanelCollapsed && (
        <div className="memo-panel-rail">
          <button
            type="button"
            onClick={() =>
              onConfigChange({ ...widget.config, memoPanelCollapsed: false })}
            title={tr("memo.expand")}
          >
            <ChevronsRight size={14} />
          </button>
        </div>
      )}
      {memoPanelVisible && (
        <MemoTimelinePanel
          entries={memoEntries}
          loading={memoLoading}
          error={memoConfigured ? memoError : tr("memo.needsConfig")}
          isDark={isDark}
          memoDirPath={memoDirPath}
          draft={draft}
          onClearDraft={() => setDraft(null)}
          onPost={postMemo}
          onEdit={editMemo}
          onDelete={deleteMemo}
          onTogglePin={togglePinMemo}
          unresolvedIds={unresolvedIds}
          flashEntryId={flashEntryId}
          onJumpToAnchor={jumpToAnchor}
          onOpenPath={onOpenPath}
          onAskAI={aiAvailable && memoFilePath
            ? () => onAskMemoAI(memoChatDraft(memoFilePath, selectionPath))
            : undefined}
          onCollapse={() =>
            onConfigChange({ ...widget.config, memoPanelCollapsed: true })}
          onClose={() =>
            onConfigChange({ ...widget.config, memoPanelOpen: false })}
        />
      )}
      <div
        ref={contentWrapRef}
        className="file-widget-content"
        onContextMenu={interactive && selectionActionsAvailable
          ? (event) => {
            if (
              handleSelectionContextMenu(
                event.clientX,
                event.clientY,
                window,
                false,
              )
            ) event.preventDefault();
          }
          : undefined}
        onMouseMove={interactive
          ? (event) => handlePointerHover(event.clientX, event.clientY, false)
          : undefined}
        onMouseDown={() => {
          onActivate();
          setSelPopup(null);
          setWikiLinkPopup(null);
        }}
        onClick={interactive
          ? (event) =>
            handleHighlightClick(event.clientX, event.clientY, false, window)
          : undefined}
        onMouseLeave={() => setHover(null)}
      >
        {renderContent()}

        {selPopup && selectionActionsAvailable && (
          <div
            className="memo-context-menu"
            style={{ left: selPopup.x, top: selPopup.y }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void copySelection();
              }}
            >
              <Copy size={13} />
              <span>{tr("memo.copy")}</span>
            </button>
            {memoConfigured && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  adoptDraft();
                }}
              >
                <SquarePen size={13} />
                <span>{tr("memo.addToMemo")}</span>
              </button>
            )}
            {aiAvailable && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!selPopup) return;
                  onAskAI({
                    path: selectionPath,
                    text: selPopup.draft.quote,
                    start: -1,
                    end: -1,
                  });
                  setSelPopup(null);
                }}
              >
                <Bot size={13} />
                <span>AIに質問</span>
              </button>
            )}
          </div>
        )}

        {wikiLinkPopup && (
          <div
            className="memo-context-menu wiki-link-context-menu"
            style={{ left: wikiLinkPopup.x, top: wikiLinkPopup.y }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              type="button"
              onClick={() => {
                onOpenPath(wikiLinkPopup.path);
                setWikiLinkPopup(null);
              }}
            >
              <FilePlus2 size={13} />
              <span>{tr("wiki.openNewWidget")}</span>
            </button>
          </div>
        )}

        {hover && (
          <div
            className="memo-hover-popover"
            style={{ left: hover.x, top: hover.y }}
          >
            {hover.count > 1 && (
              <span className="memo-hover-count">{hover.count}件のメモ</span>
            )}
            <p>{hover.preview}</p>
          </div>
        )}

        {toast && <div className="memo-toast">{toast}</div>}
      </div>
    </div>
  );
}
