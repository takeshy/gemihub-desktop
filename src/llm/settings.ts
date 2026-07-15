import type { RAGSetting } from "../lib/wailsBackend";

export type ChatProvider = "openai" | "gemini" | "vertex" | "anthropic" | "cli";
export type CLIType = "codex" | "claude" | "antigravity";
export type FileToolMode = "all" | "noSearch" | "none";

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: "http" | "stdio";
  url: string;
  headers: Record<string, string>;
  command: string;
  args: string[];
  env: Record<string, string>;
  framing: "content-length" | "newline";
  enabled: boolean;
  toolHints: string[];
  verified: boolean;
  oauth: boolean;
}

export interface APIProviderProfile {
  endpoint: string;
  apiKey: string;
  model: string;
  vertexProjectId: string;
  vertexLocation: string;
  vertexOAuthClientId: string;
  vertexOAuthClientSecret: string;
}

export interface SlashCommand {
  id: string;
  name: string;
  promptTemplate: string;
  description: string;
  enabledMcpServers?: string[] | null;
}

export interface DiscordIntegrationSettings {
  enabled: boolean;
  botToken: string;
  allowedChannelIds: string;
  allowedUserIds: string;
  provider: ChatProvider | "";
  model: string;
  systemPrompt: string;
  maxResponseLength: number;
  respondToDMs: boolean;
  requireMention: boolean;
  ragSetting: string | null;
}

export interface ChatSettings {
  provider: ChatProvider;
  endpoint: string;
  apiKey: string;
  model: string;
  vertexProjectId: string;
  vertexLocation: string;
  vertexOAuthClientId: string;
  vertexOAuthClientSecret: string;
  providerProfiles: Partial<Record<Exclude<ChatProvider, "cli">, APIProviderProfile>>;
  verifiedCliTypes: CLIType[];
  systemPrompt: string;
  enableFileTools: boolean;
  fileToolMode: FileToolMode;
  thinkingEnabledModels: string[];
  cliType: CLIType;
  cliPaths: Record<CLIType, string>;
  slashCommands: SlashCommand[];
  mcpServers: MCPServerConfig[];
  selectedRagSetting: string | null;
  ragSettings: Record<string, RAGSetting>;
  okfRoot: string;
  okfUpdateEndpoint: string;
  okfUpdateToken: string;
  discord: DiscordIntegrationSettings;
}

export const CHAT_SETTINGS_KEY = "gemihub-desktop:chat-settings";

export const chatModelChoices: Record<Exclude<ChatProvider, "cli">, string[]> = {
  openai: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "o3"],
  gemini: ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools", "gemini-3.1-flash-lite", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
  vertex: ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools", "gemini-3.1-flash-lite", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview", "gemini-2.5-pro", "gemini-2.5-flash"],
  anthropic: ["claude-opus-4-8", "claude-sonnet-5", "claude-fable-5", "claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
};

export function chatThinkingCapabilities(provider: ChatProvider, model: string): { available: boolean; required: boolean } {
  const available = ((provider === "gemini" || provider === "vertex") && /gemini-(?:2\.5|3)/i.test(model)) || (provider === "anthropic" && /claude-/i.test(model));
  const required = available && (/gemini-(?:3|3\.1)-pro/i.test(model) || /claude-(?:fable-5|mythos)/i.test(model));
  return { available, required };
}

export const defaultChatSettings: ChatSettings = {
  provider: "openai",
  endpoint: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.5",
  vertexProjectId: "",
  vertexLocation: "global",
  vertexOAuthClientId: "",
  vertexOAuthClientSecret: "",
  providerProfiles: {},
  verifiedCliTypes: [],
  systemPrompt: "You are a helpful assistant working with the user's local DirectoryBase. Inspect files before making assumptions. Use propose_file_edit for changes.",
  enableFileTools: true,
  fileToolMode: "all",
  thinkingEnabledModels: [],
  cliType: "codex",
  cliPaths: { codex: "", claude: "", antigravity: "" },
  slashCommands: [{
    id: "cmd_infographic_default",
    name: "infographic",
    promptTemplate: "Convert the following content into an HTML infographic. Output the HTML directly in your response, do not create a file:\n\n{selection}",
    description: "Generate an HTML infographic",
  }],
  mcpServers: [],
  selectedRagSetting: null,
  ragSettings: {},
  okfRoot: "Knowledge",
  okfUpdateEndpoint: "",
  okfUpdateToken: "",
  discord: {
    enabled: false,
    botToken: "",
    allowedChannelIds: "",
    allowedUserIds: "",
    provider: "",
    model: "",
    systemPrompt: "You are a helpful assistant connected to the user's local DirectoryBase. Use file tools when needed and keep Discord responses concise.",
    maxResponseLength: 1900,
    respondToDMs: true,
    requireMention: true,
    ragSetting: null,
  },
};

export const defaultRAGSetting: RAGSetting = {
  embeddingProvider: "gemini",
  embeddingBaseUrl: "",
  embeddingApiKey: "",
  embeddingModel: "",
  chunkSize: 500,
  chunkOverlap: 100,
  pdfChunkPages: 6,
  topK: 5,
  scoreThreshold: 0.3,
  targetFolders: [],
  excludePatterns: [],
  searchFileExtensions: [],
  lastFullSync: null,
  externalIndexPath: "",
  sourceRagSettings: [],
  indexMultimodal: false,
  vertexProjectId: "",
  vertexLocation: "us",
  vertexOAuthClientId: "",
  vertexOAuthClientSecret: "",
};

export function providerDefaults(provider: ChatProvider): Pick<ChatSettings, "endpoint" | "model"> {
  if (provider === "gemini") return { endpoint: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-3.5-flash" };
  if (provider === "vertex") return { endpoint: "", model: "gemini-3.5-flash" };
  if (provider === "anthropic") return { endpoint: "https://api.anthropic.com/v1/messages", model: "claude-opus-4-8" };
  if (provider === "cli") return { endpoint: "", model: "" };
  return { endpoint: "https://api.openai.com/v1", model: "gpt-5.5" };
}

function migrateOldDefaultModel(provider: ChatProvider, model: string | undefined): string {
  if (!model) return providerDefaults(provider).model;
  if (provider === "openai" && model === "gpt-5-mini") return "gpt-5.5";
  if ((provider === "gemini" || provider === "vertex") && model === "gemini-2.5-flash") return "gemini-3.5-flash";
  if (provider === "anthropic" && model === "claude-sonnet-4-5") return "claude-opus-4-8";
  return model;
}

function profileFromSettings(settings: ChatSettings): APIProviderProfile {
  return {
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    model: settings.model,
    vertexProjectId: settings.vertexProjectId,
    vertexLocation: settings.vertexLocation,
    vertexOAuthClientId: settings.vertexOAuthClientId,
    vertexOAuthClientSecret: settings.vertexOAuthClientSecret,
  };
}

export function switchChatProvider(settings: ChatSettings, provider: ChatProvider): ChatSettings {
  const providerProfiles = { ...settings.providerProfiles };
  if (settings.provider !== "cli") providerProfiles[settings.provider] = profileFromSettings(settings);
  if (provider === "cli") return { ...settings, provider, providerProfiles, endpoint: "", model: "", cliType: settings.verifiedCliTypes.includes(settings.cliType) ? settings.cliType : settings.verifiedCliTypes[0] ?? settings.cliType, fileToolMode: "none", enableFileTools: false };
  const saved = providerProfiles[provider];
  const defaults = providerDefaults(provider);
  return {
    ...settings,
    provider,
    providerProfiles,
    endpoint: saved?.endpoint ?? defaults.endpoint,
    apiKey: saved?.apiKey ?? "",
    model: saved?.model ?? defaults.model,
    vertexProjectId: saved?.vertexProjectId ?? "",
    vertexLocation: saved?.vertexLocation ?? "global",
    vertexOAuthClientId: saved?.vertexOAuthClientId ?? "",
    vertexOAuthClientSecret: saved?.vertexOAuthClientSecret ?? "",
    fileToolMode: settings.provider === "cli" ? "all" : settings.fileToolMode,
    enableFileTools: true,
  };
}

function profileConfigured(provider: Exclude<ChatProvider, "cli">, profile: APIProviderProfile): boolean {
  if (!profile.model.trim()) return false;
  if (provider === "vertex") return !!(profile.vertexOAuthClientId.trim() && profile.vertexProjectId.trim());
  if (provider === "openai") return !!(profile.apiKey.trim() || (profile.endpoint.trim() && profile.endpoint !== providerDefaults("openai").endpoint));
  return !!profile.apiKey.trim();
}

export function configuredChatProviders(settings: ChatSettings): ChatProvider[] {
  const profiles = { ...settings.providerProfiles };
  if (settings.provider !== "cli") profiles[settings.provider] = profileFromSettings(settings);
  const apiProviders = (["openai", "gemini", "vertex", "anthropic"] as const).filter((provider) => {
    const profile = profiles[provider];
    return !!profile && profileConfigured(provider, profile);
  });
  return settings.verifiedCliTypes.length > 0 ? [...apiProviders, "cli"] : apiProviders;
}

export function loadChatSettings(): ChatSettings {
  try {
    const legacy = localStorage.getItem("llm-hub:chat-settings");
    const stored = localStorage.getItem(CHAT_SETTINGS_KEY) ?? legacy ?? "{}";
    const parsed = JSON.parse(stored) as Partial<ChatSettings>;
    const provider = parsed.provider ?? defaultChatSettings.provider;
    return {
      ...defaultChatSettings,
      ...parsed,
      provider,
      model: migrateOldDefaultModel(provider, parsed.model),
      providerProfiles: parsed.providerProfiles && typeof parsed.providerProfiles === "object" ? parsed.providerProfiles : {},
      verifiedCliTypes: Array.isArray(parsed.verifiedCliTypes) ? parsed.verifiedCliTypes.filter((type): type is CLIType => type === "codex" || type === "claude" || type === "antigravity") : [],
      fileToolMode: parsed.fileToolMode ?? (parsed.enableFileTools === false ? "none" : "all"),
      thinkingEnabledModels: Array.isArray(parsed.thinkingEnabledModels) ? parsed.thinkingEnabledModels.filter((value): value is string => typeof value === "string") : [],
      cliPaths: { ...defaultChatSettings.cliPaths, ...(parsed.cliPaths ?? {}) },
      slashCommands: Array.isArray(parsed.slashCommands) ? parsed.slashCommands : defaultChatSettings.slashCommands,
      mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers.map((server) => { const toolHints = Array.isArray(server.toolHints) ? server.toolHints : []; const verified = server.verified === true || (server.verified === undefined && toolHints.length > 0); return { id: server.id || `mcp-${crypto.randomUUID()}`, name: server.name || "MCP server", transport: server.transport === "stdio" ? "stdio" : "http", url: server.url || "", headers: server.headers && typeof server.headers === "object" ? server.headers : {}, command: server.command || "", args: Array.isArray(server.args) ? server.args : [], env: server.env && typeof server.env === "object" ? server.env : {}, framing: server.framing === "newline" ? "newline" : "content-length", enabled: verified && server.enabled !== false, toolHints, verified, oauth: server.oauth === true }; }) : [],
      discord: { ...defaultChatSettings.discord, ...(parsed.discord ?? {}) },
      ragSettings: parsed.ragSettings && typeof parsed.ragSettings === "object" ? Object.fromEntries(Object.entries(parsed.ragSettings).map(([name, setting]) => {
        const value = setting as Partial<RAGSetting>;
        const inferredProvider = value.embeddingProvider ?? (value.embeddingBaseUrl ? "openai" : "gemini");
        return [name, { ...defaultRAGSetting, ...value, embeddingProvider: inferredProvider }];
      })) : {},
    };
  } catch {
    return defaultChatSettings;
  }
}

export function saveChatSettings(settings: ChatSettings): void {
  const providerProfiles = { ...settings.providerProfiles };
  if (settings.provider !== "cli") providerProfiles[settings.provider] = profileFromSettings(settings);
  localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify({ ...settings, providerProfiles }));
}

export const cliNames: Record<CLIType, string> = {
  codex: "Codex App Server",
  claude: "Claude Code",
  antigravity: "Antigravity",
};
