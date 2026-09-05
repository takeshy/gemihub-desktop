import { loadChatSettings, saveChatSettings } from "../llm/settings";
import type { MCPServerConfig } from "../llm/settings";
import type { McpHttpServerConfig } from "./httpClient";
export type ApprovalServer = MCPServerConfig | McpHttpServerConfig;
let pending: Promise<unknown> = Promise.resolve();
export function sameMcpServer(a: ApprovalServer, b: ApprovalServer): boolean {
  if (a.transport !== b.transport) return false;
  if (a.id && b.id && a.id !== b.id) return false;
  return a.transport === "http" && b.transport === "http"
    ? a.url === b.url && JSON.stringify(a.headers || {}) === JSON.stringify(b.headers || {})
    : a.transport === "stdio" && b.transport === "stdio" && a.cwd === b.cwd && a.pluginRoot === b.pluginRoot && a.pluginData === b.pluginData && a.command === b.command && JSON.stringify(a.args) === JSON.stringify(b.args) && JSON.stringify(a.env) === JSON.stringify(b.env);
}
export function requestMcpDecision(server: string, tool: string, args: Record<string, unknown>, canRemember: boolean): Promise<"once" | "always" | "deny"> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog"); dialog.className = "mcp-approval-dialog";
    const title = document.createElement("h2"); title.textContent = "Approve MCP tool call / MCP実行の承認";
    const label = document.createElement("p"); label.textContent = `${server} / ${tool}`;
    const pre = document.createElement("pre"); pre.textContent = JSON.stringify(args, null, 2);
    dialog.append(title, label, pre);
    const finish = (value: "once" | "always" | "deny") => { dialog.remove(); resolve(value); };
    for (const [value, text] of [["deny", "Deny / 拒否"], ["once", "Allow once / 今回だけ許可"], ...(canRemember ? [["always", "Always allow this tool / 常に許可"]] : [])] as ["once" | "always" | "deny", string][]) {
      const button = document.createElement("button"); button.textContent = text; button.onclick = () => finish(value); dialog.append(button);
    }
    dialog.oncancel = () => finish("deny"); dialog.onclose = () => finish("deny");
    dialog.onclick = event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) finish("deny"); } };
    document.body.append(dialog); dialog.showModal();
  });
}
export function requireMcpApproval(server: ApprovalServer, tool: string, args: Record<string, unknown>): Promise<void> {
  const run = async () => {
    const saved = loadChatSettings().mcpServers.find(item => sameMcpServer(item, server));
    if (saved?.autoApprove || saved?.allowedTools?.includes(tool)) return;
    const choice = await requestMcpDecision(saved?.name || server.name, tool, args, !!saved);
    if (choice === "deny") throw new Error(`MCP tool call denied: ${tool}`);
    if (choice === "always") {
      const latest = loadChatSettings(); const target = latest.mcpServers.find(item => sameMcpServer(item, server));
      if (!target) throw new Error("MCP server settings changed during approval");
      target.allowedTools = [...new Set([...(target.allowedTools || []), tool])]; saveChatSettings(latest);
      window.dispatchEvent(new Event("mcp-approval-settings-changed"));
    }
  };
  const result = pending.then(run); pending = result.catch(() => {}); return result;
}
