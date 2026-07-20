import {
  useEffect,
  useRef,
  useState,
} from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(100);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  useEffect(() => setZoom(100), [src]);
  return (
    <div className="dashboard-image-viewer">
      <div
        className="dashboard-image-controls"
        role="toolbar"
        aria-label="Image zoom"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          title="Zoom out"
          disabled={zoom <= 25}
          onClick={() => setZoom((value) => Math.max(25, value - 25))}
        >
          <ZoomOut size={16} />
        </button>
        <button type="button" title="Reset zoom" onClick={() => setZoom(100)}>
          <RotateCcw size={14} /> {zoom}%
        </button>
        <button
          type="button"
          title="Zoom in"
          disabled={zoom >= 400}
          onClick={() => setZoom((value) => Math.min(400, value + 25))}
        >
          <ZoomIn size={16} />
        </button>
      </div>
      <div
        ref={frameRef}
        className="dashboard-image-frame pannable"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const frame = frameRef.current;
          if (!frame) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          panRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            scrollLeft: frame.scrollLeft,
            scrollTop: frame.scrollTop,
          };
          event.currentTarget.classList.add("panning");
        }}
        onPointerMove={(event) => {
          const pan = panRef.current;
          const frame = frameRef.current;
          if (!pan || !frame || pan.pointerId !== event.pointerId) return;
          frame.scrollLeft = pan.scrollLeft - (event.clientX - pan.x);
          frame.scrollTop = pan.scrollTop - (event.clientY - pan.y);
        }}
        onPointerUp={(event) => {
          if (panRef.current?.pointerId !== event.pointerId) return;
          panRef.current = null;
          event.currentTarget.classList.remove("panning");
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={(event) => {
          panRef.current = null;
          event.currentTarget.classList.remove("panning");
        }}
      >
        <div
          className="dashboard-image-canvas"
          style={{ width: `${zoom}%`, margin: zoom <= 100 ? "auto" : "0" }}
        >
          <img
            className="dashboard-image"
            src={src}
            alt={alt}
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}
