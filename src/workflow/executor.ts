import {
  applyPendingFileAction,
  chat,
  type ChatRequest,
  type ChatToolDefinition,
  duplicateFile,
  executeWorkflowShell,
  type FileTreeNode,
  listWorkspaceFiles,
  listWorkspaceTree,
  onChatStream,
  onChatToolRequest,
  readWorkspaceFile,
  renameFile,
  resolveChatTool,
  saveHTMLExport,
  searchRAG,
  trashFile,
  workflowHTTPRequest,
  writeWorkspaceBinaryFile,
  writeWorkspaceFile,
} from "../lib/wailsBackend";
import { encryptWorkspaceFile } from "../lib/fileEncryption";
import { renderMarkdownToPrintableHTML } from "../lib/printableHtml";
import yaml from "js-yaml";
import {
  type ChatProvider,
  type ChatSettings,
  configuredChatProviders,
  resolveRAGSetting,
  selectModelProfile,
  switchChatProvider,
} from "../llm/settings";
import { nextWorkflowNode } from "./parser";
import { executeWorkflowScript } from "./sandbox";
import {
  requestWorkflowPrompt,
  type WorkflowConfirmationResult,
  type WorkflowDialogResult,
  type WorkflowSelectionResult,
} from "./promptService";
import { showWorkflowMcpApp, type WorkflowMcpApp } from "./McpAppHost";
import { discoverMcpHttpTools } from "../mcp/httpClient";
import { discoverMcpStdioTools, McpStdioClient } from "../mcp/stdioClient";
import type {
  Workflow,
  WorkflowLog,
  WorkflowMcpAppInfo,
  WorkflowNode,
  WorkflowRun,
} from "./types";
import {
  evaluateWorkflowCondition,
  evaluateWorkflowValue,
  replaceWorkflowVariables,
  type WorkflowVariables,
} from "./variables";
import {
  expandMultipartFields,
  runWorkflowChatWithAutoApply,
  sanitizeWorkflowNotePath,
  workflowNameFromPath,
} from "./compat";

export interface WorkflowExecutionServices {
  chatSettings: ChatSettings;
  openFile?: (path: string) => void;
  loadWorkflow?: (path: string) => Promise<Workflow>;
  onLog?: (log: WorkflowLog) => void;
  onThinking?: (nodeId: string, thinking: string) => void;
  signal?: AbortSignal;
  activeFile?: { path: string; content: string } | null;
  startNodeId?: string;
  interactionMode?: "panel" | "hotkey" | "event" | "headless";
  runtime?: {
    cliSessionIds: Partial<Record<"codex" | "antigravity", string>>;
    lastCommand?: {
      nodeId: string;
      originalPrompt: string;
      saveTo?: string;
      previousOutput: string;
    };
    regenerate?: {
      commandNodeId: string;
      originalPrompt: string;
      previousOutput: string;
      additionalRequest: string;
    };
  };
}

class WorkflowRegenerateRequest extends Error {
  constructor(readonly commandNodeId: string, feedback: string) {
    super(`Regenerate AI output: ${feedback}`);
  }
}

function nowVariables(name?: string): WorkflowVariables {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${
    pad(now.getDate())
  }`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${
    pad(now.getSeconds())
  }`;
  return new Map([["_date", date], ["_time", time], [
    "_datetime",
    `${date} ${time}`,
  ], ["_workflowName", name ?? ""]]);
}

function property(
  node: WorkflowNode,
  key: string,
  variables: WorkflowVariables,
  fallback = "",
): string {
  return replaceWorkflowVariables(node.properties[key] ?? fallback, variables);
}

function boolProperty(
  node: WorkflowNode,
  key: string,
  fallback: boolean,
): boolean {
  const value = node.properties[key];
  return value === undefined ? fallback : value === "true";
}

function durationMilliseconds(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i);
  if (!match) return null;
  const scale = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  }[match[2].toLowerCase() as "ms" | "s" | "m" | "h" | "d" | "w"];
  return Number(match[1]) * scale;
}

function markdownTags(content: string): string[] {
  const tags = new Set<string>();
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (frontmatter) {
    try {
      const parsed = yaml.load(frontmatter[1], { schema: yaml.JSON_SCHEMA }) as
        | { tags?: unknown }
        | null;
      const values = Array.isArray(parsed?.tags)
        ? parsed.tags
        : parsed?.tags
        ? String(parsed.tags).split(",")
        : [];
      for (const value of values) {
        const tag = String(value).trim();
        if (tag) tags.add(tag.startsWith("#") ? tag : `#${tag}`);
      }
    } catch { /* ignore malformed frontmatter */ }
  }
  for (const match of content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
    tags.add(`#${match[1]}`);
  }
  return [...tags];
}

function workflowMimeType(path: string): { mimeType: string; binary: boolean } {
  const extension = path.split(".").pop()?.toLowerCase() || "";
  const types: Record<string, string> = {
    md: "text/markdown",
    txt: "text/plain",
    json: "application/json",
    csv: "text/csv",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    ts: "application/typescript",
    xml: "application/xml",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    bmp: "image/bmp",
    ico: "image/x-icon",
    svg: "image/svg+xml",
    tiff: "image/tiff",
    tif: "image/tiff",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    wma: "audio/x-ms-wma",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    wmv: "video/x-ms-wmv",
    flv: "video/x-flv",
    m4v: "video/x-m4v",
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    bz2: "application/x-bzip2",
    docx:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    doc: "application/msword",
    xls: "application/vnd.ms-excel",
    ppt: "application/vnd.ms-powerpoint",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    exe: "application/vnd.microsoft.portable-executable",
    dll: "application/vnd.microsoft.portable-executable",
    so: "application/octet-stream",
    dylib: "application/octet-stream",
    wasm: "application/wasm",
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
    eot: "application/vnd.ms-fontobject",
  };
  const mimeType = types[extension] || "application/octet-stream";
  return {
    mimeType,
    binary: !mimeType.startsWith("text/") &&
      ![
        "application/json",
        "application/xml",
        "application/javascript",
        "application/typescript",
        "application/x-yaml",
      ].includes(mimeType),
  };
}

function workflowMimeExtension(mimeType: string): string {
  const types: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "application/pdf": "pdf",
    "application/json": "json",
    "application/zip": "zip",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "video/mp4": "mp4",
    "text/plain": "txt",
    "text/html": "html",
    "text/csv": "csv",
  };
  return types[mimeType.toLowerCase()] || "";
}

function workflowProviderForModel(
  settings: ChatSettings,
  model: string,
): ChatSettings {
  if (!model) return settings;
  const profile = settings.modelProfiles.find((item) =>
    item.enabled && (item.enabledModels.includes(model) ||
      item.enabledModels.some((enabledModel) =>
        `${item.name} — ${enabledModel}` === model
      ))
  );
  if (profile) {
    const resolvedModel = profile.enabledModels.find((enabledModel) =>
      enabledModel === model || `${profile.name} — ${enabledModel}` === model
    ) || profile.model;
    return selectModelProfile(
      settings,
      profile.id,
      resolvedModel,
    );
  }
  let target: ChatProvider | null = null;
  const configured = configuredChatProviders(settings);
  if (/^gemini-/i.test(model)) {
    target = settings.provider === "vertex" || settings.provider === "gemini"
      ? settings.provider
      : configured.includes("gemini")
      ? "gemini"
      : "vertex";
  } else if (/^claude-/i.test(model)) target = "anthropic";
  else if (/^(?:gpt-|o\d)/i.test(model)) target = "openai";
  else if (/\b(?:codex|antigravity)\b/i.test(model)) target = "cli";
  if (!target || !configured.includes(target)) return settings;
  const resolved = target === settings.provider
    ? settings
    : switchChatProvider(settings, target);
  if (target === "cli") {
    const cliType = /antigravity/i.test(model)
      ? "antigravity"
      : "codex";
    return { ...resolved, cliType };
  }
  return resolved;
}

export function isWorkflowImageGenerationModel(model: string): boolean {
  return /(?:image|imagen)/i.test(model);
}

function multipartBodyBase64(
  fields: Record<string, string>,
  boundary: string,
): string {
  const encoder = new TextEncoder(), parts: Uint8Array[] = [];
  for (const [rawName, rawValue] of Object.entries(fields)) {
    const [name, filename] = rawName.split(":", 2);
    let value = rawValue,
      mimeType = "text/plain",
      binary: Uint8Array | null = null,
      actualFilename = filename;
    try {
      const file = JSON.parse(rawValue) as {
        basename?: string;
        mimeType?: string;
        contentType?: string;
        data?: string;
      };
      if (file.data !== undefined) {
        value = file.data;
        mimeType = file.mimeType || mimeType;
        actualFilename = file.basename || filename || "file";
        if (file.contentType === "binary") {
          const decoded = atob(file.data);
          binary = Uint8Array.from(
            decoded,
            (character) => character.charCodeAt(0),
          );
        }
      }
    } catch { /* regular field */ }
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"${
          actualFilename ? `; filename="${actualFilename}"` : ""
        }\r\n${actualFilename ? `Content-Type: ${mimeType}\r\n` : ""}\r\n`,
      ),
    );
    parts.push(binary || encoder.encode(value));
    parts.push(encoder.encode("\r\n"));
  }
  parts.push(encoder.encode(`--${boundary}--\r\n`));
  const total = parts.reduce((sum, part) => sum + part.length, 0),
    combined = new Uint8Array(total);
  let offset = 0, base64Input = "";
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  for (let index = 0; index < combined.length; index += 0x8000) {
    base64Input += String.fromCharCode(
      ...combined.subarray(index, index + 0x8000),
    );
  }
  return btoa(base64Input);
}

function save(
  variables: WorkflowVariables,
  name: string | undefined,
  value: unknown,
): void {
  if (!name) return;
  variables.set(
    name,
    typeof value === "string" || typeof value === "number"
      ? value
      : JSON.stringify(value),
  );
}

function requireSaveTarget(node: WorkflowNode, ...keys: string[]): void {
  if (!keys.some((key) => !!node.properties[key])) {
    throw new Error(
      `${node.type} node requires ${
        keys.map((key) => `'${key}'`).join(" or ")
      } property.`,
    );
  }
}

function collectFolderPaths(
  nodes: FileTreeNode[],
  output: string[] = [],
): string[] {
  for (const node of nodes) {
    if (node.isDir) {
      output.push(node.path);
      collectFolderPaths(node.children || [], output);
    }
  }
  return output;
}

function parseMcpResponse(
  body: string,
): { result?: Record<string, unknown>; error?: { message?: string } } {
  const payloads = body.startsWith("data:")
    ? body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((
      line,
    ) => line.slice(5).trim()).filter(Boolean)
    : [body.trim()];
  for (const payload of payloads.reverse()) {
    try {
      return JSON.parse(payload) as {
        result?: Record<string, unknown>;
        error?: { message?: string };
      };
    } catch { /* continue */ }
  }
  throw new Error("MCP server returned an invalid response.");
}

interface McpCallOutput {
  value: unknown;
  app?: WorkflowMcpApp;
}

function mcpResultValue(result: Record<string, unknown>): unknown {
  const content = Array.isArray(result.content)
    ? result.content as Array<{ type?: string; text?: string }>
    : [];
  if (result.isError) {
    throw new Error(
      content.map((item) => item.text).filter(Boolean).join("\n") ||
        "MCP tool call failed.",
    );
  }
  const text = content.filter((item) => item.type === "text").map((item) =>
    item.text || ""
  ).join("\n");
  return text || result.structuredContent ||
    (content.length ? content : result);
}

interface WorkflowMcpClient {
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  readResource: (
    uri: string,
  ) => Promise<{ text?: string; blob?: string } | null>;
  close: () => Promise<void>;
}

interface WorkflowMcpBinding extends ChatToolDefinition {
  server: { name: string };
  remoteName: string;
}

async function mcpAppFromResult(
  client: WorkflowMcpClient,
  result: Record<string, unknown>,
  title: string,
): Promise<WorkflowMcpApp | undefined> {
  const content = Array.isArray(result.content)
    ? result.content as Array<{ resource?: { text?: string; blob?: string } }>
    : [];
  const meta = result._meta && typeof result._meta === "object"
    ? result._meta as Record<string, unknown>
    : {};
  const ui = meta.ui && typeof meta.ui === "object"
    ? meta.ui as Record<string, unknown>
    : {};
  const uri = typeof ui.resourceUri === "string" ? ui.resourceUri : "";
  let resource = content.find((item) =>
    item.resource?.text || item.resource?.blob
  )?.resource;
  if (!resource && uri) resource = await client.readResource(uri) ?? undefined;
  let html = resource?.text || "";
  if (!html && resource?.blob) {
    try {
      html = atob(resource.blob);
    } catch {
      throw new Error("MCP App resource could not be decoded.");
    }
  }
  return html
    ? {
      title,
      html,
      toolResult: {
        content: result.content || [],
        isError: Boolean(result.isError),
        structuredContent: result.structuredContent,
      },
      callTool: async (name, args) => await client.callTool(name, args),
    }
    : undefined;
}

async function connectWorkflowMcp(
  url: string,
  customHeaders: Record<string, string>,
): Promise<
  {
    send: (
      method: string,
      params: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    close: () => Promise<void>;
  }
> {
  const headers = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...customHeaders,
  };
  const initialize = await workflowHTTPRequest({
    url,
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "gemihub-desktop", version: "0.1.0" },
      },
    }),
  });
  const initialized = parseMcpResponse(initialize.body);
  if (initialized.error) {
    throw new Error(initialized.error.message || "MCP initialization failed.");
  }
  const sessionEntry = Object.entries(initialize.headers).find(([key]) =>
    key.toLowerCase() === "mcp-session-id"
  );
  const sessionHeaders = sessionEntry
    ? { ...headers, "Mcp-Session-Id": sessionEntry[1] }
    : headers;
  await workflowHTTPRequest({
    url,
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  });
  let requestID = 2;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (!sessionEntry) return;
    try {
      await workflowHTTPRequest({
        url,
        method: "DELETE",
        headers: sessionHeaders,
      });
    } catch { /* servers may not implement session deletion */ }
  };
  const send = async (
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    const response = await workflowHTTPRequest({
      url,
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", id: requestID++, method, params }),
    });
    const payload = parseMcpResponse(response.body);
    if (payload.error) {
      throw new Error(payload.error.message || `MCP ${method} failed.`);
    }
    return payload.result ?? {};
  };
  return { send, close };
}

async function callMcpTool(
  url: string,
  tool: string,
  args: Record<string, unknown>,
  customHeaders: Record<string, string>,
): Promise<McpCallOutput> {
  const { send, close } = await connectWorkflowMcp(url, customHeaders);
  try {
    const result = await send("tools/call", { name: tool, arguments: args });
    const value = mcpResultValue(result);
    const content = Array.isArray(result.content)
      ? result.content as Array<
        {
          type?: string;
          text?: string;
          resource?: {
            uri?: string;
            mimeType?: string;
            text?: string;
            blob?: string;
          };
        }
      >
      : [];
    const meta = result._meta && typeof result._meta === "object"
      ? result._meta as Record<string, unknown>
      : {};
    const ui = meta.ui && typeof meta.ui === "object"
      ? meta.ui as Record<string, unknown>
      : {};
    const resourceUri = typeof ui.resourceUri === "string"
      ? ui.resourceUri
      : "";
    let resource = content.find((item) =>
      item.resource?.text || item.resource?.blob
    )?.resource;
    if (!resource && resourceUri) {
      const read = await send("resources/read", { uri: resourceUri });
      const resources = Array.isArray(read.contents)
        ? read.contents as Array<
          { uri?: string; mimeType?: string; text?: string; blob?: string }
        >
        : [];
      resource = resources[0];
    }
    let html = resource?.text || "";
    if (!html && resource?.blob) {
      try {
        html = atob(resource.blob);
      } catch {
        throw new Error("MCP App resource could not be decoded.");
      }
    }
    const app = html
      ? {
        title: tool,
        html,
        toolResult: {
          content: result.content || [],
          isError: Boolean(result.isError),
          structuredContent: result.structuredContent,
        },
        callTool: async (name: string, nextArgs: Record<string, unknown>) =>
          await send("tools/call", { name, arguments: nextArgs }),
        close,
      } satisfies WorkflowMcpApp
      : undefined;
    if (!app) await close();
    return { value, app };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function reopenWorkflowMcpApp(
  info: WorkflowMcpAppInfo,
): Promise<void> {
  if (info.serverConfig?.transport === "stdio") {
    const client = new McpStdioClient(info.serverConfig);
    await showWorkflowMcpApp({
      title: info.title,
      html: info.html,
      toolResult: info.toolResult,
      callTool: async (name, args) => await client.callTool(name, args),
      close: async () => {
        await client.close();
      },
    });
    return;
  }
  const { send, close } = await connectWorkflowMcp(
    info.serverUrl,
    info.serverHeaders,
  );
  await showWorkflowMcpApp({
    title: info.title,
    html: info.html,
    toolResult: info.toolResult,
    callTool: async (name, args) =>
      await send("tools/call", { name, arguments: args }),
    close,
  });
}

async function executeNode(
  node: WorkflowNode,
  variables: WorkflowVariables,
  services: WorkflowExecutionServices,
): Promise<
  {
    output?: unknown;
    condition?: boolean;
    usage?: WorkflowLog["usage"];
    mcpAppInfo?: WorkflowMcpAppInfo;
  }
> {
  switch (node.type) {
    case "variable": {
      const name = node.properties.name;
      if (!name) throw new Error("Variable node is missing name.");
      if (!("value" in node.properties) && variables.has(name)) return {};
      variables.set(
        name,
        evaluateWorkflowValue(node.properties.value ?? "", variables),
      );
      return { output: variables.get(name) };
    }
    case "set": {
      if (!node.properties.name) throw new Error("Set node is missing name.");
      const value = evaluateWorkflowValue(
        node.properties.value ?? "",
        variables,
      );
      variables.set(node.properties.name, value);
      if (node.properties.name === "_clipboard") {
        try {
          await navigator.clipboard.writeText(String(value));
        } catch { /* clipboard permission must not fail the workflow */ }
      }
      return { output: value };
    }
    case "if":
    case "while": {
      const condition = evaluateWorkflowCondition(
        node.properties.condition ?? "",
        variables,
      );
      return { output: condition, condition };
    }
    case "sleep": {
      const duration = Math.max(
        0,
        Number(property(node, "duration", variables, "0")) || 0,
      );
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, duration);
        services.signal?.addEventListener("abort", () => {
          window.clearTimeout(timer);
          reject(new DOMException("Workflow stopped", "AbortError"));
        }, { once: true });
      });
      return { output: duration };
    }
    case "note-read": {
      requireSaveTarget(node, "saveTo");
      let path = property(node, "path", variables);
      if (!path) throw new Error("note-read node is missing path.");
      if (!path.endsWith(".md") && !path.endsWith(".encrypted")) path += ".md";
      let result = await readWorkspaceFile(path);
      if (!result && path.endsWith(".md")) {
        path += ".encrypted";
        result = await readWorkspaceFile(path);
      }
      if (!result) throw new Error(`File not found: ${path}`);
      save(variables, node.properties.saveTo, result.content);
      return { output: result.content };
    }
    case "note": {
      let path = property(node, "path", variables);
      if (!path) throw new Error("note node is missing path.");
      if (!/\.[^/]+$/.test(path)) path += ".md";
      path = sanitizeWorkflowNotePath(path);
      const content = property(node, "content", variables);
      const mode = node.properties.mode ?? "overwrite";
      const existing = await readWorkspaceFile(path).catch(() => null);
      if (mode === "create" && existing) {
        return { output: { path, skipped: true } };
      }
      const finalContent = mode === "append" && existing
        ? `${existing.content}\n${content}`
        : content;
      if (boolProperty(node, "confirm", true)) {
        if (services.interactionMode === "headless") {
          throw new Error(
            `Headless workflow cannot confirm writing ${path}. Set confirm: false to allow it.`,
          );
        }
        const confirmation = await requestWorkflowPrompt({
          kind: "confirm-write",
          title: "Confirm file write",
          path,
          mode,
          content: finalContent,
          originalContent: existing?.content,
        });
        const result = confirmation === true
          ? { confirmed: true }
          : confirmation as WorkflowConfirmationResult | null;
        if (
          !result?.confirmed && result?.additionalRequest &&
          services.runtime?.lastCommand
        ) {
          services.runtime.regenerate = {
            commandNodeId: services.runtime.lastCommand.nodeId,
            originalPrompt: services.runtime.lastCommand.originalPrompt,
            previousOutput: services.runtime.lastCommand.previousOutput,
            additionalRequest: result.additionalRequest,
          };
          throw new WorkflowRegenerateRequest(
            services.runtime.lastCommand.nodeId,
            result.additionalRequest,
          );
        }
        if (!result?.confirmed) throw new Error("File write cancelled.");
      }
      await writeWorkspaceFile(path, finalContent);
      return { output: { path, mode } };
    }
    case "note-search": {
      requireSaveTarget(node, "saveTo");
      const query = property(node, "query", variables);
      if (!query) throw new Error("note-search node is missing query.");
      const limit = Number(node.properties.limit) || 10;
      const candidates = (await listWorkspaceFiles()).filter((item) =>
        /\.md$/i.test(item.path)
      );
      const result: Array<
        { name: string; path: string; matchedContent?: string }
      > = [];
      for (const item of candidates) {
        if (result.length >= limit) break;
        if (boolProperty(node, "searchContent", false)) {
          const content = (await readWorkspaceFile(item.path))?.content || "",
            index = content.toLowerCase().indexOf(query.toLowerCase());
          if (index >= 0) {
            const start = Math.max(0, index - 50),
              end = Math.min(content.length, index + query.length + 50);
            result.push({
              name: item.path.split("/").pop()?.replace(/\.md$/i, "") ||
                item.path,
              path: item.path,
              matchedContent: `${start ? "..." : ""}${
                content.slice(start, end)
              }${end < content.length ? "..." : ""}`,
            });
          }
        } else if (item.path.toLowerCase().includes(query.toLowerCase())) {
          result.push({
            name: item.path.split("/").pop()?.replace(/\.md$/i, "") ||
              item.path,
            path: item.path,
          });
        }
      }
      save(variables, node.properties.saveTo, result);
      return { output: result };
    }
    case "note-list": {
      requireSaveTarget(node, "saveTo");
      const folder = property(node, "folder", variables).replace(
        /^\/+|\/+$/g,
        "",
      );
      const recursive = boolProperty(node, "recursive", false);
      const limit = Number(node.properties.limit) || 50;
      const createdWithin = durationMilliseconds(
        property(node, "createdWithin", variables),
      );
      const modifiedWithin = durationMilliseconds(
        property(node, "modifiedWithin", variables),
      );
      const tagsRequired = property(node, "tags", variables).split(",").map((
        tag,
      ) => tag.trim()).filter(Boolean).map((tag) =>
        tag.startsWith("#") ? tag : `#${tag}`
      );
      const candidates = (await listWorkspaceFiles()).filter((item) => {
        if (!item.path.toLowerCase().endsWith(".md")) return false;
        if (
          createdWithin !== null &&
          item.createdTime < Date.now() - createdWithin
        ) return false;
        if (
          modifiedWithin !== null && item.modTime < Date.now() - modifiedWithin
        ) return false;
        if (!folder) return true;
        if (!item.path.startsWith(`${folder}/`)) return false;
        return recursive || !item.path.slice(folder.length + 1).includes("/");
      });
      const withTags = await Promise.all(
        candidates.map(async (item) => ({
          item,
          tags: tagsRequired.length
            ? markdownTags((await readWorkspaceFile(item.path))?.content || "")
            : [],
        })),
      );
      const filtered = withTags.filter(({ tags }) =>
        tagsRequired.length === 0 ||
        (node.properties.tagMatch === "all"
          ? tagsRequired.every((tag) => tags.includes(tag))
          : tagsRequired.some((tag) => tags.includes(tag)))
      );
      const direction = node.properties.sortOrder === "asc" ? 1 : -1;
      filtered.sort((left, right) =>
        node.properties.sortBy === "name"
          ? direction * left.item.path.localeCompare(right.item.path)
          : node.properties.sortBy === "created"
          ? direction * (left.item.createdTime - right.item.createdTime)
          : node.properties.sortBy === "modified"
          ? direction * (left.item.modTime - right.item.modTime)
          : 0
      );
      const totalCount = filtered.length;
      const notes = filtered.slice(0, limit).map(({ item, tags }) => ({
        name: item.path.split("/").pop()?.replace(/\.md$/i, "") || item.path,
        path: item.path,
        created: item.createdTime,
        modified: item.modTime,
        tags,
      }));
      const result = {
        notes,
        count: notes.length,
        totalCount,
        hasMore: totalCount > limit,
      };
      save(variables, node.properties.saveTo, result);
      return { output: result };
    }
    case "folder-list": {
      requireSaveTarget(node, "saveTo");
      const parent = property(node, "folder", variables) ||
        property(node, "path", variables);
      const normalizedParent = parent.replace(/^\/+|\/+$/g, "");
      const sorted = collectFolderPaths(await listWorkspaceTree()).filter((
        folder,
      ) =>
        !normalizedParent || folder === normalizedParent ||
        folder.startsWith(`${normalizedParent}/`)
      ).sort();
      const result = { folders: sorted, count: sorted.length };
      save(variables, node.properties.saveTo, result);
      return { output: result };
    }
    case "open": {
      let path = property(node, "path", variables);
      if (!path) throw new Error("open node is missing path.");
      if (!/\.[^/]+$/.test(path)) path += ".md";
      services.openFile?.(path);
      return { output: path };
    }
    case "json": {
      requireSaveTarget(node, "saveTo");
      const source = node.properties.source;
      if (!source || !variables.has(source)) {
        throw new Error(
          `JSON source variable not found: ${source || "(empty)"}`,
        );
      }
      let text = String(variables.get(source));
      text = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1].trim() ?? text;
      const parsed = JSON.parse(text);
      save(variables, node.properties.saveTo, parsed);
      return { output: parsed };
    }
    case "http": {
      const url = property(node, "url", variables);
      if (!url) throw new Error("http node is missing url.");
      let headers: Record<string, string> = {};
      if (node.properties.headers) {
        const raw = property(node, "headers", variables);
        try {
          headers = JSON.parse(raw);
        } catch {
          for (const line of raw.split("\n")) {
            const split = line.indexOf(":");
            if (split > 0) {
              headers[line.slice(0, split).trim()] = line.slice(split + 1)
                .trim();
            }
          }
        }
      }
      const method = (node.properties.method || "GET").toUpperCase();
      const contentType = node.properties.contentType || "json";
      let body = property(node, "body", variables) || undefined,
        bodyBase64: string | undefined;
      if (body && ["POST", "PUT", "PATCH"].includes(method)) {
        if (contentType === "text") headers["Content-Type"] ||= "text/plain";
        else if (contentType === "binary") {
          const data = JSON.parse(body) as {
            data?: string;
            mimeType?: string;
            contentType?: string;
          };
          if (!data.data || data.contentType !== "binary") {
            throw new Error("binary contentType requires FileExplorerData.");
          }
          bodyBase64 = data.data;
          body = undefined;
          headers["Content-Type"] ||= data.mimeType ||
            "application/octet-stream";
        } else if (contentType === "form-data") {
          const boundary = `----LLMHub${crypto.randomUUID().replace(/-/g, "")}`;
          const fields = expandMultipartFields(
            node.properties.body || "",
            (value) => replaceWorkflowVariables(value, variables),
          );
          bodyBase64 = multipartBodyBase64(fields, boundary);
          body = undefined;
          headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
        } else headers["Content-Type"] ||= "application/json";
      }
      const response = await workflowHTTPRequest({
        url,
        method,
        headers,
        body,
        bodyBase64,
      });
      const responseMime =
        (response.headers["content-type"] || "application/octet-stream").split(
          ";",
        )[0];
      const binaryResponse = node.properties.responseType === "binary" ||
        (node.properties.responseType !== "text" &&
          !responseMime.startsWith("text/") &&
          !/[+\/]json$|[+\/]xml$|javascript/.test(responseMime));
      if (binaryResponse) {
        let urlName = new URL(url).pathname.split("/").pop() || "download";
        let extension = urlName.includes(".")
          ? urlName.split(".").pop() || ""
          : "";
        if (!extension) {
          extension = workflowMimeExtension(responseMime);
          if (extension) urlName += `.${extension}`;
        }
        save(variables, node.properties.saveTo, {
          path: "",
          basename: urlName,
          name: urlName.replace(/\.[^.]+$/, ""),
          extension,
          mimeType: responseMime,
          contentType: "binary",
          data: response.bodyBase64,
        });
      } else {
        let output: unknown = response.body;
        try {
          output = JSON.parse(response.body);
        } catch { /* text */ }
        save(variables, node.properties.saveTo, output);
      }
      save(variables, node.properties.saveStatus, response.status);
      if (boolProperty(node, "throwOnError", false) && response.status >= 400) {
        throw new Error(
          `HTTP ${response.status}: ${response.body.slice(0, 500)}`,
        );
      }
      return { output: response };
    }
    case "gemihub-command": {
      const command = property(node, "command", variables).toLowerCase();
      const path = property(node, "path", variables).replace(
        /^workspace:\/\//i,
        "",
      );
      if (!command) throw new Error("gemihub-command node is missing command.");
      if (!path) throw new Error("gemihub-command node is missing path.");
      const scopedPath = `workspace://${path}`;
      let output: unknown;
      if (command === "duplicate") {
        output = await duplicateFile(scopedPath);
        const customName = property(node, "text", variables).trim();
        if (customName) {
          const duplicatedPath = String(output);
          await renameFile(
            /^(?:workspace|files):\/\//i.test(duplicatedPath)
              ? duplicatedPath
              : `workspace://${duplicatedPath}`,
            `workspace://${customName}`,
          );
          output = customName;
        }
      } else if (command === "rename") {
        const text = property(node, "text", variables).trim();
        if (!text) throw new Error("rename requires text.");
        const target = text;
        await renameFile(scopedPath, `workspace://${target}`);
        output = target;
      } else if (command === "encrypt") {
        if (services.interactionMode === "headless") {
          throw new Error("encrypt requires an interactive password prompt.");
        }
        const result = await requestWorkflowPrompt({
          kind: "value",
          title: "Encrypt file",
          message: "Enter the encryption password",
        });
        const password = typeof result === "string" ? result : "";
        if (!password) throw new Error("Encryption was cancelled.");
        let metadata: Record<string, string> = {};
        const rawMetadata = property(node, "metadata", variables).trim();
        if (rawMetadata) {
          const parsed = JSON.parse(rawMetadata) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("metadata must be a JSON object.");
          }
          for (const [key, value] of Object.entries(parsed)) {
            const normalizedKey = key.trim();
            if (typeof value !== "string") {
              throw new Error("metadata values must be strings.");
            }
            if (
              normalizedKey &&
              !["description", "__proto__", "prototype", "constructor"]
                .includes(normalizedKey)
            ) metadata[normalizedKey] = value;
          }
        }
        const description = property(node, "text", variables).trim();
        output = await encryptWorkspaceFile(
          scopedPath,
          password,
          metadata,
          description,
        );
      } else if (command === "convert-to-html") {
        const source = await readWorkspaceFile(path);
        if (!source) throw new Error(`File not found: ${path}`);
        output = await saveHTMLExport(
          scopedPath,
          renderMarkdownToPrintableHTML(
            source.content,
            source.fileName || path,
          ),
        );
      } else if (command === "convert-to-pdf") {
        throw new Error(
          "PDF conversion is not available in GeminiHub Desktop.",
        );
      } else if (command === "publish" || command === "unpublish") {
        throw new Error(
          `${command} is unavailable for local Desktop workspaces.`,
        );
      } else {
        throw new Error(`Unsupported gemihub-command: ${command}`);
      }
      save(variables, node.properties.saveTo, output);
      return { output };
    }
    case "command": {
      const requestedModel = node.properties.model ||
        services.chatSettings.model;
      const settings = workflowProviderForModel(
        services.chatSettings,
        requestedModel,
      );
      const imageGenerationModel = isWorkflowImageGenerationModel(
        requestedModel,
      );
      if (node.properties.saveImageTo && !imageGenerationModel) {
        throw new Error(
          `command node ${node.id} uses saveImageTo but model "${
            requestedModel || "(none)"
          }" is not an image-generation model. Set model to a configured image model such as gemini-3.1-flash-image-preview.`,
        );
      }
      let prompt = property(node, "prompt", variables);
      if (!prompt) throw new Error("command node is missing prompt.");
      const originalPrompt = prompt;
      if (services.runtime?.regenerate?.commandNodeId === node.id) {
        const regeneration = services.runtime.regenerate;
        prompt =
          `${regeneration.originalPrompt}\n\n[Previous output]\n${regeneration.previousOutput}\n\n[User feedback]\n${regeneration.additionalRequest}\n\nRevise the output based on the feedback.`;
        services.runtime.regenerate = undefined;
      }
      const fileMode =
        (imageGenerationModel
          ? "none"
          : node.properties.vaultTools === "noSearch"
          ? "noSearch"
          : node.properties.vaultTools === "none"
          ? "none"
          : "all") as ChatRequest["fileToolMode"];
      const attachmentNames = property(node, "attachments", variables).split(
        ",",
      ).map((value) => value.trim()).filter(Boolean);
      const chatAttachments: Array<
        { name: string; mimeType: string; data: string }
      > = [];
      for (const name of attachmentNames) {
        const variable = variables.get(name);
        let path = name, content = "";
        if (variable !== undefined) {
          try {
            const data = JSON.parse(String(variable)) as {
              path?: string;
              basename?: string;
              mimeType?: string;
              contentType?: string;
              data?: string;
            };
            path = data.path || data.basename || name;
            if (data.contentType === "binary" && data.data) {
              chatAttachments.push({
                name: data.basename || path,
                mimeType: data.mimeType || "application/octet-stream",
                data: data.data,
              });
            } else content = data.data || String(variable);
          } catch {
            content = String(variable);
          }
        } else {
          const file = await readWorkspaceFile(name);
          const dataUrl = file?.content.match(
            /^data:([^;,]+);base64,([\s\S]+)$/,
          );
          if (dataUrl) {
            chatAttachments.push({
              name: file?.fileName || name.split("/").pop() || name,
              mimeType: dataUrl[1],
              data: dataUrl[2],
            });
          } else content = file?.content || "";
        }
        if (content) {
          prompt +=
            `\n\n--- BEGIN FILE: ${path} ---\n${content}\n--- END FILE: ${path} ---`;
        }
      }
      let commandPrompt = prompt;
      const configuredRag = node.properties.ragSetting;
      const ragName = configuredRag === undefined
        ? settings.selectedRagSetting ?? undefined
        : configuredRag;
      const webSearchEnabled = configuredRag === "__websearch__" ||
        (configuredRag === undefined && settings.webSearchEnabled);
      if (ragName && ragName !== "__none__" && ragName !== "__websearch__") {
        const rag = settings.ragSettings[ragName];
        if (!rag) throw new Error(`RAG setting not found: ${ragName}`);
        const matches = await searchRAG(
          ragName,
          prompt,
          resolveRAGSetting(settings, rag),
        );
        commandPrompt += `\n\nRetrieved context:\n${
          matches.map((match) => `[${match.filePath}]\n${match.text}`).join(
            "\n\n",
          )
        }`;
      }
      services.runtime ??= { cliSessionIds: {} };
      const mcpNames = imageGenerationModel
        ? []
        : property(node, "mcpServers", variables).split(",").map((value) =>
          value.trim()
        ).filter(Boolean);
      const selectedMcpServers = settings.mcpServers.filter((server) =>
        server.enabled && mcpNames.includes(server.name)
      );
      let mcpBindings: WorkflowMcpBinding[] = [];
      const mcpClients = new Map<string, WorkflowMcpClient>();
      const httpServers = selectedMcpServers.filter((server) =>
        server.transport === "http"
      );
      const stdioServers = selectedMcpServers.filter((server) =>
        server.transport === "stdio"
      );
      if (httpServers.length) {
        const discovered = await discoverMcpHttpTools(
          httpServers.map((server) => ({
            id: server.id,
            name: server.name,
            transport: "http",
            url: server.url,
            headers: server.headers,
            enabled: server.enabled,
            oauth: server.oauth,
          })),
        );
        mcpBindings.push(...discovered.bindings);
        for (const [name, client] of discovered.clients) {
          mcpClients.set(name, client);
        }
      }
      if (stdioServers.length) {
        const discovered = await discoverMcpStdioTools(stdioServers);
        mcpBindings.push(...discovered.bindings);
        for (const [name, client] of discovered.clients) {
          mcpClients.set(name, client);
        }
      }
      const streamId = crypto.randomUUID();
      const bindingMap = new Map(
        mcpBindings.map((binding) => [binding.name, binding]),
      );
      const javascriptTool: ChatToolDefinition | null =
        imageGenerationModel || settings.provider === "cli" ? null : {
          name: "execute_javascript",
          description:
            "Execute JavaScript in an isolated sandbox with no DOM, network, or storage access. Use return to provide a value; optional input is available as the input variable.",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string" },
              input: { type: "string" },
            },
            required: ["code"],
          },
        };
      const customTools = [
        ...mcpBindings.map(({ name, description, parameters }) => ({
          name,
          description,
          parameters,
        })),
        ...(javascriptTool ? [javascriptTool] : []),
      ];
      const unsubscribe = customTools.length
        ? onChatToolRequest((request) => {
          if (request.streamId !== streamId) return;
          if (request.name === "execute_javascript") {
            const code = typeof request.arguments.code === "string"
              ? request.arguments.code
              : "";
            const input = typeof request.arguments.input === "string"
              ? request.arguments.input
              : JSON.stringify(request.arguments.input ?? "");
            if (!code) {
              void resolveChatTool(
                request.requestId,
                undefined,
                "execute_javascript requires code",
              );
              return;
            }
            void executeWorkflowScript(
              `const input = variables.input;\n${code}`,
              { input },
              10_000,
            ).then((value) => resolveChatTool(request.requestId, value)).catch((
              error,
            ) =>
              resolveChatTool(
                request.requestId,
                undefined,
                error instanceof Error ? error.message : String(error),
              )
            );
            return;
          }
          const binding = bindingMap.get(request.name);
          if (!binding) return;
          const client = mcpClients.get(binding.server.name);
          if (!client) {
            void resolveChatTool(
              request.requestId,
              undefined,
              `MCP client not found: ${binding.server.name}`,
            );
            return;
          }
          void client.callTool(binding.remoteName, request.arguments).then(
            async (toolResult) => {
              const app = await mcpAppFromResult(
                client,
                toolResult,
                binding.remoteName,
              );
              if (app) await showWorkflowMcpApp(app);
              await resolveChatTool(request.requestId, toolResult);
            },
          ).catch((error) =>
            resolveChatTool(
              request.requestId,
              undefined,
              error instanceof Error ? error.message : String(error),
            )
          );
        })
        : () => undefined;
      let streamedThinking = "";
      const unsubscribeStream = onChatStream((event) => {
        if (
          event.streamId !== streamId || event.type !== "thinking" ||
          !event.delta
        ) return;
        streamedThinking += event.delta;
        services.onThinking?.(node.id, streamedThinking);
      });
      let result;
      try {
        const chatRequest: ChatRequest = {
          provider: settings.provider,
          endpoint: settings.endpoint,
          apiKey: settings.apiKey,
          localFramework: settings.localFramework,
          localUsername: settings.localUsername,
          localPassword: settings.localPassword,
          model: settings.provider === "cli"
            ? ""
            : requestedModel || settings.model,
          vertexProjectId: settings.vertexProjectId,
          vertexLocation: settings.vertexLocation,
          systemPrompt: property(
            node,
            "systemPrompt",
            variables,
            settings.systemPrompt,
          ),
          messages: [{
            role: "user",
            content: commandPrompt,
            attachments: chatAttachments.length ? chatAttachments : undefined,
          }],
          enableFileTools: fileMode !== "none",
          fileToolMode: fileMode,
          cliType: settings.cliType,
          cliPath: settings.cliPaths[settings.cliType],
          cliSessionId: services.runtime.cliSessionIds[settings.cliType] || "",
          streamId,
          customTools,
          enableThinking: boolProperty(node, "enableThinking", true),
          enableWebSearch: webSearchEnabled,
        };
        result = await runWorkflowChatWithAutoApply(
          chatRequest,
          chat,
          applyPendingFileAction,
        );
      } finally {
        unsubscribe();
        unsubscribeStream();
        await Promise.all(
          [...mcpClients.values()].map((client) => client.close()),
        );
      }
      if (result.thinking && !streamedThinking) {
        services.onThinking?.(node.id, result.thinking);
      }
      if (result.cliSessionId) {
        services.runtime.cliSessionIds[settings.cliType] = result.cliSessionId;
      }
      let responseContent = result.content;
      const fenced = responseContent.trim().match(
        /^```\w*\r?\n([\s\S]+?)\r?\n```$/,
      );
      if (fenced && !fenced[1].includes("```")) responseContent = fenced[1];
      save(variables, node.properties.saveTo, responseContent);
      services.runtime.lastCommand = {
        nodeId: node.id,
        originalPrompt,
        saveTo: node.properties.saveTo,
        previousOutput: responseContent,
      };
      if (node.properties.saveImageTo && result.generatedImages?.length) {
        const images = result.generatedImages.map((image, index) => {
          const extension =
            image.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
          const basename = `generated-image-${index + 1}.${extension}`;
          return {
            path: basename,
            basename,
            name: `generated-image-${index + 1}`,
            extension,
            mimeType: image.mimeType,
            contentType: "binary",
            data: image.data,
          };
        });
        save(
          variables,
          node.properties.saveImageTo,
          images.length === 1 ? images[0] : images,
        );
      }
      variables.set(
        "_lastModel",
        result.model || node.properties.model || settings.model,
      );
      return { output: result.content, usage: result.usage };
    }
    case "workflow": {
      const path = property(node, "path", variables);
      if (!path || !services.loadWorkflow) {
        throw new Error("Sub-workflow path is missing or unavailable.");
      }
      const sub = await services.loadWorkflow(path);
      const inputs = new Map<string, string | number>();
      const inputText = property(node, "input", variables);
      if (inputText) {
        try {
          const mapping = JSON.parse(inputText) as Record<string, unknown>;
          for (const [key, value] of Object.entries(mapping)) {
            inputs.set(
              key,
              typeof value === "number"
                ? value
                : typeof value === "string"
                ? value
                : JSON.stringify(value),
            );
          }
        } catch {
          for (const pair of inputText.split(",")) {
            const split = pair.indexOf("=");
            if (split < 0) continue;
            const key = pair.slice(0, split).trim(),
              raw = pair.slice(split + 1).trim();
            if (key) inputs.set(key, variables.get(raw) ?? raw);
          }
        }
      }
      const result = await executeWorkflow(sub, path, {
        ...services,
        startNodeId: undefined,
      }, inputs);
      if (result.status !== "completed") {
        throw new Error(
          `Sub-workflow failed: ${result.error || result.status}`,
        );
      }
      const outputText = property(node, "output", variables);
      if (outputText) {
        let mapping: Record<string, string> = {};
        try {
          mapping = JSON.parse(outputText) as Record<string, string>;
        } catch {
          for (const pair of outputText.split(",")) {
            const split = pair.indexOf("=");
            if (split >= 0) {
              mapping[pair.slice(0, split).trim()] = pair.slice(split + 1)
                .trim();
            }
          }
        }
        for (const [parentName, childName] of Object.entries(mapping)) {
          if (childName in result.variables) {
            variables.set(parentName, result.variables[childName]);
          }
        }
      } else {
        const prefix = node.properties.prefix || "";
        for (const [key, value] of Object.entries(result.variables)) {
          variables.set(`${prefix}${key}`, value);
        }
      }
      save(variables, node.properties.saveTo, result.variables);
      return { output: result.variables };
    }
    case "rag-sync": {
      const result = {
        path: property(node, "path", variables) || null,
        error: "Server RAG sync is no longer supported. Use local RAG instead.",
        syncedAt: Date.now(),
        mode: "unsupported",
      };
      save(variables, node.properties.saveTo, result);
      return { output: result };
    }
    case "dialog": {
      if (services.interactionMode === "headless") {
        throw new Error("dialog node is unavailable in headless execution.");
      }
      const options = property(node, "options", variables).split(",").map((
        value,
      ) => value.trim()).filter(Boolean);
      let defaults: { input?: string; selected?: string[] } | undefined;
      if (node.properties.defaults) {
        try {
          defaults = JSON.parse(property(node, "defaults", variables));
        } catch { /* ignore invalid defaults */ }
      }
      const result = await requestWorkflowPrompt({
        kind: "dialog",
        title: property(node, "title", variables, "Dialog"),
        message: property(node, "message", variables),
        options,
        multiSelect: boolProperty(node, "multiSelect", false),
        markdown: boolProperty(node, "markdown", false),
        button1: property(node, "button1", variables, "OK"),
        button2: node.properties.button2
          ? property(node, "button2", variables)
          : undefined,
        inputTitle: node.properties.inputTitle
          ? property(node, "inputTitle", variables)
          : undefined,
        multiline: boolProperty(node, "multiline", false),
        defaults,
      });
      if (result === null) throw new Error("Dialog cancelled.");
      save(variables, node.properties.saveTo, result as WorkflowDialogResult);
      return { output: result };
    }
    case "prompt-value": {
      requireSaveTarget(node, "saveTo");
      const fallback = property(node, "default", variables);
      if (services.interactionMode === "headless") {
        if (!fallback) {
          throw new Error(
            "prompt-value requires a default in headless execution.",
          );
        }
        save(variables, node.properties.saveTo, fallback);
        return { output: fallback };
      }
      const result = await requestWorkflowPrompt({
        kind: "value",
        title: property(node, "title", variables, "Input"),
        message: property(node, "message", variables),
        defaultValue: fallback,
        multiline: boolProperty(node, "multiline", false),
      });
      if (result === null) throw new Error("Value input cancelled.");
      save(variables, node.properties.saveTo, String(result));
      return { output: result };
    }
    case "note-delete":
    case "drive-delete": {
      const path = property(node, "path", variables);
      if (!path) throw new Error(`${node.type} is missing path.`);
      if (boolProperty(node, "confirm", true)) {
        if (services.interactionMode === "headless") {
          throw new Error(
            `Headless workflow cannot confirm deleting ${path}. Set confirm: false.`,
          );
        }
        const confirmed = await requestWorkflowPrompt({
          kind: "confirm-write",
          title: "Move file to Trash",
          path,
          mode: "trash",
          content: "",
        });
        if (
          !(confirmed === true ||
            (confirmed && typeof confirmed === "object" &&
              "confirmed" in confirmed && confirmed.confirmed))
        ) throw new Error("File deletion cancelled.");
      }
      await trashFile(`workspace://${path}`);
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
      return { output: { path, trashed: true } };
    }
    case "prompt-file": {
      requireSaveTarget(node, "saveTo");
      if (services.interactionMode === "headless") {
        throw new Error(
          "prompt-file node is unavailable in headless execution.",
        );
      }
      let automaticPath = "";
      if (services.interactionMode === "event") {
        automaticPath = String(variables.get("_eventFilePath") || "");
      }
      if (services.interactionMode === "hotkey") {
        try {
          automaticPath = String(
            JSON.parse(String(variables.get("_hotkeyActiveFile") || "{}"))
              ?.path || "",
          );
        } catch { /* prompt instead */ }
      }
      const fallback = property(node, "default", variables);
      const path = !boolProperty(node, "forcePrompt", false) && automaticPath
        ? automaticPath
        : await requestWorkflowPrompt({
          kind: "file",
          title: property(
            node,
            "title",
            variables,
            "Select a Workspace file",
          ),
          defaultPath: fallback,
          extensions: ["md", "encrypted"],
        }) as string | null;
      if (!path) throw new Error("File selection cancelled.");
      const file = await readWorkspaceFile(path);
      if (!file) throw new Error(`File not found: ${path}`);
      save(variables, node.properties.saveTo, file.content);
      if (node.properties.saveFileTo) {
        const basename = path.split("/").pop() || path;
        const dot = basename.lastIndexOf(".");
        save(variables, node.properties.saveFileTo, {
          path,
          basename,
          name: dot > 0 ? basename.slice(0, dot) : basename,
          extension: dot > 0 ? basename.slice(dot + 1) : "",
        });
      }
      return { output: { path, content: file.content } };
    }
    case "prompt-selection": {
      requireSaveTarget(node, "saveTo");
      if (services.interactionMode === "headless") {
        throw new Error(
          "prompt-selection node is unavailable in headless execution.",
        );
      }
      const automatic = services.interactionMode === "hotkey"
        ? String(
          variables.get("_hotkeySelection") ||
            variables.get("_hotkeyContent") || "",
        )
        : services.interactionMode === "event"
        ? String(variables.get("_eventFileContent") || "")
        : "";
      if (automatic) {
        const path = services.interactionMode === "event"
          ? String(variables.get("_eventFilePath") || "")
          : services.activeFile?.path || "";
        save(variables, node.properties.saveTo, automatic);
        if (node.properties.saveSelectionTo) {
          save(variables, node.properties.saveSelectionTo, {
            filePath: path,
            startLine: 1,
            endLine: automatic.split("\n").length,
            start: 0,
            end: automatic.length,
          });
        }
        return { output: automatic };
      }
      const source = services.activeFile;
      if (!source) {
        throw new Error("No active file is available for prompt-selection.");
      }
      const selected = await requestWorkflowPrompt({
        kind: "selection",
        title: "Select text",
        path: source.path,
        content: source.content,
      }) as WorkflowSelectionResult | null;
      if (!selected) throw new Error("Text selection cancelled.");
      const startLine =
        source.content.slice(0, selected.start).split("\n").length;
      const endLine = source.content.slice(0, selected.end).split("\n").length;
      save(variables, node.properties.saveTo, selected.text);
      if (node.properties.saveSelectionTo) {
        save(variables, node.properties.saveSelectionTo, {
          filePath: source.path,
          startLine,
          endLine,
          start: selected.start,
          end: selected.end,
        });
      }
      return { output: selected.text };
    }
    case "file-explorer": {
      requireSaveTarget(node, "saveTo", "savePathTo");
      if (
        services.interactionMode === "headless" &&
        !property(node, "path", variables)
      ) throw new Error("file-explorer requires path in headless execution.");
      const directPath = property(node, "path", variables);
      const extensions = property(node, "extensions", variables).split(",").map(
        (value) => value.trim().replace(/^\./, "").toLowerCase(),
      ).filter(Boolean);
      const path = directPath || await requestWorkflowPrompt({
        kind: "file",
        title: property(
          node,
          "title",
          variables,
          "Select a Workspace file",
        ),
        defaultPath: property(node, "default", variables) ||
          services.activeFile?.path || "",
        allowCreate: node.properties.mode === "create",
        allowBinary: true,
        extensions,
      }) as string | null;
      if (!path) throw new Error("File selection cancelled.");
      const extension = path.includes(".")
        ? path.split(".").pop()!.toLowerCase()
        : "";
      if (node.properties.mode === "create") {
        const type = workflowMimeType(path);
        const value = {
          path,
          basename: path.split("/").pop() || path,
          name: (path.split("/").pop() || path).replace(/\.[^.]+$/, ""),
          extension,
          mimeType: type.mimeType,
          contentType: type.binary ? "binary" : "text",
          data: "",
        };
        save(variables, node.properties.saveTo, value);
        save(variables, node.properties.savePathTo, path);
        return { output: value };
      }
      const file = await readWorkspaceFile(path);
      if (!file) throw new Error(`File not found: ${path}`);
      const dataMatch = file.content.match(/^data:([^;,]+)?;base64,(.*)$/s);
      const value = {
        path,
        basename: path.split("/").pop() || path,
        name: (path.split("/").pop() || path).replace(/\.[^.]+$/, ""),
        extension,
        mimeType: dataMatch?.[1] || "text/plain",
        contentType: dataMatch ? "binary" : "text",
        data: dataMatch?.[2] || file.content,
      };
      save(variables, node.properties.saveTo, value);
      save(variables, node.properties.savePathTo, path);
      return { output: value };
    }
    case "file-save": {
      const sourceName = node.properties.source;
      if (!sourceName || !variables.has(sourceName)) {
        throw new Error(
          `file-save source variable not found: ${sourceName || "(empty)"}`,
        );
      }
      const raw = String(variables.get(sourceName));
      let value: { path?: string; contentType?: string; data?: string };
      try {
        value = JSON.parse(raw);
      } catch {
        value = { data: raw, contentType: "text" };
      }
      let path = property(node, "path", variables) || value.path;
      if (!path) throw new Error("file-save node is missing path.");
      const extension =
        typeof (value as { extension?: unknown }).extension === "string"
          ? (value as { extension?: string }).extension
          : "";
      if (!/\.[^/]+$/.test(path) && extension) path += `.${extension}`;
      if (boolProperty(node, "confirm", false)) {
        if (services.interactionMode === "headless") {
          throw new Error(
            `Headless workflow cannot confirm saving ${path}. Set confirm: false to allow it.`,
          );
        }
        const confirmation = await requestWorkflowPrompt({
          kind: "confirm-write",
          title: "Confirm file save",
          path,
          mode: "save",
          content: value.contentType === "binary"
            ? `[Binary data: ${(value.data || "").length} base64 characters]`
            : value.data || "",
        });
        if (
          !(confirmation === true ||
            (confirmation && typeof confirmation === "object" &&
              "confirmed" in confirmation && confirmation.confirmed))
        ) throw new Error("File save cancelled.");
      }
      if (value.contentType === "binary") {
        await writeWorkspaceBinaryFile(path, value.data || "");
      } else await writeWorkspaceFile(path, value.data || "");
      save(variables, node.properties.savePathTo, path);
      return { output: path };
    }
    case "shell": {
      const command = property(node, "command", variables);
      if (!command) throw new Error("shell node is missing command.");
      let args: string[] = [];
      if (node.properties.args) {
        const raw = property(node, "args", variables);
        try {
          const parsed = JSON.parse(raw);
          args = Array.isArray(parsed) ? parsed.map(String) : [raw];
        } catch {
          args = [raw];
        }
      }
      let env: Record<string, string> = {};
      if (node.properties.env) {
        try {
          const parsed = JSON.parse(property(node, "env", variables));
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            env = Object.fromEntries(
              Object.entries(parsed).map((
                [key, value],
              ) => [key, String(value)]),
            );
          }
        } catch { /* match source behavior: ignore invalid env JSON */ }
      }
      const result = await executeWorkflowShell({
        command,
        args,
        env,
        cwd: property(node, "cwd", variables),
        timeoutMs: Number(node.properties.timeout) || 60_000,
      });
      save(variables, node.properties.saveTo, result.stdout);
      save(variables, node.properties.saveStderrTo, result.stderr);
      save(variables, node.properties.saveExitCodeTo, result.exitCode);
      if (boolProperty(node, "throwOnError", true) && result.exitCode !== 0) {
        throw new Error(
          `Shell exited with ${result.exitCode}: ${result.stderr}`,
        );
      }
      return { output: result };
    }
    case "script": {
      const code = property(node, "code", variables);
      if (!code) throw new Error("script node is missing code.");
      const result = await executeWorkflowScript(
        code,
        Object.fromEntries(variables),
        Number(node.properties.timeout) || 10_000,
      );
      save(variables, node.properties.saveTo, result);
      return { output: result };
    }
    case "mcp": {
      const url = property(node, "url", variables);
      const tool = property(node, "tool", variables);
      if (!url || !tool) throw new Error("mcp node requires url and tool.");
      const args = node.properties.args
        ? JSON.parse(property(node, "args", variables)) as Record<
          string,
          unknown
        >
        : {};
      const headers = node.properties.headers
        ? JSON.parse(property(node, "headers", variables)) as Record<
          string,
          string
        >
        : {};
      const result = await callMcpTool(url, tool, args, headers);
      save(variables, node.properties.saveTo, result.value);
      const mcpAppInfo = result.app
        ? {
          title: result.app.title,
          html: result.app.html,
          toolResult: result.app.toolResult,
          serverUrl: url,
          serverHeaders: headers,
        }
        : undefined;
      if (node.properties.saveUiTo && mcpAppInfo) {
        save(variables, node.properties.saveUiTo, {
          ...mcpAppInfo,
          hasUi: true,
        });
      }
      if (result.app) await showWorkflowMcpApp(result.app);
      return { output: result.value, mcpAppInfo };
    }
    default:
      throw new Error(`${node.type} node is not migrated yet.`);
  }
}

export async function executeWorkflow(
  workflow: Workflow,
  workflowPath: string,
  services: WorkflowExecutionServices,
  initial?: WorkflowVariables,
): Promise<WorkflowRun> {
  services.runtime ??= { cliSessionIds: {} };
  const workflowName = workflowNameFromPath(workflow.name, workflowPath);
  const variables = nowVariables(workflowName);
  if (initial) {
    for (const [key, value] of initial) {
      variables.set(key, value);
    }
  }
  const run: WorkflowRun = {
    id: crypto.randomUUID(),
    workflowPath,
    workflowName,
    startTime: new Date().toISOString(),
    status: "running",
    logs: [],
    variables: {},
  };
  const log = (entry: WorkflowLog) => {
    run.logs.push(entry);
    services.onLog?.(entry);
  };
  let current = services.startNodeId ?? workflow.startNode;
  let iterations = 0;
  try {
    while (current && iterations++ < 1000) {
      if (services.signal?.aborted) {
        throw new DOMException("Workflow stopped", "AbortError");
      }
      const node = workflow.nodes.get(current);
      if (!node) throw new Error(`Node not found: ${current}`);
      const started = performance.now();
      const variablesSnapshot = Object.fromEntries(variables);
      const input = Object.fromEntries(
        Object.entries(node.properties).map((
          [key, value],
        ) => [key, replaceWorkflowVariables(value, variables)]),
      );
      log({
        nodeId: node.id,
        nodeType: node.type,
        message: `Running ${node.type}`,
        timestamp: new Date().toISOString(),
        status: "info",
        input,
        variablesSnapshot,
      });
      try {
        const result = await executeNode(node, variables, services);
        log({
          nodeId: node.id,
          nodeType: node.type,
          message: "Completed",
          timestamp: new Date().toISOString(),
          status: "success",
          input,
          output: result.output,
          mcpAppInfo: result.mcpAppInfo,
          usage: result.usage,
          elapsedMs: Math.round(performance.now() - started),
          variablesSnapshot,
        });
        current = nextWorkflowNode(workflow, current, result.condition);
      } catch (caught) {
        if (caught instanceof WorkflowRegenerateRequest) {
          log({
            nodeId: node.id,
            nodeType: node.type,
            message: caught.message,
            timestamp: new Date().toISOString(),
            status: "info",
            input,
            elapsedMs: Math.round(performance.now() - started),
            variablesSnapshot,
          });
          current = caught.commandNodeId;
          continue;
        }
        log({
          nodeId: node.id,
          nodeType: node.type,
          message: caught instanceof Error ? caught.message : String(caught),
          timestamp: new Date().toISOString(),
          status: "error",
          input,
          elapsedMs: Math.round(performance.now() - started),
          variablesSnapshot,
        });
        throw caught;
      }
    }
    if (iterations >= 1000) {
      throw new Error("Workflow exceeded the 1000-step safety limit.");
    }
    run.status = "completed";
  } catch (caught) {
    run.status = caught instanceof DOMException && caught.name === "AbortError"
      ? "cancelled"
      : "error";
    run.error = caught instanceof Error ? caught.message : String(caught);
  }
  run.endTime = new Date().toISOString();
  run.variables = Object.fromEntries(variables);
  return run;
}
