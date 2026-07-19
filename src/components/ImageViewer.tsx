import { useEffect, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(100);
  useEffect(() => setZoom(100), [src]);
  return (
    <div className="dashboard-image-viewer">
      <div
        className="dashboard-image-controls"
        role="toolbar"
        aria-label="Image zoom"
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
      <div className="dashboard-image-frame">
        <div className="dashboard-image-canvas" style={{ width: `${zoom}%` }}>
          <img className="dashboard-image" src={src} alt={alt} />
        </div>
      </div>
    </div>
  );
}
