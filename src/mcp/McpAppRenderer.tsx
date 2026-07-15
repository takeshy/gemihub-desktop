import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, MonitorUp } from "lucide-react";
import type { McpAppInfo } from "../lib/wailsBackend";
import { McpHttpClient } from "./httpClient";
import { McpStdioClient } from "./stdioClient";

type AppClient = McpHttpClient | McpStdioClient;

export function McpAppRenderer({ info }: { info: McpAppInfo }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const clientRef = useRef<AppClient | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const getClient = () => {
      if (clientRef.current) return clientRef.current;
      const config = info.serverConfig;
      clientRef.current = config?.transport === "stdio"
        ? new McpStdioClient(config)
        : new McpHttpClient({ id: config?.id, name: config?.name || "mcp-app", transport: "http", url: info.serverUrl, headers: info.serverHeaders, enabled: true, oauth: config?.oauth });
      return clientRef.current;
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = event.data as { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> };
      if (message.jsonrpc !== "2.0" || message.id === undefined) return;
      const respond = (payload: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage({ jsonrpc: "2.0", id: message.id, ...payload }, "*");
      if (message.method === "tools/call") {
        const name = typeof message.params?.name === "string" ? message.params.name : "";
        const args = message.params?.arguments && typeof message.params.arguments === "object" ? message.params.arguments as Record<string, unknown> : {};
        if (!name) { respond({ error: { code: -32602, message: "Invalid params: missing tool name" } }); return; }
        void getClient().callTool(name, args).then((result) => respond({ result })).catch((error) => respond({ error: { code: -32603, message: error instanceof Error ? error.message : String(error) } }));
      } else if (message.method === "context/update") respond({ result: { success: true } });
      else respond({ error: { code: -32601, message: `Method not found: ${message.method || ""}` } });
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); if (clientRef.current) void clientRef.current.close(); clientRef.current = null; };
  }, [info]);

  return <section className={`chat-mcp-app ${expanded ? "expanded" : ""}`}>
    <header><span><MonitorUp size={12} />MCP App · {info.title}</span><button type="button" onClick={() => setExpanded((value) => !value)} title={expanded ? "Collapse" : "Expand"}>{expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}</button></header>
    <iframe ref={iframeRef} title={`MCP App ${info.title}`} srcDoc={info.html} sandbox="allow-scripts allow-forms" onLoad={() => iframeRef.current?.contentWindow?.postMessage({ jsonrpc: "2.0", method: "toolResult", params: { content: info.toolResult.content || [], isError: Boolean(info.toolResult.isError), structuredContent: info.toolResult.structuredContent } }, "*")} />
  </section>;
}
