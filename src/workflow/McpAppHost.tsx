import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";

export interface WorkflowMcpApp {
  title: string;
  html: string;
  toolResult: Record<string, unknown>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  close?: () => Promise<void>;
}

interface McpAppRequest {
  app: WorkflowMcpApp;
  resolve: () => void;
}

export function showWorkflowMcpApp(app: WorkflowMcpApp): Promise<void> {
  return new Promise((resolve) => window.dispatchEvent(new CustomEvent<McpAppRequest>("llm-hub:workflow-mcp-app", { detail: { app, resolve } })));
}

export function WorkflowMcpAppHost() {
  const [queue, setQueue] = useState<McpAppRequest[]>([]);
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const current = queue[0];

  useEffect(() => {
    const receive = (event: Event) => setQueue((items) => [...items, (event as CustomEvent<McpAppRequest>).detail]);
    window.addEventListener("llm-hub:workflow-mcp-app", receive);
    return () => window.removeEventListener("llm-hub:workflow-mcp-app", receive);
  }, []);

  useEffect(() => {
    if (!current) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data as { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> };
      if (message.jsonrpc !== "2.0" || message.id === undefined) return;
      const respond = (payload: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage({ jsonrpc: "2.0", id: message.id, ...payload }, "*");
      if (message.method === "tools/call") {
        const name = typeof message.params?.name === "string" ? message.params.name : "";
        const args = message.params?.arguments && typeof message.params.arguments === "object" ? message.params.arguments as Record<string, unknown> : {};
        if (!name) { respond({ error: { code: -32602, message: "Missing tool name" } }); return; }
        void current.app.callTool(name, args).then((result) => respond({ result })).catch((error) => respond({ error: { code: -32603, message: error instanceof Error ? error.message : String(error) } }));
      } else if (message.method === "context/update") respond({ result: { success: true } });
      else respond({ error: { code: -32601, message: `Method not found: ${message.method || ""}` } });
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [current]);

  if (!current) return null;
  const close = async () => { try { await current.app.close?.(); } catch { /* continue closing the UI */ } current.resolve(); setExpanded(false); setQueue((items) => items.slice(1)); };
  return <div className="workflow-modal-backdrop"><section className={`workflow-mcp-app-modal ${expanded ? "expanded" : ""}`}>
    <header><div><strong>MCP App</strong><span>{current.app.title}</span></div><div><button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "Restore" : "Maximize"}>{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button><button type="button" onClick={() => void close()} title="Close"><X size={15} /></button></div></header>
    <iframe ref={iframeRef} title={current.app.title || "MCP App"} srcDoc={current.app.html} sandbox="allow-scripts allow-forms" onLoad={() => iframeRef.current?.contentWindow?.postMessage({ jsonrpc: "2.0", method: "toolResult", params: current.app.toolResult }, "*")} />
    <footer><button type="button" onClick={() => void close()}>Close and continue</button></footer>
  </section></div>;
}
