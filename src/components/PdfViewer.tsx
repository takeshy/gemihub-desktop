import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useI18n } from "../i18n/context";
import { buildTextIndex, clearHighlight, findTextMatches, findTextMatchStarts, normalizeAnchorText, setHighlight } from "../lib/textAnchor";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfViewerHandle {
  scrollToPage: (page: number) => void;
  getTextLayer: (page: number) => HTMLElement | null;
  getScrollContainer: () => HTMLElement | null;
  getPageCount: () => number;
  getCurrentPage: () => number;
  search: (query: string) => Promise<number[]>;
  showSearchMatch: (query: string, pages: number[], index: number) => Promise<void>;
  clearSearch: () => void;
}

interface PageSlot {
  wrapper: HTMLDivElement;
  canvas: HTMLCanvasElement;
  textLayer: HTMLDivElement;
  renderedScale: number;
  rendering: boolean;
}

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const match = dataUrl.match(/^data:[^;,]*(;base64)?,(.*)$/s);
  if (!match) return null;
  const body = match[1] ? atob(match[2]) : decodeURIComponent(match[2]);
  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i);
  return bytes;
}

// pdf.js based viewer (specs/memo.md §6.1): canvas rendering plus a text
// layer per page so quotes can be selected, searched, and highlighted.
export const PdfViewer = forwardRef<PdfViewerHandle, {
  content: string;
  title: string;
  scalePercent: number;
  onTextLayerRendered?: (page: number, root: HTMLElement) => void;
  onPagesReady?: (root: HTMLElement) => void;
  onCurrentPageChange?: (page: number) => void;
  onLoadError?: () => void;
}>(function PdfViewer({ content, title, scalePercent, onTextLayerRendered, onPagesReady, onCurrentPageChange, onLoadError }, ref) {
  const { t: tr } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef(new Map<number, PageSlot>());
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const generationRef = useRef(0);
  const baseWidthRef = useRef(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const currentPageRef = useRef(1);
  const layoutScaleRef = useRef(0);
  const renderPageRef = useRef<(page: number) => Promise<void>>(async () => undefined);
  const [docVersion, setDocVersion] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState("");

  const onTextLayerRenderedRef = useRef(onTextLayerRendered);
  onTextLayerRenderedRef.current = onTextLayerRendered;
  const onPagesReadyRef = useRef(onPagesReady);
  onPagesReadyRef.current = onPagesReady;
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  onCurrentPageChangeRef.current = onCurrentPageChange;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;
  // Read via a ref so renderPage stays referentially stable: zoom changes
  // must re-render page contents without rebuilding the page placeholders
  // (which would reset the scroll position).
  const scalePercentRef = useRef(scalePercent);
  scalePercentRef.current = scalePercent;

  const effectiveScale = useCallback(() => {
    const container = containerRef.current;
    const baseWidth = baseWidthRef.current;
    if (!container || !baseWidth || container.clientWidth <= 32) return scalePercentRef.current / 100;
    const fitWidth = Math.max(0.25, (container.clientWidth - 32) / baseWidth);
    return fitWidth * (scalePercentRef.current / 100);
  }, []);

  const renderPage = useCallback(async (pageNumber: number) => {
    const doc = docRef.current;
    const slot = pagesRef.current.get(pageNumber);
    if (!doc || !slot || slot.rendering) return;
    const generation = generationRef.current;
    const scale = effectiveScale();
    if (slot.renderedScale === scale) return;
    slot.rendering = true;
    try {
      const page = await doc.getPage(pageNumber);
      if (generation !== generationRef.current) return;
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(3, window.devicePixelRatio || 1);

      slot.wrapper.style.width = `${Math.floor(viewport.width)}px`;
      slot.wrapper.style.height = `${Math.floor(viewport.height)}px`;
      slot.wrapper.style.setProperty("--scale-factor", String(viewport.scale));
      slot.wrapper.style.setProperty("--total-scale-factor", String(viewport.scale));
      slot.canvas.width = Math.floor(viewport.width * dpr);
      slot.canvas.height = Math.floor(viewport.height * dpr);
      slot.canvas.style.width = `${Math.floor(viewport.width)}px`;
      slot.canvas.style.height = `${Math.floor(viewport.height)}px`;

      const context = slot.canvas.getContext("2d");
      if (!context) return;
      await page.render({
        canvas: slot.canvas,
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      }).promise;
      if (generation !== generationRef.current) return;

      slot.textLayer.textContent = "";
      const textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: slot.textLayer,
        viewport,
      });
      await textLayer.render();
      if (generation !== generationRef.current) return;

      slot.renderedScale = scale;
      onTextLayerRenderedRef.current?.(pageNumber, slot.textLayer);
    } catch (renderError) {
      console.warn(`Could not render PDF page ${pageNumber}.`, renderError);
    } finally {
      slot.rendering = false;
      const desiredScale = effectiveScale();
      if (slot.renderedScale > 0 && Math.abs(slot.renderedScale - desiredScale) > 0.001) {
        window.setTimeout(() => void renderPageRef.current(pageNumber), 0);
      }
    }
  }, [effectiveScale]);
  renderPageRef.current = renderPage;

  // Load the document whenever the content changes.
  useEffect(() => {
    const container = containerRef.current;
    generationRef.current += 1;
    const generation = generationRef.current;
    setError("");
    setPageCount(0);
    pagesRef.current.clear();
    layoutScaleRef.current = 0;
    if (container) container.textContent = "";
    docRef.current?.loadingTask.destroy().catch(() => undefined);
    docRef.current = null;
    if (!content || !container) return;

    const bytes = content.startsWith("data:") ? dataUrlToBytes(content) : new TextEncoder().encode(content);
    if (!bytes) {
      setError(tr("pdf.openFailed"));
      return;
    }

    let cancelled = false;
    void (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          // Defer even the first attempt so React Strict Mode can cancel its
          // probe effect before pdf.js creates a loading task. Otherwise the
          // probe can destroy the worker while the real startup load uses it.
          await new Promise((resolve) =>
            window.setTimeout(resolve, attempt > 0 ? 300 : 0)
          );
          if (cancelled || generation !== generationRef.current) return;
          // pdf.js >= 5 removed the eval-based font path entirely
          // (CVE-2024-4367 class of issues), so no isEvalSupported opt-out is
          // needed here.
          // pdf.js transfers this buffer to its worker. Use a fresh copy so a
          // startup retry never receives an already-detached ArrayBuffer.
          const doc = await getDocument({ data: bytes.slice() }).promise;
          if (cancelled || generation !== generationRef.current) {
            doc.loadingTask.destroy().catch(() => undefined);
            return;
          }
          docRef.current = doc;
          const firstPage = await doc.getPage(1);
          if (cancelled || generation !== generationRef.current) return;
          baseWidthRef.current = firstPage.getViewport({ scale: 1 }).width;
          setPageCount(doc.numPages);
          setDocVersion((value) => value + 1);
          return;
        } catch (loadError) {
          lastError = loadError;
        }
      }
      console.error(lastError);
      if (!cancelled) {
        setError(tr("pdf.openFailed"));
        onLoadErrorRef.current?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [content]);

  // Build page placeholders and observe visibility once the document loads.
  useEffect(() => {
    const container = containerRef.current;
    const doc = docRef.current;
    if (!container || !doc || !pageCount) return;

    container.textContent = "";
    pagesRef.current.clear();
    const scale = effectiveScale();
    layoutScaleRef.current = scale;
    const baseWidth = baseWidthRef.current || 600;
    const estimatedHeight = Math.floor(baseWidth * scale * 1.4);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page";
      wrapper.dataset.pdfPage = String(pageNumber);
      wrapper.style.width = `${Math.floor(baseWidth * scale)}px`;
      wrapper.style.height = `${estimatedHeight}px`;
      const canvas = document.createElement("canvas");
      const textLayer = document.createElement("div");
      textLayer.className = "textLayer";
      wrapper.append(canvas, textLayer);
      container.appendChild(wrapper);
      pagesRef.current.set(pageNumber, { wrapper, canvas, textLayer, renderedScale: 0, rendering: false });
    }
    onPagesReadyRef.current?.(container);

    observerRef.current?.disconnect();
    const observer = new IntersectionObserver((observedEntries) => {
      observedEntries.forEach((observed) => {
        if (!observed.isIntersecting) return;
        const pageNumber = Number((observed.target as HTMLElement).dataset.pdfPage);
        if (pageNumber) void renderPage(pageNumber);
      });
    }, { root: container, rootMargin: "100% 0px" });
    pagesRef.current.forEach((slot) => observer.observe(slot.wrapper));
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [docVersion, pageCount, effectiveScale, renderPage]);

  const relayoutPages = useCallback(() => {
    const container = containerRef.current;
    if (!container || !pagesRef.current.size) return;
    const nextScale = effectiveScale();
    const previousScale = layoutScaleRef.current || nextScale;
    if (!Number.isFinite(nextScale) || nextScale <= 0 || Math.abs(previousScale - nextScale) < 0.001) return;

    const top = container.scrollTop + 8;
    let anchorPage = pagesRef.current.get(1) ?? null;
    for (const slot of pagesRef.current.values()) {
      if (slot.wrapper.offsetTop > top) break;
      anchorPage = slot;
    }
    const anchorOffset = anchorPage
      ? Math.max(0, Math.min(1, (top - anchorPage.wrapper.offsetTop) / Math.max(1, anchorPage.wrapper.offsetHeight)))
      : 0;
    const factor = nextScale / previousScale;
    const rerenders: Promise<void>[] = [];
    pagesRef.current.forEach((slot, pageNumber) => {
      const width = Number.parseFloat(slot.wrapper.style.width);
      const height = Number.parseFloat(slot.wrapper.style.height);
      if (Number.isFinite(width)) slot.wrapper.style.width = `${Math.max(1, Math.floor(width * factor))}px`;
      if (Number.isFinite(height)) slot.wrapper.style.height = `${Math.max(1, Math.floor(height * factor))}px`;
      if (slot.renderedScale && Math.abs(slot.renderedScale - nextScale) > 0.001) {
        slot.renderedScale = 0;
        rerenders.push(renderPage(pageNumber));
      }
    });
    layoutScaleRef.current = nextScale;

    const restoreAnchor = () => {
      if (!anchorPage) return;
      container.scrollTop = Math.max(
        0,
        anchorPage.wrapper.offsetTop - 8 + anchorPage.wrapper.offsetHeight * anchorOffset,
      );
    };
    restoreAnchor();
    void Promise.all(rerenders).then(() => window.requestAnimationFrame(restoreAnchor));
  }, [effectiveScale, renderPage]);

  // Keep fit-to-widget width current after the dashboard grid has settled or
  // the widget is resized. The semantic page anchor prevents zoom jumps.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => relayoutPages());
    observer.observe(container);
    return () => observer.disconnect();
  }, [relayoutPages]);

  useEffect(() => {
    relayoutPages();
  }, [scalePercent, docVersion, relayoutPages]);

  const updateCurrentPage = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    let best = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    pagesRef.current.forEach((slot, pageNumber) => {
      const rect = slot.wrapper.getBoundingClientRect();
      const distance = rect.bottom <= containerTop ? Number.POSITIVE_INFINITY : Math.abs(rect.top - containerTop);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = pageNumber;
      }
    });
    if (best !== currentPageRef.current) {
      currentPageRef.current = best;
      setCurrentPage(best);
      onCurrentPageChangeRef.current?.(best);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => updateCurrentPage();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [updateCurrentPage, docVersion]);

  const scrollToPage = useCallback((pageNumber: number) => {
    const slot = pagesRef.current.get(pageNumber);
    const container = containerRef.current;
    if (!slot || !container) return;
    container.scrollTo({ top: slot.wrapper.offsetTop - 8, behavior: "smooth" });
    void renderPage(pageNumber);
  }, [renderPage]);

  const ensurePageRendered = useCallback(async (pageNumber: number) => {
    await renderPage(pageNumber);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const slot = pagesRef.current.get(pageNumber);
      if (slot?.renderedScale && slot.textLayer.childElementCount) return slot;
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    return pagesRef.current.get(pageNumber) ?? null;
  }, [renderPage]);

  const search = useCallback(async (query: string) => {
    const needle = normalizeAnchorText(query);
    if (!needle) return [];
    for (let attempt = 0; attempt < 100 && !docRef.current; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    const doc = docRef.current;
    if (!doc) return [];
    const pages: number[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
      findTextMatchStarts(normalizeAnchorText(text), needle).forEach(() => pages.push(pageNumber));
    }
    return pages;
  }, []);

  const clearSearch = useCallback(() => {
    clearHighlight(window, "mdwys-search");
    clearHighlight(window, "mdwys-search-current");
  }, []);

  const showSearchMatch = useCallback(async (query: string, pages: number[], index: number) => {
    clearSearch();
    const pageNumber = pages[index];
    if (!pageNumber) return;
    scrollToPage(pageNumber);
    const slot = await ensurePageRendered(pageNumber);
    if (!slot) return;
    const ranges = findTextMatches(buildTextIndex(slot.textLayer), query);
    const occurrence = pages.slice(0, index).filter((page) => page === pageNumber).length;
    setHighlight(window, "mdwys-search", ranges);
    const current = ranges[occurrence];
    if (current) {
      setHighlight(window, "mdwys-search-current", [current]);
      current.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [clearSearch, ensurePageRendered, scrollToPage]);

  useImperativeHandle(ref, () => ({
    scrollToPage,
    getTextLayer: (page: number) => pagesRef.current.get(page)?.textLayer ?? null,
    getScrollContainer: () => containerRef.current,
    getPageCount: () => pageCount,
    getCurrentPage: () => currentPageRef.current,
    search,
    showSearchMatch,
    clearSearch,
  }), [clearSearch, scrollToPage, pageCount, search, showSearchMatch]);

  const pageLabel = useMemo(() => (pageCount ? `${currentPage} / ${pageCount}` : ""), [currentPage, pageCount]);

  if (!content) return <div className="dashboard-empty">{tr("pdf.open")}</div>;

  return (
    <div className="pdf-viewer" aria-label={title}>
      {error ? <div className="dashboard-empty">{error}</div> : (
        <>
          <div ref={containerRef} className="pdf-viewer-pages" />
          {pageCount > 0 && (
            <div className="pdf-viewer-toolbar">
              <button
                type="button"
                onClick={() => scrollToPage(Math.max(1, currentPageRef.current - 1))}
                disabled={currentPage <= 1}
                title={tr("pdf.prevPage")}
              >
                <ChevronLeft size={14} />
              </button>
              <span>{pageLabel}</span>
              <button
                type="button"
                onClick={() => scrollToPage(Math.min(pageCount, currentPageRef.current + 1))}
                disabled={currentPage >= pageCount}
                title={tr("pdf.nextPage")}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
});
