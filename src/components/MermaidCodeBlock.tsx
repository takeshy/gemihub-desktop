import { useEffect, useRef, useState } from "react";
import { enqueueMermaidRender } from "../lib/mermaidRender";

export function MermaidCodeBlock({ code, isDark }: { code: string; isDark: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";
      try {
        const svg = await enqueueMermaidRender({ chart: code, isDark }, () => cancelled);
        if (!cancelled && svg && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Failed to render diagram");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, isDark]);

  if (error) {
    return (
      <pre className="code-block error-block">
        <code>{code}</code>
      </pre>
    );
  }

  return <div ref={containerRef} className="mermaid-block" />;
}
