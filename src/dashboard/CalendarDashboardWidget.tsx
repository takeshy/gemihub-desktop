import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { useI18n } from "../i18n/context";
import {
  isLocalDocumentHref,
  localHrefToPathCandidates,
  transformWikiLinks,
  wikiTargetToPath,
} from "../lib/wikiLinks";
import {
  appendCalendarEvent,
  deleteCalendarEvent,
  loadTimelineCalendarPosts,
  localDayKey,
  sanitizeTimelineName,
  type TimelineCalendarPost,
  timelineFolder,
  updateCalendarEvent,
} from "./timelineEvents";
import { KanbanCardModal } from "./KanbanCardModal";
import { fileRef, type FileRef } from "../lib/fileRef";

function sameMonth(date: Date, month: Date): boolean {
  return date.getFullYear() === month.getFullYear() &&
    date.getMonth() === month.getMonth();
}

export function CalendarDashboardWidget({ config, isDark, onOpenFile }: {
  config: Record<string, unknown>;
  isDark: boolean;
  onOpenFile?: (file: FileRef) => void;
}) {
  const { language, t: tr } = useI18n();
  const timelineName = sanitizeTimelineName(
    typeof config.timelineName === "string" ? config.timelineName : "Timeline",
  );
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => localDayKey());
  const [posts, setPosts] = useState<TimelineCalendarPost[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [eventTime, setEventTime] = useState("");
  const [eventText, setEventText] = useState("");
  const [editingEvent, setEditingEvent] = useState<TimelineCalendarPost | null>(
    null,
  );
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previewPath, setPreviewPath] = useState("");
  const copy = {
    today: tr("calendar.today"),
    events: tr("calendar.events"),
    timeline: tr("calendar.timeline"),
    add: tr("calendar.add"),
    empty: tr("calendar.empty"),
    time: tr("calendar.time"),
    content: tr("calendar.content"),
    save: tr("common.save"),
    saving: tr("calendar.saving"),
    cancel: tr("common.cancel"),
    edit: tr("common.edit"),
    delete: tr("common.delete"),
    previous: tr("calendar.previous"),
    next: tr("calendar.next"),
  };

  const load = useCallback(async () => {
    try {
      setPosts(await loadTimelineCalendarPosts(timelineName));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [timelineName]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 200);
    };
    window.addEventListener("llm-hub:file-tree-refresh", refresh);
    window.addEventListener("llm-hub:dashboard-data-changed", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("llm-hub:file-tree-refresh", refresh);
      window.removeEventListener("llm-hub:dashboard-data-changed", refresh);
    };
  }, [load]);
  useEffect(() => {
    if (!detailOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !previewPath) setDetailOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [detailOpen, previewPath]);

  const postDays = useMemo(
    () => new Set(posts.map((post) => localDayKey(new Date(post.createdAt)))),
    [posts],
  );
  const eventDays = useMemo(
    () =>
      new Set(
        posts.filter((post) => post.isEvent).map((post) => post.eventDate),
      ),
    [posts],
  );
  const selectedEvents = posts.filter((post) =>
    post.isEvent && post.eventDate === selected
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedPosts = posts.filter((post) =>
    localDayKey(new Date(post.createdAt)) === selected
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1),
      start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }, [month]);
  const locale = language === "ja" ? "ja-JP" : "en-US";
  const weekdays = Array.from(
    { length: 7 },
    (_, index) =>
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
        new Date(2024, 0, 7 + index),
      ),
  );
  const monthLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
  }).format(month);
  const selectedLabel = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${selected}T00:00:00`));
  const today = localDayKey();
  const handleTimelineLinkClick = useCallback(
    (href: string, event: ReactMouseEvent<HTMLElement>) => {
      if (!isLocalDocumentHref(href)) return;
      event.preventDefault();
      event.stopPropagation();
      const path = href.startsWith("#wiki:")
        ? wikiTargetToPath("", decodeURIComponent(href.slice("#wiki:".length)))
        : localHrefToPathCandidates(timelineFolder(timelineName), href)[0];
      if (path) setPreviewPath(path);
    },
    [timelineName],
  );
  const save = async () => {
    if (!eventText.trim() || saving) return;
    setSaving(true);
    try {
      await appendCalendarEvent(timelineName, selected, eventTime, eventText);
      setEventText("");
      setEventTime("");
      setFormOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };
  const startEditing = (post: TimelineCalendarPost) => {
    setEditingEvent(post);
    setEditDate(post.eventDate);
    setEditTime(post.eventTime);
    setEditText(post.eventContent);
  };
  const saveEditing = async () => {
    if (!editingEvent || !editDate || !editText.trim() || saving) return;
    setSaving(true);
    try {
      if (
        await updateCalendarEvent(
          timelineName,
          editingEvent.id,
          editDate,
          editTime,
          editText,
        )
      ) {
        setEditingEvent(null);
        setSelected(editDate);
        setMonth(new Date(`${editDate}T00:00:00`));
        await load();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };
  const removeEvent = async (post: TimelineCalendarPost) => {
    if (!confirm(`${copy.delete}: ${post.eventContent || post.id}?`)) return;
    setSaving(true);
    try {
      if (await deleteCalendarEvent(timelineName, post.id)) {
        if (editingEvent?.id === post.id) setEditingEvent(null);
        await load();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-calendar-widget">
      <header>
        <span>
          <CalendarDays size={17} />
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
            setSelected(localDayKey(now));
          }}
        >
          {copy.today}
        </button>
      </header>
      <nav>
        <button
          type="button"
          title={copy.previous}
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <ChevronLeft size={17} />
        </button>
        <div>
          <span className="event-dot" />
          {copy.events}
          <span className="post-dot" />Timeline
        </div>
        <button
          type="button"
          title={copy.next}
          onClick={() =>
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRight size={17} />
        </button>
      </nav>
      <div className="calendar-grid">
        {weekdays.map((label, index) => (
          <div className={`weekday day-${index}`} key={`${label}-${index}`}>
            {label}
          </div>
        ))}
        {days.map((day, index) => {
          const key = localDayKey(day);
          return (
            <button
              type="button"
              key={key}
              className={`calendar-day day-${index % 7}${
                sameMonth(day, month) ? "" : " outside"
              }${key === today ? " today" : ""}${
                key === selected ? " selected" : ""
              }`}
              onClick={() => {
                setSelected(key);
                setDetailOpen(true);
                if (!sameMonth(day, month)) {
                  setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
                }
              }}
            >
              <span>{day.getDate()}</span>
              <i>
                {eventDays.has(key) && <b className="event-dot" />}
                {postDays.has(key) && <b className="post-dot" />}
              </i>
            </button>
          );
        })}
      </div>
      {error && <div className="dashboard-widget-error">{error}</div>}
      {detailOpen && (
        <div
          className="calendar-detail-backdrop"
          onMouseDown={() => setDetailOpen(false)}
        >
          <section
            className="calendar-detail"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="close"
              type="button"
              onClick={() => setDetailOpen(false)}
            >
              <X size={18} />
            </button>
            <header>
              <h3>{selectedLabel}</h3>
              <button
                type="button"
                onClick={() => setFormOpen((value) => !value)}
              >
                <Plus size={14} />
                {copy.add}
              </button>
            </header>
            {formOpen && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              >
                <label>
                  {copy.time}
                  <input
                    type="time"
                    value={eventTime}
                    onChange={(event) => setEventTime(event.target.value)}
                  />
                </label>
                <label>
                  {copy.content}
                  <textarea
                    autoFocus
                    value={eventText}
                    onChange={(event) => setEventText(event.target.value)}
                  />
                </label>
                <footer>
                  <button type="button" onClick={() => setFormOpen(false)}>
                    {copy.cancel}
                  </button>
                  <button type="submit" disabled={!eventText.trim() || saving}>
                    {saving ? copy.saving : copy.save}
                  </button>
                </footer>
              </form>
            )}
            {selectedEvents.length === 0 && selectedPosts.length === 0 &&
              !formOpen && <p className="empty">{copy.empty}</p>}
            {selectedEvents.length > 0 && (
              <div className="calendar-detail-group">
                <h4>
                  <Clock3 size={14} />
                  {copy.events}
                </h4>
                {selectedEvents.map((post) => (
                  <article key={post.id}>
                    {editingEvent?.id === post.id
                      ? (
                        <form
                          className="calendar-event-edit-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void saveEditing();
                          }}
                        >
                          <label>
                            Date
                            <input
                              type="date"
                              required
                              value={editDate}
                              onChange={(event) =>
                                setEditDate(event.target.value)}
                            />
                          </label>
                          <label>
                            {copy.time}
                            <input
                              type="time"
                              value={editTime}
                              onChange={(event) =>
                                setEditTime(event.target.value)}
                            />
                          </label>
                          <label>
                            {copy.content}
                            <textarea
                              autoFocus
                              required
                              value={editText}
                              onChange={(event) =>
                                setEditText(event.target.value)}
                            />
                          </label>
                          <footer>
                            <button
                              type="button"
                              onClick={() => setEditingEvent(null)}
                            >
                              {copy.cancel}
                            </button>
                            <button
                              type="submit"
                              disabled={saving || !editDate || !editText.trim()}
                            >
                              {saving ? copy.saving : copy.save}
                            </button>
                          </footer>
                        </form>
                      )
                      : (
                        <>
                          <div className="calendar-event-actions">
                            <span>
                              {post.eventDate}
                              {post.eventTime ? ` ${post.eventTime}` : ""}
                            </span>
                            <button
                              type="button"
                              title={copy.edit}
                              onClick={() => startEditing(post)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              title={copy.delete}
                              disabled={saving}
                              onClick={() => void removeEvent(post)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <MarkdownPreview
                            content={transformWikiLinks(post.eventContent)}
                            isDark={isDark}
                            onLinkClick={handleTimelineLinkClick}
                          />
                        </>
                      )}
                  </article>
                ))}
              </div>
            )}
            {selectedPosts.length > 0 && (
              <div className="calendar-detail-group">
                <h4>
                  <MessageCircle size={14} />
                  {copy.timeline}
                </h4>
                {selectedPosts.map((post) => (
                  <article key={post.id}>
                    <MarkdownPreview
                      content={transformWikiLinks(post.content)}
                      isDark={isDark}
                      onLinkClick={handleTimelineLinkClick}
                    />
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {previewPath && (
        <KanbanCardModal
          file={fileRef("workspace", previewPath)}
          isDark={isDark}
          backdropClassName="calendar-link-preview-backdrop"
          onNavigate={() => {
            const path = previewPath;
            setPreviewPath("");
            onOpenFile?.(fileRef("workspace", path));
          }}
          onSaved={() => void load()}
          onClose={() => setPreviewPath("")}
        />
      )}
    </div>
  );
}
