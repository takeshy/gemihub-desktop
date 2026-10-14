import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Image as ImageIcon, Loader2, Send, Type } from "lucide-react";
import {
  blueskyContent,
  blueskyImageCaption,
  blueskyPrefersImage,
  buildBlueskyPosts,
  type BlueskyAdapter,
  type BlueskyConnection,
  type BlueskyEntry,
  type BlueskyImage,
  type BlueskyImageRef,
} from "../lib/bluesky";
import { renderBlueskySnapshot } from "./blueskySnapshot";

type Snapshot = { state: "pending" } | { state: "done"; images: BlueskyImage[] } | { state: "failed" };
type Attachment = { state: "pending" } | { state: "done"; image: BlueskyImage } | { state: "failed"; message: string };

const imageKey = (ref: BlueskyImageRef) => JSON.stringify([ref.candidates, ref.alt]);
const imageStyle = { maxWidth: "100%", maxHeight: 240, display: "block", marginTop: 8 } as const;

/**
 * Pick posts of one conversation and publish them, each as text or as a
 * picture of how it looks in the Timeline. What is shown is what is sent.
 */
export function BlueskyDialog({ entries, initialId, adapter, renderMarkdown, onClose, language = "en" }: {
  entries: BlueskyEntry[];
  initialId: string;
  adapter: BlueskyAdapter;
  /** The post as the Timeline renders it, used for picture posts. */
  renderMarkdown: (entry: BlueskyEntry) => ReactNode;
  onClose: () => void;
  language?: string;
}) {
  const ja = language === "ja";
  const dialogRef = useRef<HTMLElement>(null);
  const [connection, setConnection] = useState<BlueskyConnection | null>(null);
  const [selected, setSelected] = useState(() => new Set(entries.some(entry => entry.id === initialId) ? [initialId] : []));
  const [asImage, setAsImage] = useState(() => new Set(entries.filter(entry => blueskyPrefersImage(entry.content)).map(entry => entry.id)));
  const [snapshots, setSnapshots] = useState(() => new Map<string, Snapshot>());
  const [attachments, setAttachments] = useState(() => new Map<string, Attachment>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  // One render and one image read per item for the dialog's lifetime, so a
  // retried publish sends exactly the same pictures (and record keys).
  const renders = useRef(new Map<string, Promise<BlueskyImage[] | null>>());
  const reads = useRef(new Map<string, Promise<BlueskyImage>>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    adapter.status().then(value => { if (active) setConnection(value); })
      .catch(() => { if (active) setConnection({ connected: false }); });
    return () => { active = false; };
  }, [adapter]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { previous?.focus(); };
  }, []);

  const loadImage = (ref: BlueskyImageRef): Promise<BlueskyImage> => {
    const key = imageKey(ref);
    const existing = reads.current.get(key);
    if (existing) return existing;
    setAttachments(prev => new Map(prev).set(key, { state: "pending" }));
    const read = adapter.image(ref.candidates, ref.alt).then(
      image => { setAttachments(prev => new Map(prev).set(key, { state: "done", image })); return image; },
      caught => {
        setAttachments(prev => new Map(prev).set(key, { state: "failed", message: caught instanceof Error ? caught.message : String(caught) }));
        reads.current.delete(key);
        throw caught;
      },
    );
    reads.current.set(key, read);
    return read;
  };

  /** The entry's pictures, or null when it cannot be drawn and goes out as text. Renders run one at a time. */
  const snapshotFor = (entry: BlueskyEntry): Promise<BlueskyImage[] | null> => {
    const existing = renders.current.get(entry.id);
    if (existing) return existing;
    setSnapshots(prev => new Map(prev).set(entry.id, { state: "pending" }));
    const render = queue.current.then(() => renderBlueskySnapshot(renderMarkdown(entry))).then(
      images => { setSnapshots(prev => new Map(prev).set(entry.id, { state: "done", images })); return images; },
      caught => {
        console.warn("Bluesky image rendering failed", caught);
        setSnapshots(prev => new Map(prev).set(entry.id, { state: "failed" }));
        return null;
      },
    );
    queue.current = render;
    renders.current.set(entry.id, render);
    return render;
  };

  useEffect(() => {
    for (const entry of entries) {
      if (!selected.has(entry.id)) continue;
      if (asImage.has(entry.id)) void snapshotFor(entry);
      if (!asImage.has(entry.id) || snapshots.get(entry.id)?.state === "failed") {
        for (const ref of blueskyContent(entry.content, entry.sourcePath).images.slice(0, 4)) void loadImage(ref).catch(() => {});
      }
    }
  }, [entries, selected, asImage, snapshots]);

  const toggle = (setter: typeof setSelected, id: string, on: boolean) => setter(prev => {
    const next = new Set(prev);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  const rendering = [...selected].some(id => asImage.has(id) && snapshots.get(id)?.state === "pending");
  const connected = !!connection?.connected && !!connection.did;
  const locked = busy || urls.length > 0;

  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      if (!connection?.connected || !connection.did) throw new Error(ja ? "Blueskyが接続されていません" : "Bluesky is not connected");
      const posts = await buildBlueskyPosts(entries, selected, ref => loadImage(ref), { ids: asImage, render: snapshotFor });
      setUrls((await adapter.publish(posts, connection.did)).urls);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(<div role="presentation" style={{ position: "fixed", inset: 0, zIndex: 10000, background: "#0009", display: "grid", placeItems: "center", padding: 16 }}>
    <section ref={dialogRef} tabIndex={-1} onKeyDown={event => {
      if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); }
      if (event.key === "Tab") {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]') || []);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }} role="dialog" aria-modal="true" aria-label={ja ? "Blueskyへ投稿" : "Post to Bluesky"} style={{ background: "Canvas", color: "CanvasText", width: "min(640px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 24, borderRadius: 12 }}>
      <h2>{ja ? "Blueskyへ投稿" : "Post to Bluesky"}</h2>
      <p>{ja ? "選択した投稿を接続したBlueskyアカウントで公開します。返信はスレッドとして繋がります。" : "Publish the selected posts publicly with your connected Bluesky account. Replies stay connected as a thread."}</p>
      {connection && (connected
        ? <p>{ja ? `${connection.handle || connection.did} として接続済み` : `Connected as ${connection.handle || connection.did}`}</p>
        : <p role="alert">{ja ? "Blueskyが接続されていません。設定のBlueskyで接続してください。" : "Bluesky is not connected. Connect an account in Settings > Bluesky."}</p>)}
      {entries.map(entry => {
        const chosen = selected.has(entry.id);
        const image = chosen && asImage.has(entry.id);
        const snapshot = snapshots.get(entry.id);
        const content = blueskyContent(entry.content, entry.sourcePath);
        const textBody = <>
          {content.text && <div>{content.text}</div>}
          {content.images.map(ref => {
            const attachment = attachments.get(imageKey(ref));
            if (attachment?.state === "done") return <img key={imageKey(ref)} src={`data:${attachment.image.mime};base64,${attachment.image.data}`} alt={ref.alt} style={imageStyle} />;
            if (attachment?.state === "failed") return <small key={imageKey(ref)} role="alert" style={{ display: "block" }}>{attachment.message}</small>;
            return null;
          })}
        </>;
        return <div key={entry.id} style={{ margin: "16px 0", padding: 12, border: "1px solid GrayText", borderRadius: 8, opacity: chosen ? 1 : 0.6 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
            <label>
              <input type="checkbox" checked={chosen} disabled={locked} onChange={event => toggle(setSelected, entry.id, event.target.checked)} />{" "}
              <strong>{entry.authorName || entry.speaker}</strong>
            </label>
            {chosen && <span role="group" aria-label={ja ? "投稿形式" : "Post format"} style={{ display: "flex", gap: 4 }}>
              {([false, true] as const).map(value => <button
                key={String(value)}
                type="button"
                className={asImage.has(entry.id) === value ? "active" : ""}
                aria-pressed={asImage.has(entry.id) === value}
                disabled={locked}
                title={value ? (ja ? "Timelineでの見た目のまま画像で投稿します。リンクは本文に残ります" : "Publish the post as it looks in the Timeline; links stay in the text") : undefined}
                onClick={() => toggle(setAsImage, entry.id, value)}
              >
                {value ? <ImageIcon size={12} /> : <Type size={12} />} {value ? (ja ? "画像" : "Image") : (ja ? "テキスト" : "Text")}
              </button>)}
            </span>}
          </div>
          <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 8 }}>
            {!image ? textBody
              : !snapshot || snapshot.state === "pending"
              ? <small><Loader2 size={12} className="spin" /> {ja ? "画像にしています…" : "Drawing as an image…"}</small>
              : snapshot.state === "failed"
              ? <><small role="alert" style={{ display: "block" }}>{ja ? "画像にできなかったため、テキストで投稿します。" : "Could not draw this post as an image, so it will be published as text."}</small>{textBody}</>
              : <>
                {blueskyImageCaption(entry.content, entry.sourcePath) && <div>{blueskyImageCaption(entry.content, entry.sourcePath)}</div>}
                {snapshot.images.map((page, index) => <img key={index} src={`data:${page.mime};base64,${page.data}`} alt={page.alt} style={{ ...imageStyle, maxHeight: "none", border: "1px solid GrayText" }} />)}
              </>}
          </div>
        </div>;
      })}
      {error && <p role="alert">{error}</p>}
      {urls.length > 0 && <p role="status">{ja ? "投稿しました" : "Published"} <a href={urls[0]} target="_blank" rel="noreferrer">{ja ? "Blueskyで開く" : "Open in Bluesky"} <ExternalLink size={11} /></a></p>}
      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" disabled={busy} onClick={onClose}>{ja ? "閉じる" : "Close"}</button>
        {urls.length === 0 && <button type="button" className="primary" disabled={busy || rendering || !connected || selected.size === 0} onClick={() => void publish()}>
          {busy || rendering ? <Loader2 size={13} className="spin" /> : <Send size={13} />} {busy ? (ja ? "公開中…" : "Publishing…") : (ja ? "選択した内容を公開" : "Publish selected posts")}
        </button>}
      </div>
    </section>
  </div>, document.body);
}

