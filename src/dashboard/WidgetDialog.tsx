import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function WidgetDialog(
  { title, onClose, children, className = "" }: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    className?: string;
  },
) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<
    | { pointerId: number; x: number; y: number; baseX: number; baseY: number }
    | null
  >(null);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      baseX: position.x,
      baseY: position.y,
    };
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition({
      x: Math.max(
        -window.innerWidth / 2 + 48,
        Math.min(
          window.innerWidth / 2 - 48,
          drag.baseX + event.clientX - drag.x,
        ),
      ),
      y: Math.max(
        -window.innerHeight / 2 + 32,
        Math.min(
          window.innerHeight / 2 - 32,
          drag.baseY + event.clientY - drag.y,
        ),
      ),
    });
  };
  const stopDrag = (event: PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  return createPortal(
    <div
      className="widget-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`widget-dialog ${className}`}
        style={{
          transform:
            `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
        }}
      >
        <header
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <strong>{title}</strong>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </header>
        <div className="widget-dialog-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
