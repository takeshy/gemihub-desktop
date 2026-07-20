import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  Brain,
  Check,
  Database,
  FileCode2,
  FileText,
  LayoutDashboard,
  Library,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings2,
  Square,
  Workflow as WorkflowIcon,
  Wrench,
  X,
} from "lucide-react";
import { MarkdownPreview } from "../components/MarkdownPreview";
import {
  applyPendingFileAction,
  cancelChat,
  chat,
  type ChatMessage,
  type ChatStreamEvent,
  listWorkspaceFiles,
  onChatFunctionLimitRequest,
  onChatStream,
  onChatToolRequest,
  type PendingFileAction,
  type RAGSearchResult,
  readFile,
  readWorkspaceFile,
  readWorkspaceStateFile,
  resolveChatFunctionLimit,
  resolveChatTool,
  searchRAG,
  stopCLI,
  writeWorkspaceStateFile,
} from "../lib/wailsBackend";
import {
  buildSkillSystemPrompt,
  collectSkillWorkflows,
  discoverWorkspaceSkills,
  loadActiveSkillContents,
  skillWorkflowTool,
  type WorkspaceSkill,
} from "../skills/skills";
import {
  builtinFolderPath,
  contextualBuiltinFolderPath,
  DEFAULT_BUILTIN_SKILL_IDS,
  isBuiltinSkillPath,
} from "../skills/builtinSkills";
import { executeWorkflow } from "../workflow/executor";
import { appendWorkflowHistory } from "../workflow/history";
import { parseWorkflowFile } from "../workflow/parser";
import {
  getWorkflowNodeSpec,
  getWorkflowSpecTool,
} from "../workflow/workflowSpec";
import { discoverMcpHttpTools, McpHttpClient } from "../mcp/httpClient";
import { discoverMcpStdioTools, McpStdioClient } from "../mcp/stdioClient";
import { mcpAppInfoFromResult } from "../mcp/appInfo";
import { isEncryptedFile } from "../lib/hybridEncryption";
import {
  decryptHistoryPayload,
  encryptHistoryPayload,
  historyEncryptionPreferences,
  historySessionPassword,
} from "../lib/historyEncryption";
import { McpAppRenderer } from "../mcp/McpAppRenderer";
import {
  buildOkfSystemPrompt,
  discoverOkfBundles,
  fetchOkfDocument,
  getBuiltinOkfBundle,
  type OkfBundle,
  okfDocumentTool,
} from "../okf/okf";
import { OkfSelector } from "../okf/OkfSelector";
import {
  type ChatProvider,
  type ChatSettings,
  chatThinkingCapabilities,
  cliNames,
  type CLIType,
  configuredChatProviders,
  configuredModelOptions,
  type FileToolMode,
  resolveRAGSetting,
  selectConfiguredModel,
  selectedModelOptionKey,
  type SlashCommand,
} from "./settings";
import { type ActiveSelection, formatActiveSelection } from "./selection";
import { type FileRef, fileRef } from "../lib/fileRef";
import {
  type GroundingSource,
  groundingSourceLabel,
  groundingSources,
} from "./grounding";
import type { PluginSlashCommand } from "../plugins/types";

const CHAT_HISTORY_STATE_FILE = "chat-history";
const initializedHistoryScopes = new Set<string>();

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  cliSessionIds: Partial<Record<CLIType, string>>;
  activeSkillPaths: string[];
  dismissedContextSkillPaths: string[];
  activeOkfBundleIds: string[];
  activeMcpServerNames: string[] | null;
  createdAt: number;
  updatedAt: number;
}

interface StoredChatHistory {
  activeSessionId: string;
  sessions: ChatSession[];
}

interface AttachedFile {
  path: string;
  content: string;
  automatic?: boolean;
  rag?: boolean;
}

const providerNames: Record<ChatProvider, string> = {
  openai: "OpenAI / Compatible",
  gemini: "Google Gemini",
  vertex: "Vertex AI",
  anthropic: "Anthropic",
  cli: "Local agent",
};

const toolNames: Record<string, string> = {
  read_file: "Read file",
  read_note: "Read skill file",
  search_files: "Search files",
  list_files: "List files",
  propose_file_edit: "Edit file",
  create_note: "Create skill file",
  propose_file_rename: "Rename file",
  shell: "Shell",
  file_change: "File change",
  web_search: "Web search",
  image_view: "View image",
  run_skill_workflow: "Skill workflow",
};

function assistantLabel(message: ChatMessage): string {
  const provider = message.provider && message.provider in providerNames
    ? providerNames[message.provider as ChatProvider]
    : message.provider;
  const cliModel =
    message.provider === "cli" && message.model && message.model in cliNames
      ? cliNames[message.model as CLIType]
      : message.model;
  if (provider && cliModel) return `${provider} · ${cliModel}`;
  return cliModel || provider || "AI";
}

function formatUsage(message: ChatMessage): string {
  const usage = message.usage;
  if (!usage) return "";
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) {
    parts.push(`Input ${usage.inputTokens.toLocaleString()}`);
  }
  if (usage.outputTokens !== undefined) {
    parts.push(`Output ${usage.outputTokens.toLocaleString()}`);
  }
  if (usage.thinkingTokens !== undefined) {
    parts.push(`Thinking ${usage.thinkingTokens.toLocaleString()}`);
  }
  if (usage.totalTokens !== undefined) {
    parts.push(`Total ${usage.totalTokens.toLocaleString()}`);
  }
  if (usage.cachedTokens) {
    parts.push(`Cached ${usage.cachedTokens.toLocaleString()}`);
  }
  if (usage.toolUseTokens) {
    parts.push(`Tools ${usage.toolUseTokens.toLocaleString()}`);
  }
  return parts.join(" · ");
}

function sessionID(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function supportsNativeWebSearch(settings: ChatSettings): boolean {
  if (settings.provider === "gemini" || settings.provider === "vertex") {
    return true;
  }
  if (settings.provider === "cli") return false;
  if (
    /^(?:dall-e|gpt-image|grok-imagine-(?:image|video))/i.test(settings.model)
  ) {
    return false;
  }
  try {
    const host = new URL(settings.endpoint).hostname.toLowerCase();
    if (settings.provider === "anthropic") return host === "api.anthropic.com";
    return host === "api.openai.com" || host === "api.x.ai";
  } catch {
    return false;
  }
}

function newSession(messages: ChatMessage[] = []): ChatSession {
  const now = Date.now();
  return {
    id: sessionID(),
    title: "New chat",
    messages,
    cliSessionIds: {},
    activeSkillPaths: DEFAULT_BUILTIN_SKILL_IDS.map((id) =>
      `${builtinFolderPath(id)}/SKILL.md`
    ),
    dismissedContextSkillPaths: [],
    activeOkfBundleIds: [],
    activeMcpServerNames: [],
    createdAt: now,
    updatedAt: now,
  };
}

function sessionsForAppStart(
  scope: string,
  stored: StoredChatHistory,
): StoredChatHistory {
  if (initializedHistoryScopes.has(scope)) return stored;
  initializedHistoryScopes.add(scope);

  const onlySession = stored.sessions.length === 1 ? stored.sessions[0] : null;
  if (onlySession?.messages.length === 0 && onlySession.title === "New chat") {
    return {
      activeSessionId: onlySession.id,
      sessions: [{ ...onlySession, activeMcpServerNames: [] }],
    };
  }

  const created = newSession();
  return {
    activeSessionId: created.id,
    sessions: [created, ...stored.sessions],
  };
}

function normalizeSessions(value: unknown): ChatSession[] {
  if (!Array.isArray(value) || !value.length) return [newSession()];
  return (value as ChatSession[]).map((session) => ({
    ...session,
    activeSkillPaths: Array.isArray(session.activeSkillPaths)
      ? session.activeSkillPaths
      : DEFAULT_BUILTIN_SKILL_IDS.map((id) =>
        `${builtinFolderPath(id)}/SKILL.md`
      ),
    dismissedContextSkillPaths:
      Array.isArray(session.dismissedContextSkillPaths)
        ? session.dismissedContextSkillPaths.filter((path): path is string =>
          typeof path === "string"
        )
        : [],
    activeOkfBundleIds: Array.isArray(session.activeOkfBundleIds)
      ? session.activeOkfBundleIds.filter((id): id is string =>
        typeof id === "string"
      )
      : [],
    activeMcpServerNames: Array.isArray(session.activeMcpServerNames)
      ? session.activeMcpServerNames.filter((name): name is string =>
        typeof name === "string"
      )
      : null,
  }));
}

async function loadStoredSessions(): Promise<StoredChatHistory> {
  const raw = await readWorkspaceStateFile(CHAT_HISTORY_STATE_FILE);
  if (!raw) {
    const sessions = [newSession()];
    return { activeSessionId: sessions[0].id, sessions };
  }
  let content = raw;
  if (isEncryptedFile(raw)) {
    const password = historySessionPassword() ||
      prompt("Chat history is encrypted. Enter the history password.") || "";
    if (!password) throw new Error("Chat history remains locked.");
    content = await decryptHistoryPayload(raw, password);
  }
  const parsed = JSON.parse(content) as Partial<StoredChatHistory>;
  const sessions = normalizeSessions(parsed.sessions);
  return {
    activeSessionId: typeof parsed.activeSessionId === "string"
      ? parsed.activeSessionId
      : sessions[0].id,
    sessions,
  };
}

function titleFrom(text: string): string {
  const firstLine = text.replace(/\s+/g, " ").trim();
  return firstLine.length > 38
    ? `${firstLine.slice(0, 38)}…`
    : firstLine || "New chat";
}

function contextMessage(text: string, files: AttachedFile[]): string {
  const textFiles = files.filter((file) => !file.content.startsWith("data:"));
  if (textFiles.length === 0) return text;
  const context = textFiles.map((file) =>
    `\n--- BEGIN FILE: ${file.path} ---\n${file.content}\n--- END FILE: ${file.path} ---`
  ).join("\n");
  return `${text}\n\nThe following Workspace files are attached as context:${context}`;
}

function attachedChatAttachments(files: AttachedFile[]) {
  return files.flatMap((file) => {
    const match = file.content.match(/^data:([^;,]+);base64,([\s\S]+)$/);
    return match
      ? [{
        name: file.path.split("/").at(-1) || file.path,
        mimeType: match[1],
        data: match[2],
      }]
      : [];
  });
}

function semanticRAGContext(results: RAGSearchResult[]): string {
  if (results.length === 0) return "";
  return `\n\n--- Relevant context from Workspace (semantic search) ---\n${
    results.map((result) =>
      `\n[Source: ${result.filePath}] (relevance: ${
        result.score.toFixed(3)
      })\n${result.text}\n`
    ).join("")
  }\n--- End of context ---\n`;
}

function resolveSlashCommand(
  text: string,
  commands: SlashCommand[],
  activeContent = "",
  selection: ActiveSelection | null = null,
): string {
  const match = text.match(/^\/([a-z0-9_-]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return text;
  const command = commands.find((item) =>
    item.name.toLowerCase() === match[1].toLowerCase()
  );
  if (!command) return text;
  const argument = match[2]?.trim() ?? "";
  const hasVariable = /\{(?:selection|input)\}/.test(command.promptTemplate);
  const resolved = command.promptTemplate.replaceAll("{content}", activeContent)
    .replaceAll(
      "{selection}",
      selection ? formatActiveSelection(selection) : argument,
    ).replaceAll("{input}", argument);
  return !hasVariable && argument ? `${resolved}\n\n${argument}` : resolved;
}

async function processSkillMarkers(
  content: string,
  skills: WorkspaceSkill[],
  runWorkflow: (
    workflowId: string,
    variables: unknown,
  ) => Promise<Record<string, unknown>>,
): Promise<{ display: string; followUp?: string; toolsUsed: string[] }> {
  let display = content;
  const results: string[] = [], toolsUsed: string[] = [];
  for (const match of [...content.matchAll(/\[READ_SKILL:\s*(.+?)\]/g)]) {
    const requested = match[1].trim().toLowerCase();
    const skill = skills.find((item) =>
      item.name.toLowerCase() === requested ||
      (item.folderPath.split("/").pop() || "").toLowerCase() === requested
    );
    const value = skill
      ? `Skill "${skill.name}" instructions:\n${skill.instructions}`
      : `Unknown skill: ${match[1].trim()}. Available: ${
        skills.map((item) => item.name).join(", ")
      }`;
    display = display.replace(
      match[0],
      skill
        ? `**Skill loaded: ${skill.name}**`
        : `**Skill read failed: ${match[1].trim()}**`,
    );
    results.push(value);
  }
  for (
    const match of [
      ...content.matchAll(/\[RUN_WORKFLOW:\s*(.+?)\](?:\((\{[\s\S]*?\})\))?/g),
    ]
  ) {
    const workflowId = match[1].trim();
    let variables: unknown = match[2] || "";
    if (typeof variables === "string" && variables) {
      try {
        variables = JSON.parse(variables);
      } catch { /* runtime returns a useful invalid-input error */ }
    }
    const result = await runWorkflow(workflowId, variables);
    const resultText = JSON.stringify(result, null, 2);
    display = display.replace(
      match[0],
      `**Workflow executed: ${workflowId}**\n\`\`\`json\n${resultText}\n\`\`\``,
    );
    results.push(
      `Workflow "${workflowId}" result:\n\`\`\`json\n${resultText}\n\`\`\``,
    );
    toolsUsed.push("run_skill_workflow");
  }
  return {
    display,
    followUp: results.length
      ? `Tool execution results:\n\n${
        results.join("\n\n")
      }\n\nContinue from these results. Call another workflow only if required, otherwise give the final answer.`
      : undefined,
    toolsUsed,
  };
}

export function ChatPanel({
  isDark,
  directoryBase,
  workspaceBase,
  settings,
  onSettingsChange,
  activeFile,
  activeSelection,
  draftRequest,
  externalAttachments,
  pluginCommands = [],
  onOpenSettings,
  onOpenFile,
  onOpenWorkflow,
}: {
  isDark: boolean;
  directoryBase: string;
  workspaceBase: string;
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  activeFile: { path: string; content: string } | null;
  activeSelection: ActiveSelection | null;
  draftRequest?: { id: number; text: string };
  externalAttachments?: {
    id: number;
    files: Array<{ path: string; content: string; rag?: boolean }>;
  };
  pluginCommands?: PluginSlashCommand[];
  onOpenSettings: () => void;
  onOpenFile: (file: FileRef) => void;
  onOpenWorkflow: (file: FileRef) => void;
}) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [newSession()]);
  const [loadedHistoryScope, setLoadedHistoryScope] = useState<string | null>(
    null,
  );
  const [sessionsLocked, setSessionsLocked] = useState(false);
  const [activeID, setActiveID] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingFileAction | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [fileQuery, setFileQuery] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skills, setSkills] = useState<WorkspaceSkill[]>([]);
  const [okfBundles, setOkfBundles] = useState<OkfBundle[]>([]);

  useEffect(() => {
    if (settings.webSearchEnabled && !supportsNativeWebSearch(settings)) {
      onSettingsChange({ ...settings, webSearchEnabled: false });
    }
  }, [
    settings.provider,
    settings.endpoint,
    settings.model,
    settings.webSearchEnabled,
    onSettingsChange,
  ]);
  const [dismissedAutomaticPath, setDismissedAutomaticPath] = useState<
    string | null
  >(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef(false);
  const activeRunControllerRef = useRef<AbortController | null>(null);
  const streamRef = useRef<
    { streamId: string; sessionId: string; messageId: string } | null
  >(null);
  const streamQueueRef = useRef<ChatStreamEvent[]>([]);
  const streamTimerRef = useRef<number | null>(null);
  const skillMenuRef = useRef<HTMLDivElement | null>(null);
  const toolMenuRef = useRef<HTMLDivElement | null>(null);
  const filePickerRef = useRef<HTMLDivElement | null>(null);
  const filePickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!draftRequest?.id || !draftRequest.text) return;
    setInput(draftRequest.text);
    queueMicrotask(() => composerRef.current?.focus());
  }, [draftRequest?.id, draftRequest?.text]);

  const activeSession = sessions.find((session) => session.id === activeID) ??
    sessions[0];
  const messages = activeSession?.messages ?? [];
  const activeSkillPaths = activeSession?.activeSkillPaths ?? [];
  const dismissedContextSkillPaths =
    activeSession?.dismissedContextSkillPaths ?? [];
  const activeOkfBundleIds = activeSession?.activeOkfBundleIds ?? [];
  const activeOkfBundleIdsRef = useRef(activeOkfBundleIds);
  activeOkfBundleIdsRef.current = activeOkfBundleIds;
  const setActiveSkillPaths = useCallback(
    (update: string[] | ((paths: string[]) => string[])) => {
      if (!activeSession) return;
      setSessions((current) =>
        current.map((session) =>
          session.id !== activeSession.id ? session : {
            ...session,
            activeSkillPaths: typeof update === "function"
              ? update(session.activeSkillPaths ?? [])
              : update,
            updatedAt: Date.now(),
          }
        )
      );
    },
    [activeSession?.id],
  );
  const setDismissedContextSkillPaths = useCallback(
    (update: string[] | ((paths: string[]) => string[])) => {
      if (!activeSession) return;
      setSessions((current) =>
        current.map((session) =>
          session.id !== activeSession.id ? session : {
            ...session,
            dismissedContextSkillPaths: typeof update === "function"
              ? update(session.dismissedContextSkillPaths ?? [])
              : update,
            updatedAt: Date.now(),
          }
        )
      );
    },
    [activeSession?.id],
  );
  const setActiveOkfBundleIds = useCallback(
    (update: string[] | ((ids: string[]) => string[])) => {
      if (!activeSession) return;
      setSessions((current) =>
        current.map((session) =>
          session.id !== activeSession.id ? session : {
            ...session,
            activeOkfBundleIds: typeof update === "function"
              ? update(session.activeOkfBundleIds ?? [])
              : update,
            updatedAt: Date.now(),
          }
        )
      );
    },
    [activeSession?.id],
  );
  const setActiveMcpServerNames = useCallback(
    (
      update: string[] | null | ((names: string[] | null) => string[] | null),
    ) => {
      if (!activeSession) return;
      setSessions((current) =>
        current.map((session) =>
          session.id !== activeSession.id ? session : {
            ...session,
            activeMcpServerNames: typeof update === "function"
              ? update(session.activeMcpServerNames ?? null)
              : update,
            updatedAt: Date.now(),
          }
        )
      );
    },
    [activeSession?.id],
  );
  const draftWithDashboardSkill = useCallback((draft: string) => {
    const skillPath = `${builtinFolderPath("dashboard")}/SKILL.md`;
    setActiveSkillPaths((paths) =>
      paths.includes(skillPath) ? paths : [...paths, skillPath]
    );
    setInput(draft);
    queueMicrotask(() => composerRef.current?.focus());
  }, [setActiveSkillPaths]);
  const askDesktopHelp = useCallback(() => {
    const builtin = getBuiltinOkfBundle();
    setActiveOkfBundleIds((ids) =>
      ids.includes(builtin.id) ? ids : [...ids, builtin.id]
    );
    setInput("How do I use GemiHub Desktop?");
    queueMicrotask(() => composerRef.current?.focus());
  }, [setActiveOkfBundleIds]);
  const refreshOkfBundles = useCallback(async () => {
    const builtin = getBuiltinOkfBundle();
    if (!workspaceBase) {
      setOkfBundles([builtin]);
      return;
    }
    try {
      const discovered = await discoverOkfBundles(
        settings.okfRoot || "Knowledge",
      );
      const otherBundles = discovered.filter((bundle) =>
        !/^gemihub(?:\s+(?:desktop\s+)?(?:okf|help))?$/i.test(
          bundle.name.trim(),
        )
      );
      setOkfBundles([builtin, ...otherBundles]);
    } catch {
      setOkfBundles([builtin]);
    }
  }, [workspaceBase, settings.okfRoot]);
  const configuredProviders = configuredChatProviders(settings);
  const thinkingModelKey = `${settings.provider}:${settings.model}`;
  const { available: thinkingAvailable, required: thinkingRequired } =
    chatThinkingCapabilities(settings.provider, settings.model);
  const thinkingEnabled = thinkingRequired ||
    settings.thinkingEnabledModels.includes(thinkingModelKey);
  const selectedSkills = useMemo(
    () =>
      skills.filter((skill) => activeSkillPaths.includes(skill.skillFilePath)),
    [activeSkillPaths, skills],
  );
  const contextBuiltinPath = useMemo(
    () => contextualBuiltinFolderPath(activeFile?.path),
    [activeFile?.path],
  );
  const activeSkills = useMemo(() => {
    if (!contextBuiltinPath) return selectedSkills;
    const context = skills.find((skill) =>
      skill.folderPath === contextBuiltinPath
    );
    if (
      context &&
      dismissedContextSkillPaths.includes(context.skillFilePath) &&
      !activeSkillPaths.includes(context.skillFilePath)
    ) return selectedSkills;
    return [
      ...(context ? [context] : []),
      ...selectedSkills.filter((skill) =>
        !isBuiltinSkillPath(skill.folderPath)
      ),
    ];
  }, [
    activeSkillPaths,
    contextBuiltinPath,
    dismissedContextSkillPaths,
    selectedSkills,
    skills,
  ]);
  const activeMcpServers = useMemo(() => {
    const selectedNames = activeSession?.activeMcpServerNames;
    if (
      settings.provider === "cli" || /(?:image|imagen)/i.test(settings.model)
    ) {
      return [];
    }
    return settings.mcpServers.filter((server) =>
      server.enabled && server.verified &&
      (selectedNames == null || selectedNames.includes(server.name))
    );
  }, [
    activeSession?.activeMcpServerNames,
    settings.mcpServers,
    settings.model,
    settings.provider,
  ]);
  const skillWorkflows = useMemo(() => collectSkillWorkflows(activeSkills), [
    activeSkills,
  ]);
  const skillWorkflowsRef = useRef(skillWorkflows);
  skillWorkflowsRef.current = skillWorkflows;
  const filteredPaths = useMemo(() => {
    const query = fileQuery.trim().toLowerCase();
    return filePaths.filter((path) =>
      !query || path.toLowerCase().includes(query)
    ).slice(0, 100);
  }, [filePaths, fileQuery]);
  const slashMatches = useMemo(() => {
    const match = input.match(/^\/([^\s]*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    return [...settings.slashCommands, ...pluginCommands].filter((command) =>
      command.name.toLowerCase().startsWith(query)
    ).slice(0, 8);
  }, [input, pluginCommands, settings.slashCommands]);
  const mentionMatches = useMemo(() => {
    const match = input.match(/(?:^|\s)@(?:"([^"]*)|([^\s]*))$/);
    if (!match) return [];
    const query = (match[1] || match[2] || "").toLowerCase();
    return filePaths.filter((path) => path.toLowerCase().includes(query)).slice(
      0,
      8,
    );
  }, [filePaths, input]);
  const skillSlashMatches = useMemo(() => {
    const match = input.match(/^\/([^\s]*)$/);
    if (!match) return [];
    const query = match[1].toLowerCase();
    return skills.filter((skill) =>
      (skill.folderPath.split("/").pop() || "").toLowerCase().startsWith(query)
    ).slice(0, 8);
  }, [input, skills]);

  useEffect(() => {
    if (
      sessions.length > 0 &&
      !sessions.some((session) => session.id === activeID)
    ) setActiveID(sessions[0].id);
  }, [activeID, sessions]);

  useEffect(() => {
    void refreshOkfBundles();
  }, [refreshOkfBundles]);
  useEffect(() => {
    const refresh = () => void refreshOkfBundles();
    window.addEventListener("llm-hub:file-tree-refresh", refresh);
    return () =>
      window.removeEventListener("llm-hub:file-tree-refresh", refresh);
  }, [refreshOkfBundles]);

  useEffect(() => {
    if (!skillMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!skillMenuRef.current?.contains(event.target as Node)) {
        setSkillMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSkillMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [skillMenuOpen]);

  useEffect(() => {
    if (!toolMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!toolMenuRef.current?.contains(event.target as Node)) {
        setToolMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToolMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [toolMenuOpen]);

  useEffect(() => {
    if (!filePickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !filePickerRef.current?.contains(target) &&
        !filePickerButtonRef.current?.contains(target)
      ) {
        setFilePickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilePickerOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filePickerOpen]);

  useEffect(() => {
    let cancelled = false;
    const scope = workspaceBase || "__session__";
    setLoadedHistoryScope(null);
    void loadStoredSessions().then((stored) => {
      if (!cancelled) {
        const initial = sessionsForAppStart(scope, stored);
        setSessions(initial.sessions);
        setActiveID(initial.activeSessionId);
        setSessionsLocked(false);
        setLoadedHistoryScope(scope);
      }
    }).catch((caught) => {
      if (!cancelled) {
        setSessionsLocked(true);
        setError(caught instanceof Error ? caught.message : String(caught));
        setLoadedHistoryScope(scope);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceBase]);

  useEffect(() => {
    const scope = workspaceBase || "__session__";
    if (loadedHistoryScope !== scope || sessionsLocked) return;
    const serialized = JSON.stringify({
      activeSessionId: activeID,
      sessions: sessions.map((session) => ({
        ...session,
        messages: session.messages.slice(-100),
      })),
    });
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (historyEncryptionPreferences().chat) {
        void encryptHistoryPayload(serialized, "chat-history").then(
          (encrypted) => {
            if (!cancelled) {
              return writeWorkspaceStateFile(
                CHAT_HISTORY_STATE_FILE,
                encrypted,
              );
            }
          },
        ).catch((caught) =>
          setError(caught instanceof Error ? caught.message : String(caught))
        );
      } else {void writeWorkspaceStateFile(CHAT_HISTORY_STATE_FILE, serialized)
          .catch((caught) =>
            setError(caught instanceof Error ? caught.message : String(caught))
          );}
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeID, loadedHistoryScope, workspaceBase, sessions, sessionsLocked]);

  useEffect(() => {
    const changed = () => setSessions((current) => [...current]);
    const unlocked = () => {
      void loadStoredSessions().then((stored) => {
        const scope = workspaceBase || "__session__";
        const initial = sessionsForAppStart(scope, stored);
        setSessions(initial.sessions);
        setActiveID(initial.activeSessionId);
        setSessionsLocked(false);
        setError("");
      });
    };
    window.addEventListener("llm-hub:history-encryption-changed", changed);
    window.addEventListener("llm-hub:history-encryption-unlocked", unlocked);
    return () => {
      window.removeEventListener("llm-hub:history-encryption-changed", changed);
      window.removeEventListener(
        "llm-hub:history-encryption-unlocked",
        unlocked,
      );
    };
  }, [workspaceBase]);

  useEffect(() => {
    setPending(null);
    setError("");
    setAttachedFiles((current) => current.filter((file) => file.automatic));
    setDismissedAutomaticPath(null);
  }, [activeSession?.id]);

  useEffect(() => {
    setAttachedFiles((current) => {
      const withoutAutomatic = current.filter((file) => !file.automatic);
      if (
        !activeFile || activeFile.path === dismissedAutomaticPath ||
        withoutAutomatic.some((file) => file.path === activeFile.path)
      ) return withoutAutomatic;
      return [...withoutAutomatic, { ...activeFile, automatic: true }];
    });
  }, [activeFile, dismissedAutomaticPath]);

  useEffect(() => {
    if (!externalAttachments?.id || !externalAttachments.files.length) return;
    setAttachedFiles((current) => {
      const retained = externalAttachments.files.some((file) => file.rag)
        ? current.filter((file) => !file.rag)
        : current;
      const paths = new Set(retained.map((file) => file.path));
      return [
        ...retained,
        ...externalAttachments.files.filter((file) => !paths.has(file.path)),
      ];
    });
  }, [externalAttachments?.id]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void discoverWorkspaceSkills().then((found) => {
        if (!cancelled) setSkills(found);
      }).catch(() => {
        if (!cancelled) setSkills([]);
      });
    refresh();
    window.addEventListener("llm-hub:file-tree-refresh", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("llm-hub:file-tree-refresh", refresh);
    };
  }, [workspaceBase]);

  const runSkillWorkflow = useCallback(
    async (
      workflowId: string,
      rawVariables: unknown,
    ): Promise<Record<string, unknown>> => {
      const currentWorkflows = skillWorkflowsRef.current;
      const entry = currentWorkflows.get(workflowId);
      if (!entry) {
        return {
          error: `Unknown workflow ID: ${workflowId}. Available: ${
            [...currentWorkflows.keys()].join(", ")
          }`,
        };
      }
      try {
        const file = await readWorkspaceFile(entry.workflowPath);
        if (!file) {
          throw new Error(`Workflow file not found: ${entry.workflowPath}`);
        }
        const workflow = parseWorkflowFile(file.content, entry.workflowPath);
        let parsedVariables: Record<string, unknown> = {};
        if (typeof rawVariables === "string" && rawVariables.trim()) {
          parsedVariables = JSON.parse(rawVariables) as Record<string, unknown>;
        } else if (
          rawVariables && typeof rawVariables === "object" &&
          !Array.isArray(rawVariables)
        ) parsedVariables = rawVariables as Record<string, unknown>;
        const initial = new Map<string, string | number>();
        for (const [key, value] of Object.entries(parsedVariables)) {
          initial.set(
            key,
            typeof value === "number"
              ? value
              : typeof value === "string"
              ? value
              : JSON.stringify(value),
          );
        }
        const run = await executeWorkflow(workflow, entry.workflowPath, {
          chatSettings: settings,
          activeFile,
          openFile: onOpenFile,
          interactionMode: "panel",
          signal: activeRunControllerRef.current?.signal,
          loadWorkflow: async (path) => {
            const nested = await readWorkspaceFile(path);
            if (!nested) throw new Error(`Workflow file not found: ${path}`);
            return parseWorkflowFile(nested.content, path);
          },
        }, initial);
        await appendWorkflowHistory(run, workspaceBase);
        if (run.status !== "completed") {
          return {
            error: `Workflow execution failed: ${
              run.error || run.status
            }. Do not retry automatically; report the error to the user.`,
            workflowId,
            workflowPath: entry.workflowPath,
          };
        }
        const variables = Object.fromEntries(
          Object.entries(run.variables).filter(([key]) =>
            !key.startsWith("__")
          ),
        );
        const logs = run.logs.filter((log) => log.status !== "info").map((
          log,
        ) => ({
          node: log.nodeType,
          status: log.status,
          message: log.message,
        }));
        return { success: true, workflowId, variables, logs };
      } catch (caught) {
        return {
          error: `Workflow execution failed: ${
            caught instanceof Error ? caught.message : String(caught)
          }. Do not retry automatically; report the error to the user.`,
          workflowId,
          workflowPath: entry.workflowPath,
        };
      }
    },
    [activeFile, directoryBase, onOpenFile, workspaceBase, settings],
  );

  useEffect(() =>
    onChatToolRequest((request) => {
      if (
        !request.streamId || request.streamId !== streamRef.current?.streamId
      ) return;
      if (request.name === "get_workflow_spec") {
        const models = configuredModelOptions(settings).map((option) =>
          option.label
        );
        void resolveChatTool(request.requestId, {
          result: getWorkflowNodeSpec(request.arguments.nodeTypes, {
            models,
            ragSettings: Object.keys(settings.ragSettings),
            mcpServers: settings.mcpServers.filter((server) => server.enabled)
              .map((server) => server.name),
          }),
        });
        return;
      }
      if (request.name === "read_okf_document") {
        const bundleId = typeof request.arguments.bundleId === "string"
          ? request.arguments.bundleId
          : "";
        const path = typeof request.arguments.path === "string"
          ? request.arguments.path
          : "";
        void fetchOkfDocument(
          settings.okfRoot || "Knowledge",
          bundleId,
          path,
          activeOkfBundleIdsRef.current,
        ).then((doc) => {
          if (!doc) {
            return resolveChatTool(
              request.requestId,
              undefined,
              `Document not found or bundle not active: bundleId=${bundleId} path=${path}`,
            );
          }
          return resolveChatTool(request.requestId, doc);
        }).catch((caught) =>
          resolveChatTool(
            request.requestId,
            undefined,
            caught instanceof Error ? caught.message : String(caught),
          )
        );
        return;
      }
      if (request.name !== "run_skill_workflow") return;
      const workflowId = typeof request.arguments.workflowId === "string"
        ? request.arguments.workflowId
        : "";
      void runSkillWorkflow(workflowId, request.arguments.variables).then(
        (result) => {
          if (result.error && typeof result.workflowPath === "string") {
            const target = streamRef.current;
            if (target) {
              setSessions((current) =>
                current.map((session) =>
                  session.id !== target.sessionId ? session : {
                    ...session,
                    messages: session.messages.map((message) =>
                      message.id === target.messageId
                        ? {
                          ...message,
                          failedWorkflowPath: result.workflowPath as string,
                        }
                        : message
                    ),
                  }
                )
              );
            }
          }
          return resolveChatTool(request.requestId, result);
        },
      );
    }), [runSkillWorkflow, settings]);

  useEffect(() =>
    onChatFunctionLimitRequest((request) => {
      if (
        !request.streamId || request.streamId !== streamRef.current?.streamId
      ) {
        void resolveChatFunctionLimit(request.requestId, 0);
        return;
      }
      const input = window.prompt(
        `Tool calls are running low (${request.used}/${request.currentLimit} used, ${request.remaining} remaining).\nAdd more tool calls for this response?`,
        String(request.extensionAmount),
      );
      const extension = input === null ? 0 : Number.parseInt(input, 10);
      void resolveChatFunctionLimit(
        request.requestId,
        Number.isFinite(extension) && extension > 0 ? extension : 0,
      );
    }), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const flush = () => {
      streamTimerRef.current = null;
      const events = streamQueueRef.current.splice(0);
      const target = streamRef.current;
      if (!target || events.length === 0) return;
      setSessions((current) =>
        current.map((session) =>
          session.id !== target.sessionId ? session : {
            ...session,
            messages: session.messages.map((message) => {
              if (message.id !== target.messageId) return message;
              return events.reduce((next, event) => {
                if (event.type === "text" && event.delta) {
                  return { ...next, content: next.content + event.delta };
                }
                if (event.type === "thinking" && event.delta) {
                  return {
                    ...next,
                    thinking: (next.thinking ?? "") + event.delta,
                  };
                }
                if (event.type === "tool" && event.tool) {
                  return {
                    ...next,
                    toolsUsed: next.toolsUsed?.includes(event.tool)
                      ? next.toolsUsed
                      : [...(next.toolsUsed ?? []), event.tool],
                  };
                }
                if (event.type === "usage" && event.usage) {
                  return { ...next, usage: event.usage };
                }
                return next;
              }, message);
            }),
            updatedAt: Date.now(),
          }
        )
      );
    };
    const unsubscribe = onChatStream((event) => {
      if (streamRef.current?.streamId !== event.streamId) return;
      streamQueueRef.current.push(event);
      if (streamTimerRef.current === null) {
        streamTimerRef.current = window.setTimeout(flush, 40);
      }
    });
    return () => {
      unsubscribe();
      if (streamTimerRef.current !== null) {
        window.clearTimeout(streamTimerRef.current);
      }
    };
  }, []);

  const updateSession = (
    id: string,
    update: (session: ChatSession) => ChatSession,
  ) => {
    setSessions((current) =>
      current.map((session) => session.id === id ? update(session) : session)
    );
  };

  const createChat = () => {
    const created = newSession();
    setSessions((current) => [created, ...current]);
    setActiveID(created.id);
  };

  const deleteChat = () => {
    if (!activeSession) return;
    const remaining = sessions.filter((session) =>
      session.id !== activeSession.id
    );
    if (remaining.length > 0) {
      setSessions(remaining);
      setActiveID(remaining[0].id);
    } else {
      const created = newSession();
      setSessions([created]);
      setActiveID(created.id);
    }
  };

  const openFilePicker = async () => {
    setFilePickerOpen(true);
    if (filePaths.length > 0 || fileLoading) return;
    setFileLoading(true);
    try {
      const entries = await listWorkspaceFiles();
      setFilePaths(
        entries.filter((entry) => !entry.binary && entry.size <= 1024 * 1024)
          .map((entry) => entry.path),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setFileLoading(false);
    }
  };
  useEffect(() => {
    if (
      !/(?:^|\s)@(?:"[^"]*|[^\s]*)$/.test(input) || filePaths.length > 0 ||
      fileLoading
    ) return;
    void listWorkspaceFiles().then((entries) =>
      setFilePaths(
        entries.filter((entry) => !entry.binary && entry.size <= 1024 * 1024)
          .map((entry) => entry.path),
      )
    ).catch(() => undefined);
  }, [fileLoading, filePaths.length, input]);

  const attachFile = async (path: string) => {
    if (attachedFiles.some((file) => file.path === path)) {
      setFilePickerOpen(false);
      return;
    }
    try {
      const file = await readWorkspaceFile(path);
      if (file) {
        setAttachedFiles((
          current,
        ) => [...current, { path, content: file.content }]);
      }
      setFilePickerOpen(false);
      setFileQuery("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading || !activeSession) return;
    const skillInvocation = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
    const invokedPluginCommand = skillInvocation
      ? pluginCommands.find((command) =>
        command.name.toLowerCase() === skillInvocation[1].toLowerCase()
      )
      : undefined;
    if (invokedPluginCommand) {
      setLoading(true);
      setError("");
      try {
        const output = await invokedPluginCommand.execute(
          skillInvocation?.[2]?.trim() || "",
        );
        const now = Date.now();
        updateSession(activeSession.id, (session) => ({
          ...session,
          messages: [...session.messages, { role: "user", content: text }, {
            role: "assistant",
            content: String(output),
            toolsUsed: [`plugin:${invokedPluginCommand.pluginId}`],
          }],
          title: session.messages.length ? session.title : titleFrom(text),
          updatedAt: now,
        }));
        setInput("");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!configuredProviders.includes(settings.provider)) {
      setError(
        "Configure and verify an AI provider in Settings before sending.",
      );
      return;
    }
    const invokedSkill = skillInvocation
      ? skills.find((skill) =>
        (skill.folderPath.split("/").pop() || "").toLowerCase() ===
          skillInvocation[1].toLowerCase()
      )
      : undefined;
    const invokedCommand = !invokedSkill && skillInvocation
      ? settings.slashCommands.find((command) =>
        command.name.toLowerCase() === skillInvocation[1].toLowerCase()
      )
      : undefined;
    const skillMetadataAtSend = invokedSkill
      ? [
        ...activeSkills.filter((skill) =>
          skill.skillFilePath !== invokedSkill.skillFilePath
        ),
        invokedSkill,
      ]
      : activeSkills;
    let skillsAtSend = skillMetadataAtSend;
    skillWorkflowsRef.current = collectSkillWorkflows(skillMetadataAtSend);
    if (invokedSkill) {
      setActiveSkillPaths((
        paths,
      ) => [...new Set([...paths, invokedSkill.skillFilePath])]);
    }
    let promptText = invokedSkill
      ? skillInvocation?.[2]?.trim() ||
        `Use the ${invokedSkill.name} skill now. Follow its instructions and ask only for required inputs that cannot be inferred.`
      : resolveSlashCommand(
        text,
        settings.slashCommands,
        activeFile?.content || "",
        activeSelection,
      );
    const mentioned = [...text.matchAll(/(?:^|\s)@(?:"([^"]+)"|([^\s]+))/g)]
      .map((match) => match[1] || match[2]);
    for (const name of mentioned) {
      const path = filePaths.find((item) =>
        item === name || item.endsWith(`/${name}`)
      );
      if (!path) continue;
      const file = await readWorkspaceFile(path);
      if (file) {
        promptText +=
          `\n\n--- BEGIN REFERENCED FILE: ${path} ---\n${file.content}\n--- END REFERENCED FILE ---`;
      }
    }
    setLoading(true);
    setError("");
    let ragContext = "";
    let ragSources: GroundingSource[] = [];
    const legacyWebSearch = settings.selectedRagSetting === "__websearch__";
    const ragName = legacyWebSearch ? null : settings.selectedRagSetting;
    const webSearchEnabled = supportsNativeWebSearch(settings) &&
      (settings.webSearchEnabled || legacyWebSearch);
    const ragSetting = ragName ? settings.ragSettings[ragName] : undefined;
    const hasExplicitRAGContext = attachedFiles.some((file) => file.rag);
    if (ragName && ragSetting && workspaceBase && !hasExplicitRAGContext) {
      try {
        const results = await searchRAG(
          ragName,
          promptText,
          resolveRAGSetting(settings, ragSetting),
        );
        ragContext = semanticRAGContext(results);
        ragSources = groundingSources(results);
      } catch (caught) {
        setError(
          `RAG search failed: ${
            caught instanceof Error ? caught.message : String(caught)
          }`,
        );
      }
    }
    const displayMessage = {
      role: "user",
      content: text,
    } satisfies ChatMessage;
    const next = [...messages, displayMessage];
    const binaryAttachments = attachedChatAttachments(attachedFiles);
    const requestMessages = [...messages, {
      ...displayMessage,
      content: contextMessage(promptText + ragContext, attachedFiles),
      attachments: binaryAttachments.length ? binaryAttachments : undefined,
    }];
    const sessionIDAtSend = activeSession.id;
    const nativeSessionID = activeSession.cliSessionIds[settings.cliType] ?? "";
    const providerAtSend = settings.provider;
    const modelAtSend = settings.provider === "cli"
      ? cliNames[settings.cliType]
      : settings.model;
    const streamId = sessionID();
    const assistantMessageId = sessionID();
    const startedAt = performance.now();
    streamQueueRef.current = [];
    if (streamTimerRef.current !== null) {
      window.clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    streamRef.current = {
      streamId,
      sessionId: sessionIDAtSend,
      messageId: assistantMessageId,
    };
    const placeholder = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      provider: providerAtSend,
      model: modelAtSend,
      ragUsed: ragContext.length > 0,
      ragSources: ragSources.length ? ragSources : undefined,
      thinkingEnabled: thinkingAvailable ? thinkingEnabled : undefined,
    } satisfies ChatMessage;
    updateSession(
      sessionIDAtSend,
      (session) => ({
        ...session,
        title: session.messages.length === 0 ? titleFrom(text) : session.title,
        messages: [...next, placeholder],
        updatedAt: Date.now(),
      }),
    );
    setInput("");
    setAttachedFiles([]);
    setPending(null);
    abortRef.current = false;
    const runController = new AbortController();
    activeRunControllerRef.current = runController;
    let releaseMcp = async () => undefined;
    try {
      skillsAtSend = await loadActiveSkillContents(skillMetadataAtSend);
      skillWorkflowsRef.current = collectSkillWorkflows(skillsAtSend);
      const okfPrompt = await buildOkfSystemPrompt(
        settings.okfRoot || "Knowledge",
        activeOkfBundleIds,
      );
      const slashMcpNames = invokedCommand?.enabledMcpServers;
      const sessionMcpNames = activeSession?.activeMcpServerNames;
      const selectedMcpServers = slashMcpNames != null
        ? settings.mcpServers.map((server) => ({
          ...server,
          enabled: slashMcpNames.includes(server.name),
        }))
        : sessionMcpNames != null
        ? settings.mcpServers.map((server) => ({
          ...server,
          enabled: server.enabled && sessionMcpNames.includes(server.name),
        }))
        : settings.mcpServers;
      const effectiveMcpServers = selectedMcpServers.map((server) => {
        const configuredProjectId = server.headers["x-goog-user-project"] ||
          server.headers["X-Goog-User-Project"];
        const fallbackProjectId = /(?:^|\.)googleapis\.com(?:\/|$)/i.test(
            server.url.replace(/^https?:\/\//i, ""),
          )
          ? settings.vertexProjectId.trim()
          : "";
        if (configuredProjectId || !fallbackProjectId) return server;
        return {
          ...server,
          headers: {
            ...server.headers,
            "x-goog-user-project": fallbackProjectId,
          },
        };
      });
      if (slashMcpNames != null) {
        setActiveMcpServerNames(slashMcpNames);
      }
      const enabledMcpServers = settings.provider === "cli" ||
          /(?:image|imagen)/i.test(settings.model)
        ? []
        : effectiveMcpServers.filter((server) =>
          server.enabled && server.verified
        );
      const httpDiscovery = await discoverMcpHttpTools(
        enabledMcpServers.filter((server) => server.transport === "http").map((
          server,
        ) => ({
          id: server.id,
          name: server.name,
          transport: "http",
          url: server.url,
          headers: server.headers,
          enabled: true,
          oauth: server.oauth,
        })),
      );
      const stdioDiscovery = await discoverMcpStdioTools(
        enabledMcpServers.filter((server) => server.transport === "stdio"),
      );
      const mcpBindings = [
        ...httpDiscovery.bindings,
        ...stdioDiscovery.bindings,
      ];
      const mcpClients = new Map<string, McpHttpClient | McpStdioClient>([
        ...httpDiscovery.clients,
        ...stdioDiscovery.clients,
      ]);
      const discoveryErrors = [
        ...httpDiscovery.errors,
        ...stdioDiscovery.errors,
      ];
      if (discoveryErrors.length) {
        console.warn("Some MCP servers were unavailable:", discoveryErrors);
      }
      const getMcpClient = (
        serverName: string,
      ): McpHttpClient | McpStdioClient | null => {
        const existing = mcpClients.get(serverName);
        if (existing) return existing;
        const server = enabledMcpServers.find((item) =>
          item.name === serverName
        );
        if (!server) return null;
        const created = server.transport === "stdio"
          ? new McpStdioClient(server)
          : new McpHttpClient({
            id: server.id,
            name: server.name,
            transport: "http",
            url: server.url,
            headers: server.headers,
            enabled: true,
            oauth: server.oauth,
          });
        mcpClients.set(serverName, created);
        return created;
      };
      const mcpBindingMap = new Map(
        mcpBindings.map((binding) => [binding.name, binding]),
      );
      const collectedMcpApps: NonNullable<ChatMessage["mcpApps"]> = [];
      const unsubscribeMcp = mcpBindings.length
        ? onChatToolRequest((request) => {
          if (request.streamId !== streamId) return;
          const binding = mcpBindingMap.get(request.name);
          if (!binding) return;
          const client = getMcpClient(binding.server.name);
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
              const configuredServer = enabledMcpServers.find((server) =>
                server.name === binding.server.name
              );
              if (configuredServer) {
                const app = await mcpAppInfoFromResult(
                  client,
                  toolResult,
                  binding.remoteName,
                  configuredServer,
                );
                if (app) collectedMcpApps.push(app);
              }
              if (toolResult.isError) {
                const content = Array.isArray(toolResult.content)
                  ? toolResult.content as Array<{ text?: string }>
                  : [];
                await resolveChatTool(
                  request.requestId,
                  undefined,
                  content.map((item) => item.text).filter(Boolean).join("\n") ||
                    "MCP tool execution failed",
                );
              } else await resolveChatTool(request.requestId, toolResult);
            },
          ).catch(async (caught) => {
            await client.close().catch(() => undefined);
            mcpClients.delete(binding.server.name);
            await resolveChatTool(
              request.requestId,
              undefined,
              caught instanceof Error ? caught.message : String(caught),
            );
          });
        })
        : () => undefined;
      releaseMcp = async () => {
        unsubscribeMcp();
        await Promise.all(
          [...mcpClients.values()].map((client) =>
            client.close().catch(() => undefined)
          ),
        );
      };
      const dashboardSkillActive = skillsAtSend.some((skill) =>
        /(?:^|\/)dashboard(?:\/|$)/i.test(skill.folderPath) ||
        skill.name.toLowerCase().includes("dashboard")
      );
      const customTools = [
        ...skillWorkflowTool(skillsAtSend),
        ...(dashboardSkillActive ? [getWorkflowSpecTool] : []),
        ...okfDocumentTool(activeOkfBundleIds),
        ...mcpBindings.map(({ name, description, parameters }) => ({
          name,
          description,
          parameters,
        })),
      ];
      const mcpResourceContext = enabledMcpServers.map((server) => {
        const projectId = server.headers["x-goog-user-project"] ||
          server.headers["X-Goog-User-Project"];
        return projectId
          ? `- ${server.name}: Google Cloud project ID is ${projectId}. Use projects/${projectId} whenever an MCP tool requires a project parent or resource name. Do not guess or search for another project ID.`
          : `- ${server.name}: no explicit Google Cloud project ID is configured.`;
      }).join("\n");
      const chatRequest = {
        provider: settings.provider,
        endpoint: settings.endpoint,
        apiKey: settings.apiKey,
        localFramework: settings.localFramework,
        localUsername: settings.localUsername,
        localPassword: settings.localPassword,
        model: settings.model,
        vertexProjectId: settings.vertexProjectId,
        vertexLocation: settings.vertexLocation,
        systemPrompt: [
          settings.systemPrompt,
          buildSkillSystemPrompt(skillsAtSend),
          okfPrompt,
          mcpResourceContext
            ? `MCP resource context:\n${mcpResourceContext}`
            : "",
        ].filter(Boolean).join("\n\n"),
        enableFileTools: settings.enableFileTools,
        fileToolMode: settings.fileToolMode,
        enableWebSearch: webSearchEnabled,
        cliType: settings.cliType,
        cliPath: settings.cliPaths[settings.cliType],
        cliSessionId: nativeSessionID,
        streamId,
        enableThinking: thinkingEnabled,
        customTools,
        workflowSpecContext: {
          models: configuredModelOptions(settings).map((option) =>
            option.label
          ),
          ragSettings: Object.keys(settings.ragSettings),
          mcpServers: settings.mcpServers.filter((server) => server.enabled)
            .map((server) => server.name),
        },
        messages: requestMessages,
      } as const;
      let result = await chat(chatRequest);
      if (settings.provider === "cli" && skillsAtSend.length > 0) {
        let accumulated = "", accumulatedThinking = "";
        const accumulatedTools = new Set(result.toolsUsed || []);
        let conversation = [...requestMessages];
        let cliSessionId = result.cliSessionId || nativeSessionID;
        for (let iteration = 0; iteration < 5; iteration++) {
          const raw = result.content;
          const processed = await processSkillMarkers(
            raw,
            skillsAtSend,
            runSkillWorkflow,
          );
          if (processed.display) {
            accumulated += `${accumulated ? "\n\n" : ""}${processed.display}`;
          }
          if (result.thinking) {
            accumulatedThinking += `${
              accumulatedThinking ? "\n\n" : ""
            }${result.thinking}`;
          }
          for (
            const tool of [...(result.toolsUsed || []), ...processed.toolsUsed]
          ) accumulatedTools.add(tool);
          if (!processed.followUp || abortRef.current) break;
          conversation = [
            ...conversation,
            { role: "assistant", content: raw },
            { role: "user", content: processed.followUp },
          ];
          result = await chat({
            ...chatRequest,
            messages: conversation,
            cliSessionId,
          });
          cliSessionId = result.cliSessionId || cliSessionId;
        }
        result = {
          ...result,
          content: accumulated || result.content,
          thinking: accumulatedThinking || result.thinking,
          toolsUsed: [...accumulatedTools],
          cliSessionId,
        };
      }
      if (abortRef.current) return;
      const content = result.content ||
        (result.pendingAction
          ? "I prepared a file change for your review."
          : "");
      updateSession(sessionIDAtSend, (session) => ({
        ...session,
        messages: session.messages.map((message) =>
          message.id !== assistantMessageId ? message : {
            ...message,
            content,
            provider: result.provider || providerAtSend,
            model: result.model || modelAtSend,
            toolsUsed: result.toolsUsed?.length
              ? [...new Set(result.toolsUsed)]
              : message.toolsUsed,
            skillsUsed: skillsAtSend.length
              ? skillsAtSend.map((skill) => skill.name)
              : undefined,
            ragUsed: ragContext.length > 0,
            ragSources: ragSources.length ? ragSources : undefined,
            webSearchUsed: Boolean(result.webSearchSources?.length),
            webSearchSources: result.webSearchSources?.length
              ? result.webSearchSources
              : message.webSearchSources,
            thinking: result.thinking || message.thinking,
            thinkingEnabled: thinkingAvailable ? thinkingEnabled : undefined,
            usage: result.usage,
            generatedImages: result.generatedImages,
            mcpApps: collectedMcpApps.length
              ? collectedMcpApps
              : message.mcpApps,
            elapsedMs: Math.round(performance.now() - startedAt),
          }
        ),
        cliSessionIds: result.cliSessionId
          ? {
            ...session.cliSessionIds,
            [settings.cliType]: result.cliSessionId,
          }
          : session.cliSessionIds,
        updatedAt: Date.now(),
      }));
      setPending(result.pendingAction ?? null);
    } catch (caught) {
      if (!abortRef.current) {
        setError(caught instanceof Error ? caught.message : String(caught));
        updateSession(
          sessionIDAtSend,
          (session) => ({
            ...session,
            messages: session.messages.filter((message) =>
              message.id !== assistantMessageId || !!message.content ||
              !!message.thinking || !!message.toolsUsed?.length
            ),
          }),
        );
      }
    } finally {
      await releaseMcp();
      if (streamRef.current?.streamId === streamId) {
        streamRef.current = null;
        streamQueueRef.current = [];
        if (streamTimerRef.current !== null) {
          window.clearTimeout(streamTimerRef.current);
          streamTimerRef.current = null;
        }
      }
      if (activeRunControllerRef.current === runController) {
        activeRunControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  const applyPending = async () => {
    if (!pending) return;
    setLoading(true);
    try {
      await applyPendingFileAction(pending);
      const applied = pending;
      setPending(null);
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
      setLoading(false);
      window.setTimeout(
        () =>
          void send(
            `The proposed ${applied.kind} for ${applied.path} was applied. Continue from that result.`,
          ),
        0,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setLoading(false);
    }
  };

  return (
    <section className="chat-panel">
      <header className="chat-panel-header">
        <div>
          <Bot size={17} />
          <strong>Chat</strong>
          <span>
            {settings.provider === "cli"
              ? cliNames[settings.cliType]
              : settings.model}
          </span>
        </div>
        <button type="button" onClick={onOpenSettings} title="Chat settings">
          <Settings2 size={16} />
        </button>
      </header>

      <div className="chat-session-bar">
        <select
          value={activeSession?.id ?? ""}
          disabled={loading}
          onChange={(event) => setActiveID(event.target.value)}
          title="Chat session"
        >
          {[...sessions].sort((left, right) => right.updatedAt - left.updatedAt)
            .map((session) => (
              <option key={session.id} value={session.id}>
                {session.title}
              </option>
            ))}
        </select>
        <button
          type="button"
          disabled={loading}
          onClick={createChat}
          title="New chat"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={deleteChat}
          title="Delete chat"
        >
          <X size={14} />
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-welcome">
            <Bot size={28} />
            <strong>How can I help?</strong>
            <span>
              {workspaceBase
                ? "Attach files or ask me to inspect your workspace."
                : "Select a Workspace to enable file tools."}
            </span>
            <div className="chat-welcome-guides">
              <article>
                <div>
                  <BookOpen size={16} />
                  <strong>GemiHub Desktop Help</strong>
                </div>
                <p>
                  Use the built-in help knowledge to ask about features,
                  settings, and everyday operations.
                </p>
                <button type="button" onClick={askDesktopHelp}>
                  <BookOpen size={13} />Ask GemiHub Desktop Help
                </button>
              </article>
              <article>
                <div>
                  <LayoutDashboard size={16} />
                  <strong>Build Dashboards with AI</strong>
                </div>
                <p>
                  Describe what you need in natural language. AI can create or
                  update Dashboard widgets, files, and workflows for you.
                </p>
                <button
                  type="button"
                  disabled={!workspaceBase}
                  onClick={() =>
                    draftWithDashboardSkill(
                      "Create a Dashboard for my workspace. Ask me what information and widgets it should include.",
                    )}
                >
                  <LayoutDashboard size={13} />Draft a Dashboard request
                </button>
              </article>
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <article
            key={message.id ?? index}
            className={`chat-message ${message.role}`}
          >
            <span>
              {message.role === "user" ? "You" : assistantLabel(message)}
            </span>
            {message.role === "assistant" && message.thinking && (
              <details className="chat-response-thinking">
                <summary>
                  <Brain size={12} />Thinking
                </summary>
                <div>{message.thinking}</div>
              </details>
            )}
            {message.role === "assistant" && message.ragSources?.length
              ? (
                <div className="chat-response-sources">
                  <span className="chat-grounding-badge">
                    <Database size={11} />RAG
                  </span>
                  {message.ragSources.map((source) => (
                    <button
                      type="button"
                      key={`${source.path}:${source.pageLabel || ""}`}
                      title={`${source.path}${
                        source.score !== undefined
                          ? ` · relevance ${source.score.toFixed(3)}`
                          : ""
                      }`}
                      onClick={() => onOpenFile(fileRef("workspace", source.path))}
                    >
                      <FileText size={11} />
                      {groundingSourceLabel(source)}
                    </button>
                  ))}
                </div>
              )
              : null}
            {message.role === "assistant" && message.webSearchUsed
              ? (
                <div className="chat-response-sources chat-web-sources">
                  <span className="chat-grounding-badge">
                    <Search size={11} />Used web search
                  </span>
                  {message.webSearchSources?.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      title={source.url}
                    >
                      {source.title || source.url}
                    </a>
                  ))}
                </div>
              )
              : null}
            {message.role === "assistant"
              ? <MarkdownPreview content={message.content} isDark={isDark} />
              : <p>{message.content}</p>}
            {message.role === "assistant" && message.generatedImages?.length
              ? (
                <div className="chat-generated-images">
                  {message.generatedImages.map((image, imageIndex) => (
                    <img
                      key={`${imageIndex}-${image.mimeType}`}
                      src={`data:${image.mimeType};base64,${image.data}`}
                      alt={`Generated image ${imageIndex + 1}`}
                    />
                  ))}
                </div>
              )
              : null}
            {message.role === "assistant" && message.mcpApps?.length
              ? (
                <div className="chat-mcp-apps">
                  {message.mcpApps.map((app, appIndex) => (
                    <McpAppRenderer
                      info={app}
                      key={`${app.title}-${appIndex}`}
                    />
                  ))}
                </div>
              )
              : null}
            {message.role === "assistant" &&
              ((message.toolsUsed?.length ?? 0) > 0 ||
                (message.ragUsed && !message.ragSources?.length)) &&
              (
                <div className="chat-response-tools">
                  {message.ragUsed && !message.ragSources?.length && (
                    <span>
                      <Database size={11} />RAG
                    </span>
                  )}
                  {message.toolsUsed?.map((tool) => (
                    <span key={tool} title={tool}>
                      <Wrench size={11} />
                      {toolNames[tool] || tool}
                    </span>
                  ))}
                </div>
              )}
            {message.role === "assistant" && message.skillsUsed?.length
              ? (
                <div className="chat-response-skills">
                  <Library size={11} />
                  <span className="label">Skills:</span>
                  {message.skillsUsed.map((name) => {
                    const skill = skills.find((item) => item.name === name);
                    return skill && !skill.builtin
                      ? (
                        <button
                          type="button"
                          key={name}
                          onClick={() => onOpenFile(fileRef("workspace", skill.skillFilePath))}
                        >
                          {name}
                        </button>
                      )
                      : <span className="skill" key={name}>{name}</span>;
                  })}
                </div>
              )
              : null}
            {message.role === "assistant" && message.failedWorkflowPath && (
              <button
                type="button"
                className="chat-open-failed-workflow"
                onClick={() => onOpenWorkflow(fileRef("workspace", message.failedWorkflowPath!))}
              >
                <WorkflowIcon size={12} />Open failed workflow
              </button>
            )}
            {message.role === "assistant" &&
              (message.elapsedMs || message.usage) && (
              <div className="chat-response-usage">
                {message.elapsedMs
                  ? <span>{(message.elapsedMs / 1000).toFixed(1)}s</span>
                  : null}
                {message.thinkingEnabled !== undefined
                  ? (
                    <span>
                      <Brain size={10} />Thinking {message.thinkingEnabled
                        ? "on"
                        : message.provider === "gemini" ||
                            message.provider === "vertex"
                        ? "off (minimal)"
                        : "off"}
                    </span>
                  )
                  : null}
                {formatUsage(message)
                  ? <span>{formatUsage(message)}</span>
                  : null}
              </div>
            )}
          </article>
        ))}
        {loading && (
          <div className="chat-thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        {pending && (
          <section className="pending-file-action">
            <header>
              <FileCode2 size={16} />
              <strong>
                {pending.kind === "rename"
                  ? "Rename proposed"
                  : "File edit proposed"}
              </strong>
            </header>
            <code>
              {pending.path}
              {pending.newPath ? ` → ${pending.newPath}` : ""}
            </code>
            {pending.content && (
              <pre>{pending.content.slice(0, 4000)}{pending.content.length > 4000 ? "\n…" : ""}</pre>
            )}
            <div>
              <button type="button" onClick={() => void applyPending()}>
                <Check size={14} /> Apply
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setPending(null)}
              >
                <X size={14} /> Discard
              </button>
            </div>
          </section>
        )}
        {error && <div className="chat-error">{error}</div>}
        <div ref={endRef} />
      </div>

      <footer className="chat-input-area">
        {activeSkills.length > 0 && (
          <div className="chat-active-skills">
            {activeSkills.map((skill) => (
              <span key={skill.skillFilePath}>
                <Library size={11} />
                {skill.builtin ? <span>{skill.name}</span> : (
                  <button
                    type="button"
                    className="chat-skill-open"
                    onClick={() => onOpenFile(fileRef("workspace", skill.skillFilePath))}
                  >
                    {skill.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActiveSkillPaths((paths) =>
                      paths.filter((path) => path !== skill.skillFilePath)
                    );
                    if (skill.folderPath === contextBuiltinPath) {
                      setDismissedContextSkillPaths((
                        paths,
                      ) => [...new Set([...paths, skill.skillFilePath])]);
                    }
                  }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {activeMcpServers.length > 0 && (
          <div className="chat-active-skills">
            {activeMcpServers.map((server) => (
              <span key={server.id} title={`MCP Server · ${server.name}`}>
                <Wrench size={11} />
                <span>{server.name}</span>
                <button
                  type="button"
                  disabled={loading}
                  title={`Remove ${server.name} from this chat`}
                  onClick={() =>
                    setActiveMcpServerNames((names) => {
                      const current = names ?? settings.mcpServers
                        .filter((item) =>
                          item.enabled && item.verified
                        )
                        .map((item) => item.name);
                      return current.filter((name) => name !== server.name);
                    })}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <OkfSelector
          bundles={okfBundles}
          activeIds={activeOkfBundleIds.filter((id) =>
            okfBundles.some((bundle) => bundle.id === id)
          )}
          disabled={loading}
          onRefresh={() => void refreshOkfBundles()}
          onToggle={(id) =>
            setActiveOkfBundleIds((ids) =>
              ids.includes(id)
                ? ids.filter((value) => value !== id)
                : [...ids, id]
            )}
        />
        {attachedFiles.length > 0 && (
          <div className="chat-attachments">
            {attachedFiles.map((file) => (
              <span
                key={file.path}
                title={file.automatic
                  ? "Active file (automatically selected)"
                  : file.path}
              >
                <FileCode2 size={12} />
                {file.automatic ? "Active · " : ""}
                {file.path}
                <button
                  type="button"
                  onClick={() => {
                    if (file.automatic) setDismissedAutomaticPath(file.path);
                    setAttachedFiles((current) =>
                      current.filter((item) => item.path !== file.path)
                    );
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="chat-composer">
          <textarea
            ref={composerRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about your files…"
            rows={3}
          />
          {(slashMatches.length > 0 || skillSlashMatches.length > 0 ||
            mentionMatches.length > 0) && (
            <div className="chat-command-menu">
              {mentionMatches.map((path) => (
                <button
                  type="button"
                  key={path}
                  onClick={() =>
                    setInput(
                      input.replace(/@(?:"[^"]*|[^\s]*)$/, `@"${path}" `),
                    )}
                >
                  <strong>@{path}</strong>
                  <span>File</span>
                </button>
              ))}
              {skillSlashMatches.map((skill) => {
                const folder = skill.folderPath.split("/").pop() || skill.name;
                return (
                  <button
                    type="button"
                    key={skill.skillFilePath}
                    onClick={() => setInput(`/${folder} `)}
                  >
                    <strong>/{folder}</strong>
                    <span>Skill · {skill.description || skill.name}</span>
                  </button>
                );
              })}
              {slashMatches.map((command) => (
                <button
                  type="button"
                  key={"id" in command
                    ? command.id
                    : command.pluginId + command.name}
                  onClick={() => setInput(`/${command.name} `)}
                >
                  <strong>/{command.name}</strong>
                  <span>{command.description}</span>
                </button>
              ))}
            </div>
          )}
          {filePickerOpen && (
            <div className="chat-file-picker" ref={filePickerRef}>
              <label>
                <Search size={13} />
                <input
                  autoFocus
                  value={fileQuery}
                  onChange={(event) =>
                    setFileQuery(event.target.value)}
                  placeholder="Find a workspace file"
                />
              </label>
              <div>
                {fileLoading
                  ? <small>Loading files…</small>
                  : filteredPaths.map((path) => (
                    <button
                      type="button"
                      key={path}
                      onClick={() => void attachFile(path)}
                    >
                      {path}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
        <div className="chat-input-actions">
          <button
            ref={filePickerButtonRef}
            type="button"
            className="chat-clear"
            disabled={!workspaceBase}
            onClick={() =>
              filePickerOpen ? setFilePickerOpen(false) : void openFilePicker()}
            title="Attach Workspace file"
          >
            <Paperclip size={15} />
          </button>
          <div className="chat-skill-menu-wrap" ref={skillMenuRef}>
            <button
              type="button"
              className={`chat-clear ${activeSkills.length ? "active" : ""}`}
              disabled={loading || skills.length === 0}
              onClick={() => setSkillMenuOpen((open) => !open)}
              title="Workspace skills"
            >
              <Library size={15} />
            </button>
            {skillMenuOpen && (
              <div className="chat-skill-menu">
                <header>
                  <strong>Agent skills</strong>
                  <small>Built in + skills/*/SKILL.md</small>
                </header>
                {skills.map((skill) => (
                  <label key={skill.skillFilePath}>
                    <input
                      type="checkbox"
                      checked={activeSkills.some((active) =>
                        active.skillFilePath === skill.skillFilePath
                      )}
                      onChange={(event) => {
                        if (skill.folderPath === contextBuiltinPath) {
                          setDismissedContextSkillPaths((paths) =>
                            event.target.checked
                              ? paths.filter((path) =>
                                path !== skill.skillFilePath
                              )
                              : [...new Set([...paths, skill.skillFilePath])]
                          );
                        }
                        setActiveSkillPaths((paths) =>
                          event.target.checked
                            ? [...new Set([...paths, skill.skillFilePath])]
                            : paths.filter((path) =>
                              path !== skill.skillFilePath
                            )
                        );
                      }}
                    />
                    <span>
                      <strong>
                        {skill.name}
                        {skill.builtin ? " · built-in" : ""}
                      </strong>
                      <small>
                        {skill.description || skill.skillFilePath}
                        {skill.workflows.length
                          ? ` · ${skill.workflows.length} workflow${
                            skill.workflows.length === 1 ? "" : "s"
                          }`
                          : ""}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="chat-tool-menu-wrap" ref={toolMenuRef}>
            <button
              type="button"
              className={`chat-clear ${
                settings.fileToolMode !== "all" ||
                  settings.mcpServers.some((server) => !server.enabled)
                  ? "active"
                  : ""
              }`}
              disabled={loading || settings.provider === "cli" ||
                (!workspaceBase && settings.mcpServers.length === 0)}
              onClick={() => setToolMenuOpen((open) => !open)}
              title="Workspace and MCP tools"
            >
              <Database size={15} />
            </button>
            {toolMenuOpen && (
              <div className="chat-tool-menu">
                {(["all", "noSearch", "none"] as FileToolMode[]).map((mode) => (
                  <button
                    type="button"
                    className={settings.fileToolMode === mode ? "selected" : ""}
                    key={mode}
                    onClick={() => {
                      onSettingsChange({
                        ...settings,
                        fileToolMode: mode,
                        enableFileTools: mode !== "none",
                      });
                    }}
                  >
                    {mode === "all"
                      ? "Files: all"
                      : mode === "noSearch"
                      ? "Files: no search"
                      : "Files: off"}
                  </button>
                ))}
                {settings.mcpServers.length > 0 && (
                  <>
                    <div className="chat-tool-menu-heading">MCP servers</div>
                    {settings.mcpServers.map((server) => (
                      <label
                        key={server.id}
                        title={server.toolHints.join(", ")}
                        className={!server.verified ? "unverified" : ""}
                      >
                        <input
                          type="checkbox"
                          checked={activeMcpServers.some((item) =>
                            item.id === server.id
                          )}
                          disabled={!server.verified}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            if (checked && !server.enabled) {
                              onSettingsChange({
                                ...settings,
                                mcpServers: settings.mcpServers.map((item) =>
                                  item.id === server.id
                                    ? { ...item, enabled: true }
                                    : item
                                ),
                              });
                            }
                            setActiveMcpServerNames((names) => {
                              const current = names ?? settings.mcpServers
                                .filter((item) => item.enabled && item.verified)
                                .map((item) => item.name);
                              return checked
                                ? [...new Set([...current, server.name])]
                                : current.filter((name) =>
                                  name !== server.name
                                );
                            });
                          }}
                        />
                        <span>
                          <strong>{server.name}</strong>
                          <small>
                            {!server.verified
                              ? "Test connection in Settings"
                              : server.toolHints.length
                              ? `${server.toolHints.length} tools · ${
                                server.toolHints.slice(0, 3).join(", ")
                              }${server.toolHints.length > 3 ? ", …" : ""}`
                              : "Connected · no tools"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <span>
            <label
              className="chat-web-search-toggle"
              title={supportsNativeWebSearch(settings)
                ? "Use provider-native Web Search"
                : "Web Search is unavailable for this provider endpoint"}
            >
              <input
                type="checkbox"
                checked={settings.webSearchEnabled &&
                  supportsNativeWebSearch(settings)}
                disabled={loading || !supportsNativeWebSearch(settings)}
                onChange={(event) => onSettingsChange({
                  ...settings,
                  webSearchEnabled: event.target.checked,
                })}
              />
              Web
            </label>
            {thinkingAvailable && (
              <label
                className="chat-thinking-select"
                title={thinkingRequired
                  ? "Thinking is required for this model"
                  : "Choose whether the model uses thinking"}
              >
                <Brain size={12} />
                <select
                  value={thinkingEnabled ? "on" : "off"}
                  disabled={loading || thinkingRequired}
                  onChange={(event) => {
                    const enabled = new Set(settings.thinkingEnabledModels);
                    if (event.target.value === "on") {
                      enabled.add(thinkingModelKey);
                    } else enabled.delete(thinkingModelKey);
                    onSettingsChange({
                      ...settings,
                      thinkingEnabledModels: [...enabled],
                    });
                  }}
                >
                  <option value="off">Thinking: off</option>
                  <option value="on">Thinking: on</option>
                </select>
              </label>
            )}
          </span>
          <button
            type="button"
            className="chat-send"
            disabled={!loading && !input.trim()}
            onClick={() => {
              if (loading) {
                abortRef.current = true;
                activeRunControllerRef.current?.abort();
                const activeStreamID = streamRef.current?.streamId;
                if (activeStreamID) void cancelChat(activeStreamID);
                if (settings.provider === "cli") void stopCLI();
                setLoading(false);
              } else void send();
            }}
          >
            {loading ? <Square size={14} /> : <Send size={15} />}
          </button>
        </div>
        <div className="chat-model-selector">
          <select
            value={selectedModelOptionKey(settings)}
            disabled={loading || configuredModelOptions(settings).length === 0}
            onChange={(event) => {
              setToolMenuOpen(false);
              onSettingsChange(
                selectConfiguredModel(settings, event.target.value),
              );
            }}
            title="Model"
          >
            <option value="" disabled>
              {configuredModelOptions(settings).length
                ? "Select model"
                : "No configured model"}
            </option>
            {configuredModelOptions(settings).map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={settings.selectedRagSetting ?? ""}
            disabled={loading}
            onChange={(event) => onSettingsChange({
              ...settings,
              selectedRagSetting: event.target.value || null,
            })}
            title="RAG"
          >
            <option value="">Search: none</option>
            {Object.keys(settings.ragSettings).map((name) => (
              <option key={name} value={name}>RAG: {name}</option>
            ))}
          </select>
        </div>
      </footer>
    </section>
  );
}
