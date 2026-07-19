import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MessageCircle, Plus, X } from "lucide-react";
import { MarkdownPreview } from "../components/MarkdownPreview";
import {
  appendCalendarEvent,
  loadTimelineCalendarPosts,
  localDayKey,
  moveCalendarEvent,
  sanitizeTimelineName,
  type TimelineCalendarPost,
} from "./timelineEvents";

function sameMonth(date: Date, month: Date): boolean {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

function labels() {
  const ja = document.documentElement.lang.toLowerCase().startsWith("ja");
  return ja ? {
    today: "今日", events: "予定", timeline: "Timeline", add: "予定を追加",
    empty: "この日の項目はありません。", time: "時刻（任意）", content: "内容", save: "保存", saving: "保存中…", cancel: "キャンセル",
    previous: "前の月", next: "次の月", changed: "予定の日付を変更しました。",
  } : {
    today: "Today", events: "Events", timeline: "Timeline", add: "Add event",
    empty: "Nothing on this day.", time: "Time (optional)", content: "Content", save: "Save", saving: "Saving…", cancel: "Cancel",
    previous: "Previous month", next: "Next month", changed: "Event date changed.",
  };
}

export function CalendarDashboardWidget({ config, isDark }: {
  config: Record<string, unknown>;
  isDark: boolean;
}) {
  const timelineName = sanitizeTimelineName(typeof config.timelineName === "string" ? config.timelineName : "Timeline");
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [selected, setSelected] = useState(() => localDayKey());
  const [posts, setPosts] = useState<TimelineCalendarPost[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [eventTime, setEventTime] = useState("");
  const [eventText, setEventText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const copy = labels();

  const load = useCallback(async () => {
    try {
      setPosts(await loadTimelineCalendarPosts(timelineName));
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  }, [timelineName]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let timer = 0;
    const refresh = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 200); };
    window.addEventListener("llm-hub:file-tree-refresh", refresh);
    window.addEventListener("llm-hub:dashboard-data-changed", refresh);
    return () => { window.clearTimeout(timer); window.removeEventListener("llm-hub:file-tree-refresh", refresh); window.removeEventListener("llm-hub:dashboard-data-changed", refresh); };
  }, [load]);
  useEffect(() => {
    if (!detailOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDetailOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [detailOpen]);

  const postDays = useMemo(() => new Set(posts.map((post) => localDayKey(new Date(post.createdAt)))), [posts]);
  const eventDays = useMemo(() => new Set(posts.filter((post) => post.isEvent).map((post) => post.eventDate)), [posts]);
  const selectedEvents = posts.filter((post) => post.isEvent && post.eventDate === selected).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedPosts = posts.filter((post) => !post.isEvent && localDayKey(new Date(post.createdAt)) === selected).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1), start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);
  const locale = document.documentElement.lang || navigator.language;
  const weekdays = Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 7 + index)));
  const monthLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(month);
  const selectedLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${selected}T00:00:00`));
  const today = localDayKey();
  const save = async () => {
    if (!eventText.trim() || saving) return;
    setSaving(true);
    try { await appendCalendarEvent(timelineName, selected, eventTime, eventText); setEventText(""); setEventTime(""); setFormOpen(false); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setSaving(false); }
  };

  return <div className="dashboard-calendar-widget">
    <header><span><CalendarDays size={17} />{monthLabel}</span><button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelected(localDayKey(now)); }}>{copy.today}</button></header>
    <nav><button type="button" title={copy.previous} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={17} /></button><div><span className="event-dot" />{copy.events}<span className="post-dot" />Timeline</div><button type="button" title={copy.next} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={17} /></button></nav>
    <div className="calendar-grid">
      {weekdays.map((label, index) => <div className={`weekday day-${index}`} key={`${label}-${index}`}>{label}</div>)}
      {days.map((day, index) => { const key = localDayKey(day); return <button type="button" key={key} className={`calendar-day day-${index % 7}${sameMonth(day, month) ? "" : " outside"}${key === today ? " today" : ""}${key === selected ? " selected" : ""}`} onClick={() => { setSelected(key); setDetailOpen(true); if (!sameMonth(day, month)) setMonth(new Date(day.getFullYear(), day.getMonth(), 1)); }}><span>{day.getDate()}</span><i>{eventDays.has(key) && <b className="event-dot" />}{postDays.has(key) && <b className="post-dot" />}</i></button>; })}
    </div>
    {error && <div className="dashboard-widget-error">{error}</div>}
    {detailOpen && <div className="calendar-detail-backdrop" onMouseDown={() => setDetailOpen(false)}><section className="calendar-detail" onMouseDown={(event) => event.stopPropagation()}><button className="close" type="button" onClick={() => setDetailOpen(false)}><X size={18} /></button><header><h3>{selectedLabel}</h3><button type="button" onClick={() => setFormOpen((value) => !value)}><Plus size={14} />{copy.add}</button></header>
      {formOpen && <form onSubmit={(event) => { event.preventDefault(); void save(); }}><label>{copy.time}<input type="time" value={eventTime} onChange={(event) => setEventTime(event.target.value)} /></label><label>{copy.content}<textarea autoFocus value={eventText} onChange={(event) => setEventText(event.target.value)} /></label><footer><button type="button" onClick={() => setFormOpen(false)}>{copy.cancel}</button><button type="submit" disabled={!eventText.trim() || saving}>{saving ? copy.saving : copy.save}</button></footer></form>}
      {selectedEvents.length === 0 && selectedPosts.length === 0 && !formOpen && <p className="empty">{copy.empty}</p>}
      {selectedEvents.length > 0 && <div className="calendar-detail-group"><h4><Clock3 size={14} />{copy.events}</h4>{selectedEvents.map((post) => <article key={post.id}><input type="date" value={post.eventDate} onChange={async (event) => { if (await moveCalendarEvent(timelineName, post.id, event.target.value)) { await load(); setSelected(event.target.value); } }} /><MarkdownPreview content={post.content} isDark={isDark} /></article>)}</div>}
      {selectedPosts.length > 0 && <div className="calendar-detail-group"><h4><MessageCircle size={14} />{copy.timeline}</h4>{selectedPosts.map((post) => <article key={post.id}><MarkdownPreview content={post.content} isDark={isDark} /></article>)}</div>}
    </section></div>}
  </div>;
}
