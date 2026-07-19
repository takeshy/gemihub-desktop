import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronsLeft, Code, CornerUpLeft, Link2Off, PenLine, Pencil, Pin, Send, X } from "lucide-react";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { WysiwygEditor } from "../components/WysiwygEditor";
import type { MemoEntry } from "../lib/memoTimeline";
import { useI18n } from "../i18n/context";
import { readLocalFile } from "../lib/wailsBackend";
import { IMAGE_EXT_RE, isLocalDocumentHref, localHrefToPathCandidates, transformWikiLinks, wikiTargetToPath } from "../lib/wikiLinks";

export interface MemoDraft {
  anchor: string;
  quote: string;
  quotePrefix: string;
  quoteSuffix: string;
}

type ComposerMode = "raw" | "wysiwyg";

// Collapse thresholds ported from gemihub's TimelineWidget.
const COLLAPSE_LINE_LIMIT = 8;
const COLLAPSE_CHAR_LIMIT = 520;
const HOVER_PREVIEW_LIMIT = 200;

function shouldCollapse(body: string): boolean {
  const lines = body.split("\n").filter((line) => line.trim());
  return body.length > COLLAPSE_CHAR_LIMIT || lines.length > COLLAPSE_LINE_LIMIT;
}

function collapsedBody(body: string): string {
  const lines = body.split("\n");
  const byLines = lines.length > COLLAPSE_LINE_LIMIT ? lines.slice(0, COLLAPSE_LINE_LIMIT).join("\n") : body;
  const clipped = byLines.length <= COLLAPSE_CHAR_LIMIT ? byLines : byLines.slice(0, COLLAPSE_CHAR_LIMIT);
  return `${clipped.trimEnd()}\n\n...`;
}

export function memoHoverPreview(entry: MemoEntry): string {
  const text = (entry.body || entry.quote).replace(/\s+/g, " ").trim();
  return text.length > HOVER_PREVIEW_LIMIT ? `${text.slice(0, HOVER_PREVIEW_LIMIT)}…` : text;
}

function formatTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt : date.toLocaleString();
}

function anchorLabel(anchor: string): string {
  if (anchor.startsWith("page=")) return `p.${anchor.slice(5)}`;
  if (anchor.startsWith("spine=")) return `§${anchor.slice(6)}`;
  return "text";
}

// §7.5: wiki links resolve against the memo directory. Links become
// `#wiki:` hrefs we intercept; image embeds resolve to data URLs.
function MemoEntryBody({
  body,
  isDark,
  memoDirPath,
  onOpenPath,
}: {
  body: string;
  isDark: boolean;
  memoDirPath: string;
  onOpenPath: (path: string) => void;
}) {
  const transformed = useMemo(() => transformWikiLinks(body), [body]);
  const [resolved, setResolved] = useState(transformed);

  useEffect(() => {
    setResolved(transformed);
    const embeds = [...transformed.matchAll(/!\[[^\]]*\]\(#wikiembed:([^)]+)\)/g)].map((match) => decodeURIComponent(match[1]));
    if (!embeds.length) return;
    let cancelled = false;
    void (async () => {
      let next = transformed;
      for (const target of embeds) {
        const path = wikiTargetToPath(memoDirPath, target);
        const encoded = encodeURIComponent(target);
        if (path && IMAGE_EXT_RE.test(path)) {
          try {
            const file = await readLocalFile(path);
            if (file?.content.startsWith("data:")) {
              next = next.replaceAll(`(#wikiembed:${encoded})`, `(${file.content})`);
              continue;
            }
          } catch {
            // Missing embed target: degrade to a wiki link below.
          }
        }
        next = next.replaceAll(`![${target}](#wikiembed:${encoded})`, `[${target}](#wiki:${encoded})`);
      }
      if (!cancelled) setResolved(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [transformed, memoDirPath]);

  const handleLinkClick = useCallback((href: string, event: React.MouseEvent<HTMLElement>) => {
    if (!isLocalDocumentHref(href)) return;
    event.preventDefault();
    event.stopPropagation();
    void (async () => {
      const paths = href.startsWith("#wiki")
        ? [wikiTargetToPath(memoDirPath, decodeURIComponent(href.replace(/^#wiki(embed)?:/, "")))]
        : localHrefToPathCandidates(memoDirPath, href);
      for (const path of paths) {
        try {
          const file = await readLocalFile(path);
          if (file) {
            onOpenPath(path);
            return;
          }
        } catch {
          // Try the next candidate.
        }
      }
      if (paths[0]) onOpenPath(paths[0]);
    })();
  }, [memoDirPath, onOpenPath]);

  return (
    <div className="memo-entry-body">
      <MarkdownPreview content={resolved} isDark={isDark} onLinkClick={handleLinkClick} />
    </div>
  );
}

function MemoEntryView({
  entry,
  isDark,
  memoDirPath,
  unresolved,
  flashing,
  onJumpToAnchor,
  onEdit,
  onDelete,
  onTogglePin,
  onOpenPath,
}: {
  entry: MemoEntry;
  isDark: boolean;
  memoDirPath: string;
  unresolved: boolean;
  flashing: boolean;
  onJumpToAnchor: (entry: MemoEntry) => void;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => Promise<void>;
  onOpenPath: (path: string) => void;
}) {
  const { t: tr } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.body);
  const [busy, setBusy] = useState(false);
  const collapsible = shouldCollapse(entry.body);
  const bodyToRender = collapsible && !expanded ? collapsedBody(entry.body) : entry.body;

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.error(error);
      alert(tr("memo.updateFailed"));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <article className={`memo-entry ${flashing ? "memo-entry-flash" : ""}`} data-memo-entry-id={entry.id}>
      <header className="memo-entry-header">
        <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time>
        {entry.pinned && <Pin size={12} className="memo-entry-pinned" />}
        <div className="memo-entry-actions">
          {entry.parsed && (
            <>
              <button
                type="button"
                title={entry.pinned ? tr("memo.unpin") : tr("memo.pin")}
                disabled={busy}
                onClick={() => void run(() => onTogglePin(entry.id, !entry.pinned))}
              >
                <Pin size={13} />
              </button>
              <button
                type="button"
                title={tr("memo.edit")}
                disabled={busy}
                onClick={() => {
                  setEditValue(entry.body);
                  setEditing(true);
                }}
              >
                <Pencil size={13} />
              </button>
            </>
          )}
          <button
            type="button"
            title={tr("memo.delete")}
            disabled={busy}
            onClick={() => {
              if (confirm(tr("memo.deleteConfirm"))) void run(() => onDelete(entry.id));
            }}
          >
            <X size={13} />
          </button>
        </div>
      </header>

      {entry.quote && (
        <button
          type="button"
          className={`memo-entry-quote ${unresolved ? "unresolved" : ""}`}
          onClick={() => onJumpToAnchor(entry)}
          title={unresolved ? tr("memo.broken") : tr("memo.jump")}
        >
          {unresolved ? <Link2Off size={13} /> : <CornerUpLeft size={13} />}
          {entry.anchor && <span className="memo-entry-anchor">{anchorLabel(entry.anchor)}</span>}
          <blockquote>{entry.quote}</blockquote>
        </button>
      )}

      {editing ? (
        <div className="memo-entry-edit">
          <textarea
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            rows={Math.min(12, Math.max(3, editValue.split("\n").length + 1))}
            disabled={busy}
          />
          <div className="memo-entry-edit-actions">
            <button type="button" onClick={() => setEditing(false)} disabled={busy}>
              <X size={13} />
              <span>{tr("common.cancel")}</span>
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void run(async () => {
                await onEdit(entry.id, editValue);
                setEditing(false);
              })}
            >
              <Check size={13} />
              <span>{tr("common.save")}</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {bodyToRender && (
            <MemoEntryBody body={bodyToRender} isDark={isDark} memoDirPath={memoDirPath} onOpenPath={onOpenPath} />
          )}
          {collapsible && (
            <button type="button" className="memo-entry-toggle" onClick={() => setExpanded((value) => !value)}>
              {expanded ? tr("memo.showLess") : tr("memo.showMore")}
            </button>
          )}
        </>
      )}
    </article>
  );
}

export function MemoTimelinePanel({
  entries,
  loading,
  error,
  isDark,
  memoDirPath,
  draft,
  onClearDraft,
  onPost,
  onEdit,
  onDelete,
  onTogglePin,
  unresolvedIds,
  flashEntryId,
  onJumpToAnchor,
  onOpenPath,
  onAskAI,
  onCollapse,
  onClose,
}: {
  entries: MemoEntry[];
  loading: boolean;
  error: string;
  isDark: boolean;
  memoDirPath: string;
  draft: MemoDraft | null;
  onClearDraft: () => void;
  onPost: (body: string, draft: MemoDraft | null) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string, pinned: boolean) => Promise<void>;
  unresolvedIds: ReadonlySet<string>;
  flashEntryId: string | null;
  onJumpToAnchor: (entry: MemoEntry) => void;
  onOpenPath: (path: string) => void;
  onAskAI?: () => void;
  onCollapse: () => void;
  onClose: () => void;
}) {
  const { t: tr } = useI18n();
  const [composerMode, setComposerMode] = useState<ComposerMode>("raw");
  const [composerValue, setComposerValue] = useState("");
  const [posting, setPosting] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  // §7.1: oldest first, same order as the file; the latest entry sits next
  // to the composer at the bottom.
  const displayEntries = entries;

  // Keep the latest entry in view when entries grow (e.g. after posting).
  const lastEntryKey = displayEntries.length ? `${displayEntries[displayEntries.length - 1].id}` : "";
  useEffect(() => {
    if (lastEntryKey) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lastEntryKey]);

  // §7.3: highlight click scrolls the timeline to the entry and flashes it.
  useEffect(() => {
    if (!flashEntryId) return;
    const node = listRef.current?.querySelector(`[data-memo-entry-id="${CSS.escape(flashEntryId)}"]`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flashEntryId]);

  // §7.2: a new anchored draft focuses the composer.
  useEffect(() => {
    if (draft) composerRef.current?.focus();
  }, [draft]);

  const submit = useCallback(async () => {
    const body = composerValue.trim();
    if (!body && !draft) return;
    setPosting(true);
    try {
      await onPost(body, draft);
      setComposerValue("");
      onClearDraft();
    } catch (postError) {
      console.error(postError);
      alert(tr("memo.postFailed"));
    } finally {
      setPosting(false);
    }
  }, [composerValue, draft, onClearDraft, onPost]);

  return (
    <aside className="memo-panel">
      <header className="memo-panel-header">
        <strong>{tr("memo.panelTitle")}</strong>
        <div className="memo-panel-header-actions">
          {onAskAI && (
            <button type="button" className="widget-icon-button" onClick={onAskAI} title="メモ全体についてAIに質問">
              <Bot size={14} />
            </button>
          )}
          <button type="button" className="widget-icon-button" onClick={onCollapse} title={tr("memo.collapse")}>
            <ChevronsLeft size={14} />
          </button>
          <button type="button" className="widget-icon-button" onClick={onClose} title={tr("memo.closePanel")}>
            <X size={14} />
          </button>
        </div>
      </header>

      <div ref={listRef} className="memo-panel-list">
        {error && <div className="memo-panel-error">{error}</div>}
        {!error && loading && <div className="memo-panel-empty">{tr("common.loading")}</div>}
        {!error && !loading && displayEntries.length === 0 && (
          <div className="memo-panel-empty">{tr("memo.empty")}</div>
        )}
        {displayEntries.map((entry) => (
          <MemoEntryView
            key={`${entry.id}-${entry.index}`}
            entry={entry}
            isDark={isDark}
            memoDirPath={memoDirPath}
            unresolved={unresolvedIds.has(entry.id)}
            flashing={flashEntryId === entry.id}
            onJumpToAnchor={onJumpToAnchor}
            onEdit={onEdit}
            onDelete={onDelete}
            onTogglePin={onTogglePin}
            onOpenPath={onOpenPath}
          />
        ))}
      </div>

      <footer className="memo-panel-composer">
        {draft && (
          <div className="memo-draft">
            <span className="memo-entry-anchor">{anchorLabel(draft.anchor)}</span>
            <blockquote>{draft.quote}</blockquote>
            <button type="button" onClick={onClearDraft} title={tr("memo.discardQuote")}>
              <X size={13} />
            </button>
          </div>
        )}
        <div className="memo-composer-input">
          {composerMode === "wysiwyg" ? (
            <WysiwygEditor value={composerValue} onChange={setComposerValue} />
          ) : (
            <textarea
              ref={composerRef}
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={tr("memo.composerPlaceholder")}
              rows={3}
              disabled={posting}
            />
          )}
        </div>
        <div className="memo-composer-actions">
          <button
            type="button"
            className="widget-icon-button"
            onClick={() => setComposerMode((mode) => (mode === "raw" ? "wysiwyg" : "raw"))}
            title={composerMode === "raw" ? "WYSIWYG" : "Raw"}
          >
            {composerMode === "raw" ? <PenLine size={14} /> : <Code size={14} />}
          </button>
          <button
            type="button"
            className="memo-post-button"
            onClick={() => void submit()}
            disabled={posting || (!composerValue.trim() && !draft)}
          >
            <Send size={14} />
            <span>{tr("memo.post")}</span>
          </button>
        </div>
      </footer>
    </aside>
  );
}
