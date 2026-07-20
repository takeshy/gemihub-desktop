export interface LocalFileResult {
  path: string;
  fileName: string;
  content: string;
}

export interface LocalPathInfo {
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface MemoFileResult {
  exists: boolean;
  content: string;
}

export interface MemoListEntry {
  memoPath: string;
  source: string;
  modTime: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: number;
  children?: FileTreeNode[];
}

export interface FileSearchResult {
  path: string;
  name: string;
  line?: number;
  preview?: string;
}

export interface DirectoryFileEntry {
  path: string;
  size: number;
  createdTime: number;
  modTime: number;
  md5: string;
  binary: boolean;
}
export interface FileHistoryEntry {
  id: string;
  path: string;
  timestamp: number;
  size: number;
  binary: boolean;
}
export interface TrashEntry {
  id: string;
  originalPath: string;
  name: string;
  deletedAt: number;
  scope: "workspace" | "files";
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  session?: boolean;
}

export interface WorkspaceState {
  activeWorkspaceId: string;
  workspaces: Workspace[];
}

export interface WorkspaceDirectoryMoveResult {
  workspacePath: string;
  originalPath: string;
  linkCreated: boolean;
}

export interface RAGSetting {
  embeddingSource: "ai" | "custom";
  embeddingProvider: "gemini" | "vertex" | "openai";
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  pdfChunkPages: number;
  topK: number;
  scoreThreshold: number;
  targetFolders: string[];
  excludePatterns: string[];
  searchFileExtensions: string[];
  lastFullSync: number | null;
  externalIndexPath: string;
  sourceRagSettings: string[];
  indexMultimodal: boolean;
  vertexProjectId: string;
  vertexLocation: string;
  vertexOAuthClientId: string;
  vertexOAuthClientSecret: string;
}

export interface VertexOAuthClient {
  clientId: string;
  clientSecret: string;
  projectId: string;
}

export interface VertexOAuthStatus {
  connected: boolean;
  clientId?: string;
}

export interface MCPOAuthConnectRequest {
  serverId: string;
  serverUrl: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
}

export interface MCPOAuthStatus {
  connected: boolean;
  clientId?: string;
}

export interface RAGSyncResult {
  embedded: number;
  skipped: number;
  removed: number;
  deferredFiles: number;
  chunkCount: number;
  fileCount: number;
  errors: string[];
}

export interface RAGSyncProgress {
  name: string;
  processed: number;
  total: number;
  filePath?: string;
}

export interface RAGSearchResult {
  filePath: string;
  text: string;
  score: number;
  chunkIndex: number;
  contentType?: string;
  pageLabel?: string;
}

export interface RAGStatus {
  chunkCount: number;
  fileCount: number;
  dimension: number;
  embeddingModel: string;
}

export interface RAGIndexedFile {
  filePath: string;
  chunks: number;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  provider?: string;
  model?: string;
  toolsUsed?: string[];
  skillsUsed?: string[];
  ragUsed?: boolean;
  ragSources?: Array<{ path: string; pageLabel?: string; score?: number }>;
  webSearchUsed?: boolean;
  webSearchSources?: WebSearchSource[];
  thinking?: string;
  thinkingEnabled?: boolean;
  usage?: ChatUsage;
  elapsedMs?: number;
  attachments?: ChatAttachment[];
  generatedImages?: GeneratedImage[];
  failedWorkflowPath?: string;
  mcpApps?: McpAppInfo[];
}

export interface WebSearchSource {
  title: string;
  url: string;
}

export interface McpAppInfo {
  title: string;
  html: string;
  toolResult: Record<string, unknown>;
  serverUrl: string;
  serverHeaders: Record<string, string>;
  serverConfig?: {
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
  };
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  data: string;
}

export interface ChatUsage {
  inputTokens?: number;
  outputTokens?: number;
  thinkingTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  toolUseTokens?: number;
}

export interface ChatRequest {
  provider: "openai" | "gemini" | "vertex" | "anthropic" | "cli";
  endpoint: string;
  apiKey: string;
  localFramework?: "ollama" | "lm-studio" | "anythingllm" | "vllm" | "opencode";
  localUsername?: string;
  localPassword?: string;
  model: string;
  vertexProjectId: string;
  vertexLocation: string;
  systemPrompt: string;
  messages: ChatMessage[];
  enableFileTools: boolean;
  fileToolMode: "all" | "noSearch" | "none";
  cliType: "codex" | "antigravity";
  cliPath: string;
  cliSessionId: string;
  streamId?: string;
  enableThinking?: boolean;
  enableWebSearch?: boolean;
  customTools?: ChatToolDefinition[];
  workflowSpecContext?: WorkflowSpecContext;
}

export interface WorkflowSpecContext {
  models: readonly string[];
  ragSettings: readonly string[];
  mcpServers: readonly string[];
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatToolRequest {
  requestId: string;
  streamId?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatFunctionLimitRequest {
  requestId: string;
  streamId?: string;
  used: number;
  currentLimit: number;
  remaining: number;
  extensionAmount: number;
}

export interface ChatStreamEvent {
  streamId: string;
  type: "text" | "thinking" | "tool" | "usage";
  delta?: string;
  tool?: string;
  usage?: ChatUsage;
}

export interface CLIVerifyResult {
  success: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface PendingFileAction {
  kind: "write" | "rename";
  path: string;
  newPath?: string;
  content?: string;
  mode?: "replace" | "append" | "prepend";
}

export interface ChatResult {
  content: string;
  pendingAction?: PendingFileAction;
  toolsUsed?: string[];
  cliSessionId?: string;
  provider?: string;
  model?: string;
  thinking?: string;
  usage?: ChatUsage;
  generatedImages?: GeneratedImage[];
  webSearchSources?: WebSearchSource[];
}

export interface GeneratedImage {
  mimeType: string;
  data: string;
}

export interface DiscordSettings {
  enabled: boolean;
  botToken: string;
  allowedChannelIds: string;
  allowedUserIds: string;
  model: string;
  systemPrompt: string;
  maxResponseLength: number;
  respondToDMs: boolean;
  requireMention: boolean;
}

export interface DiscordStatus {
  running: boolean;
  connected: boolean;
  username?: string;
  error?: string;
  lastEvent?: string;
}

export interface DiscordBotRequest {
  settings: DiscordSettings;
  chat: ChatRequest;
  ragName: string;
  ragSetting: RAGSetting;
  skills: DiscordSkill[];
}

export interface DiscordSkillWorkflow {
  id: string;
  path: string;
  description: string;
  inputVariables?: string[];
}

export interface DiscordSkill {
  name: string;
  folderPath: string;
  systemPrompt: string;
  workflows: DiscordSkillWorkflow[];
}

export interface ExternalHTTPRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  bodyBase64?: string;
}

export interface ExternalHTTPResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyBase64: string;
}

export interface WorkflowShellRequest {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}

export interface WorkflowShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface MCPStdioStartRequest {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  framing: "content-length" | "newline";
}

interface WailsAppApi {
  GetWorkspaceState: () => Promise<WorkspaceState>;
  SetWorkspaceDirectory: (path: string) => Promise<WorkspaceState>;
  SelectWorkspaceDirectory: () => Promise<string>;
  OpenDeveloperTools: () => Promise<boolean>;
  SelectLocalFile: () => Promise<LocalFileResult | null>;
  SelectLocalFilePath: () => Promise<string>;
  SelectDirectoryPath: () => Promise<string>;
  SelectDirectoryBase: () => Promise<string>;
  SetDirectoryBase: (path: string) => Promise<string>;
  GetDirectoryBase: () => Promise<string>;
  ListFileTree: () => Promise<FileTreeNode[]>;
  ListWorkspaceTree: () => Promise<FileTreeNode[]>;
  OpenContainingFolder: (path: string) => Promise<void>;
  MoveDirectoryIntoWorkspace: (
    path: string,
    destinationName: string,
    leaveLink: boolean,
  ) => Promise<WorkspaceDirectoryMoveResult>;
  MovePathIntoWorkspace: (
    path: string,
    destinationDirectory: string,
    destinationName: string,
    leaveLink: boolean,
  ) => Promise<WorkspaceDirectoryMoveResult>;
  MoveLocalPathIntoWorkspace: (
    path: string,
    destinationDirectory: string,
    destinationName: string,
    leaveLink: boolean,
  ) => Promise<WorkspaceDirectoryMoveResult>;
  ListWorkspaceFiles: () => Promise<DirectoryFileEntry[]>;
  ReadWorkspaceFile: (path: string) => Promise<LocalFileResult>;
  WriteWorkspaceFile: (path: string, content: string) => Promise<void>;
  WriteWorkspaceBinaryFile: (
    path: string,
    contentBase64: string,
  ) => Promise<void>;
  CreateWorkspaceDirectory: (path: string) => Promise<void>;
  RenameWorkspaceFile: (oldPath: string, newPath: string) => Promise<void>;
  DeleteWorkspaceFile: (path: string) => Promise<void>;
  ReadFile: (path: string) => Promise<LocalFileResult>;
  OpenLocalFileDefault: (path: string) => Promise<void>;
  WriteFile: (path: string, content: string) => Promise<void>;
  ReadWorkspaceStateFile: (name: string) => Promise<string>;
  WriteWorkspaceStateFile: (name: string, content: string) => Promise<void>;
  SaveHTMLExport: (sourcePath: string, htmlContent: string) => Promise<string>;
  OpenHTMLInBrowser: (path: string) => Promise<void>;
  CreateDirectory: (path: string) => Promise<void>;
  RenameFile: (oldPath: string, newPath: string) => Promise<void>;
  DeleteFile: (path: string) => Promise<void>;
  DuplicateFile: (path: string) => Promise<string>;
  TrashFile: (path: string) => Promise<void>;
  ListTrash: () => Promise<TrashEntry[]>;
  RestoreTrash: (id: string) => Promise<void>;
  ListFileHistory: (path: string) => Promise<FileHistoryEntry[]>;
  RestoreFileHistory: (path: string, id: string) => Promise<void>;
  SearchFiles: (query: string, limit: number) => Promise<FileSearchResult[]>;
  SearchWorkspaceFiles: (
    query: string,
    limit: number,
  ) => Promise<FileSearchResult[]>;
  FileInventory: () => Promise<DirectoryFileEntry[]>;
  CheckWebEmbeddable: (
    url: string,
  ) => Promise<{ embeddable: boolean; reason?: string }>;
  SyncRAG: (
    request: { name: string; setting: RAGSetting },
  ) => Promise<RAGSyncResult>;
  CancelRAGSync: (name: string) => Promise<boolean>;
  GetRAGIndexedFiles: (name: string) => Promise<RAGIndexedFile[]>;
  ExtractWorkspacePDFText: (path: string, pageLabel: string) => Promise<string>;
  ReadWorkspacePDFPages: (
    path: string,
    pageLabel: string,
  ) => Promise<LocalFileResult>;
  SearchRAG: (
    request: { name: string; query: string; setting: RAGSetting },
  ) => Promise<RAGSearchResult[]>;
  GetAdjacentRAGChunks: (
    request: {
      name: string;
      filePath: string;
      chunkIndex: number;
      before: number;
      after: number;
    },
  ) => Promise<RAGSearchResult[]>;
  GetRAGStatus: (name: string) => Promise<RAGStatus>;
  DeleteRAGIndex: (name: string) => Promise<void>;
  RenameRAGIndex: (oldName: string, newName: string) => Promise<void>;
  SelectVertexOAuthClient: () => Promise<VertexOAuthClient | null>;
  ConnectVertexOAuth: (
    clientId: string,
    clientSecret: string,
  ) => Promise<VertexOAuthStatus>;
  GetVertexOAuthStatus: () => Promise<VertexOAuthStatus>;
  DisconnectVertexOAuth: () => Promise<void>;
  ConnectMCPOAuth: (request: MCPOAuthConnectRequest) => Promise<MCPOAuthStatus>;
  GetMCPOAuthStatus: (
    serverID: string,
    serverURL: string,
  ) => Promise<MCPOAuthStatus>;
  MCPOAuthAccessToken: (serverID: string, serverURL: string) => Promise<string>;
  DisconnectMCPOAuth: (serverID: string) => Promise<void>;
  WriteBinaryFile: (path: string, contentBase64: string) => Promise<void>;
  Chat: (request: ChatRequest) => Promise<ChatResult>;
  CancelChat: (streamID: string) => Promise<boolean>;
  SelectCLIPath: () => Promise<string>;
  VerifyCLI: (kind: string, customPath: string) => Promise<CLIVerifyResult>;
  StopCLI: () => Promise<boolean>;
  ApplyPendingFileAction: (action: PendingFileAction) => Promise<void>;
  ResolveChatTool: (
    requestID: string,
    resultJSON: string,
    errorMessage: string,
  ) => Promise<boolean>;
  ResolveChatFunctionLimit: (
    requestID: string,
    extension: number,
  ) => Promise<boolean>;
  VerifyDiscordToken: (token: string) => Promise<DiscordStatus>;
  StartDiscordBot: (request: DiscordBotRequest) => Promise<DiscordStatus>;
  StopDiscordBot: () => Promise<boolean>;
  GetDiscordStatus: () => Promise<DiscordStatus>;
  ListPluginIDs: () => Promise<string[]>;
  InstallPluginFiles: (
    pluginID: string,
    files: Record<string, string>,
    installJSON: string,
  ) => Promise<void>;
  UninstallPlugin: (pluginID: string) => Promise<void>;
  FetchPluginAsset: (pluginID: string, name: string) => Promise<string>;
  ExternalHTTPRequest: (
    request: ExternalHTTPRequest,
  ) => Promise<ExternalHTTPResponse>;
  WorkflowHTTPRequest: (
    request: ExternalHTTPRequest,
  ) => Promise<ExternalHTTPResponse>;
  ExecuteWorkflowShell: (
    request: WorkflowShellRequest,
  ) => Promise<WorkflowShellResult>;
  MCPStdioStart: (request: MCPStdioStartRequest) => Promise<string>;
  MCPStdioRequest: (
    sessionID: string,
    method: string,
    paramsJSON: string,
  ) => Promise<string>;
  MCPStdioClose: (sessionID: string) => Promise<boolean>;
  SelectExternalEditor: () => Promise<string>;
  ReadLocalFile: (path: string) => Promise<LocalFileResult>;
  InspectLocalPath: (path: string) => Promise<LocalPathInfo>;
  ReadMemoFile: (path: string) => Promise<MemoFileResult>;
  ListMemoFiles: (dir: string) => Promise<MemoListEntry[] | null>;
  AppendMemoFile: (path: string, content: string) => Promise<void>;
  WriteMemoFileAtomic: (path: string, content: string) => Promise<void>;
  StartupFilePaths: () => Promise<string[]>;
  OpenExternalEditor: (editorPath: string, filePath: string) => Promise<void>;
}

interface WailsRuntimeApi {
  OnFileDrop: (
    callback: (x: number, y: number, paths: string[]) => void,
    useDropTarget?: boolean,
  ) => void;
  OnFileDropOff: () => void;
  EventsOn: (eventName: string, callback: (event: never) => void) => () => void;
}

export function onChatStream(
  callback: (event: ChatStreamEvent) => void,
): () => void {
  return window.runtime?.EventsOn?.(
    "chat:stream",
    callback as (event: never) => void,
  ) ?? (() => undefined);
}

export function onChatToolRequest(
  callback: (event: ChatToolRequest) => void,
): () => void {
  return window.runtime?.EventsOn?.(
    "chat:tool-request",
    callback as (event: never) => void,
  ) ?? (() => undefined);
}

export function onChatFunctionLimitRequest(
  callback: (event: ChatFunctionLimitRequest) => void,
): () => void {
  return window.runtime?.EventsOn?.(
    "chat:function-limit-request",
    callback as (event: never) => void,
  ) ?? (() => undefined);
}

export function onRAGSyncProgress(
  callback: (event: RAGSyncProgress) => void,
): () => void {
  return window.runtime?.EventsOn?.(
    "rag:sync-progress",
    callback as (event: never) => void,
  ) ?? (() => undefined);
}

export async function resolveChatTool(
  requestId: string,
  result: unknown,
  errorMessage = "",
): Promise<boolean> {
  const api = appApi();
  if (!api) return false;
  return await api.ResolveChatTool(
    requestId,
    result === undefined ? "" : JSON.stringify(result),
    errorMessage,
  );
}

export async function resolveChatFunctionLimit(
  requestId: string,
  extension: number,
): Promise<boolean> {
  return await appApi()?.ResolveChatFunctionLimit(requestId, extension) ??
    false;
}

declare global {
  interface Window {
    go?: {
      main?: {
        App?: WailsAppApi;
      };
    };
    runtime?: WailsRuntimeApi;
  }
}

function appApi(): WailsAppApi | null {
  return window.go?.main?.App ?? null;
}

export function hasWailsBackend(): boolean {
  return appApi() !== null;
}

export async function getWorkspaceState(): Promise<WorkspaceState> {
  return await appApi()?.GetWorkspaceState() ??
    { activeWorkspaceId: "", workspaces: [] };
}

export async function setWorkspaceDirectory(
  path: string,
): Promise<WorkspaceState> {
  const api = appApi();
  if (!api) throw new Error("Workspace directory requires the desktop app.");
  return await api.SetWorkspaceDirectory(path);
}

export async function selectWorkspaceDirectory(): Promise<string> {
  return await appApi()?.SelectWorkspaceDirectory() ?? "";
}

export async function openDeveloperTools(): Promise<boolean> {
  return await appApi()?.OpenDeveloperTools() ?? false;
}

export async function selectLocalFile(): Promise<LocalFileResult | null> {
  return await appApi()?.SelectLocalFile() ?? null;
}

export async function selectLocalFilePath(): Promise<string> {
  return await appApi()?.SelectLocalFilePath() ?? "";
}

export async function selectDirectoryPath(): Promise<string> {
  return await appApi()?.SelectDirectoryPath() ?? "";
}

export async function selectDirectoryBase(): Promise<string> {
  return await appApi()?.SelectDirectoryBase() ?? "";
}

export async function setDirectoryBase(path: string): Promise<string> {
  return await appApi()?.SetDirectoryBase(path) ?? path;
}

export async function getDirectoryBase(): Promise<string> {
  return await appApi()?.GetDirectoryBase() ?? "";
}

export async function listFileTree(): Promise<FileTreeNode[]> {
  return await appApi()?.ListFileTree() ?? [];
}

export async function listWorkspaceTree(): Promise<FileTreeNode[]> {
  return await appApi()?.ListWorkspaceTree() ?? [];
}

export async function openContainingFolder(path: string): Promise<void> {
  const api = appApi();
  if (!api) {
    throw new Error("Opening a containing folder requires the desktop app.");
  }
  await api.OpenContainingFolder(path);
}

export async function listWorkspaceFiles(): Promise<DirectoryFileEntry[]> {
  return await appApi()?.ListWorkspaceFiles() ?? [];
}

export async function readWorkspaceFile(
  path: string,
): Promise<LocalFileResult | null> {
  if (!path) return null;
  return await appApi()?.ReadWorkspaceFile(path) ?? null;
}

export async function openLocalFileDefault(path: string): Promise<void> {
  const api = appApi();
  if (!api) {
    throw new Error("Opening a file externally requires the desktop app.");
  }
  await api.OpenLocalFileDefault(path);
}

export async function writeWorkspaceFile(
  path: string,
  content: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Workspace file writes require the desktop app.");
  await api.WriteWorkspaceFile(path, content);
}

export async function writeWorkspaceBinaryFile(
  path: string,
  contentBase64: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Workspace binary writes require the desktop app.");
  await api.WriteWorkspaceBinaryFile(path, contentBase64);
}

export async function createWorkspaceDirectory(path: string): Promise<void> {
  const api = appApi();
  if (!api) {
    throw new Error("Workspace directory creation requires the desktop app.");
  }
  await api.CreateWorkspaceDirectory(path);
}

export async function renameWorkspaceFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Workspace file rename requires the desktop app.");
  await api.RenameWorkspaceFile(oldPath, newPath);
}

export async function deleteWorkspaceFile(path: string): Promise<void> {
  const api = appApi();
  if (!api) {
    throw new Error("Workspace file deletion requires the desktop app.");
  }
  await api.DeleteWorkspaceFile(path);
}

export async function readFile(path: string): Promise<LocalFileResult | null> {
  if (!path) return null;
  try {
    return await appApi()?.ReadFile(path) ?? null;
  } catch (error) {
    notifyWorkspaceRequired(error);
    throw error;
  }
}

function notifyWorkspaceRequired(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (/Workspace is required/i.test(message)) {
    window.dispatchEvent(
      new CustomEvent("llm-hub:workspace-required", {
        detail: { message },
      }),
    );
  }
}

export async function writeFile(path: string, content: string): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("File writes require the desktop app.");
  try {
    await api.WriteFile(path, content);
  } catch (error) {
    notifyWorkspaceRequired(error);
    throw error;
  }
}

export async function readWorkspaceStateFile(name: string): Promise<string> {
  const api = appApi();
  if (!api) return "";
  return await api.ReadWorkspaceStateFile(name);
}

export async function writeWorkspaceStateFile(
  name: string,
  content: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Workspace state writes require the desktop app.");
  await api.WriteWorkspaceStateFile(name, content);
}

export async function saveHTMLExport(
  sourcePath: string,
  htmlContent: string,
): Promise<string> {
  const api = appApi();
  if (!api) throw new Error("HTML export requires the desktop app.");
  return await api.SaveHTMLExport(sourcePath, htmlContent);
}

export async function openHTMLInBrowser(path: string): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Opening a browser requires the desktop app.");
  await api.OpenHTMLInBrowser(path);
}

export async function createDirectory(path: string): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Directory creation requires the desktop app.");
  try {
    await api.CreateDirectory(path);
  } catch (error) {
    notifyWorkspaceRequired(error);
    throw error;
  }
}

export async function moveDirectoryIntoWorkspace(
  path: string,
  destinationName: string,
  leaveLink: boolean,
): Promise<WorkspaceDirectoryMoveResult> {
  const api = appApi();
  if (!api) {
    throw new Error("Moving into the Workspace requires the desktop app.");
  }
  return await api.MoveDirectoryIntoWorkspace(path, destinationName, leaveLink);
}

export async function movePathIntoWorkspace(
  path: string,
  destinationDirectory: string,
  destinationName: string,
  leaveLink: boolean,
): Promise<WorkspaceDirectoryMoveResult> {
  const api = appApi();
  if (!api) {
    throw new Error("Moving into the Workspace requires the desktop app.");
  }
  return await api.MovePathIntoWorkspace(
    path,
    destinationDirectory,
    destinationName,
    leaveLink,
  );
}

export async function moveLocalPathIntoWorkspace(
  path: string,
  destinationDirectory: string,
  destinationName: string,
  leaveLink: boolean,
): Promise<WorkspaceDirectoryMoveResult> {
  const api = appApi();
  if (!api) {
    throw new Error("Moving into the Workspace requires the desktop app.");
  }
  return await api.MoveLocalPathIntoWorkspace(
    path,
    destinationDirectory,
    destinationName,
    leaveLink,
  );
}

export async function renameFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("File rename requires the desktop app.");
  try {
    await api.RenameFile(oldPath, newPath);
  } catch (error) {
    notifyWorkspaceRequired(error);
    throw error;
  }
}

export async function deleteFile(path: string): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("File deletion requires the desktop app.");
  try {
    await api.DeleteFile(path);
  } catch (error) {
    notifyWorkspaceRequired(error);
    throw error;
  }
}
export async function duplicateFile(path: string): Promise<string> {
  const api = appApi();
  if (!api) throw new Error("File duplication requires the desktop app.");
  return api.DuplicateFile(path);
}
export async function trashFile(path: string): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Trash requires the desktop app.");
  await api.TrashFile(path);
}
export async function listTrash(): Promise<TrashEntry[]> {
  return await appApi()?.ListTrash() ?? [];
}
export async function restoreTrash(id: string): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Trash restore requires the desktop app.");
  await api.RestoreTrash(id);
}
export async function listFileHistory(
  path: string,
): Promise<FileHistoryEntry[]> {
  return await appApi()?.ListFileHistory(path) ?? [];
}
export async function restoreFileHistory(
  path: string,
  id: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("History restore requires the desktop app.");
  await api.RestoreFileHistory(path, id);
}

export async function searchFiles(
  query: string,
  limit = 50,
): Promise<FileSearchResult[]> {
  if (!query.trim()) return [];
  return await appApi()?.SearchFiles(query, limit) ?? [];
}

export async function searchWorkspaceFiles(
  query: string,
  limit = 50,
): Promise<FileSearchResult[]> {
  if (!query.trim()) return [];
  return await appApi()?.SearchWorkspaceFiles(query, limit) ?? [];
}

export async function fileInventory(): Promise<DirectoryFileEntry[]> {
  return await appApi()?.FileInventory() ?? [];
}

export async function checkWebEmbeddable(
  url: string,
): Promise<{ embeddable: boolean; reason?: string }> {
  return await appApi()?.CheckWebEmbeddable(url) ?? { embeddable: true };
}

export async function syncRAG(
  name: string,
  setting: RAGSetting,
): Promise<RAGSyncResult> {
  const api = appApi();
  if (!api) throw new Error("RAG sync requires the desktop app.");
  return await api.SyncRAG({ name, setting });
}

export async function cancelRAGSync(name: string): Promise<boolean> {
  return await appApi()?.CancelRAGSync(name) ?? false;
}

export async function getRAGIndexedFiles(
  name: string,
): Promise<RAGIndexedFile[]> {
  return await appApi()?.GetRAGIndexedFiles(name) ?? [];
}

export async function extractWorkspacePDFText(
  path: string,
  pageLabel = "",
): Promise<string> {
  return await appApi()?.ExtractWorkspacePDFText(path, pageLabel) ?? "";
}

export async function readWorkspacePDFPages(
  path: string,
  pageLabel: string,
): Promise<LocalFileResult | null> {
  return await appApi()?.ReadWorkspacePDFPages(path, pageLabel) ?? null;
}

export async function searchRAG(
  name: string,
  query: string,
  setting: RAGSetting,
): Promise<RAGSearchResult[]> {
  const api = appApi();
  if (!api) return [];
  return await api.SearchRAG({ name, query, setting });
}

export async function getAdjacentRAGChunks(
  name: string,
  filePath: string,
  chunkIndex: number,
  before: number,
  after: number,
): Promise<RAGSearchResult[]> {
  return await appApi()?.GetAdjacentRAGChunks({
    name,
    filePath,
    chunkIndex,
    before,
    after,
  }) ?? [];
}

export async function getRAGStatus(name: string): Promise<RAGStatus> {
  return await appApi()?.GetRAGStatus(name) ??
    { chunkCount: 0, fileCount: 0, dimension: 0, embeddingModel: "" };
}

export async function deleteRAGIndex(name: string): Promise<void> {
  await appApi()?.DeleteRAGIndex(name);
}

export async function renameRAGIndex(
  oldName: string,
  newName: string,
): Promise<void> {
  await appApi()?.RenameRAGIndex(oldName, newName);
}

export async function selectVertexOAuthClient(): Promise<
  VertexOAuthClient | null
> {
  return await appApi()?.SelectVertexOAuthClient() ?? null;
}

export async function connectVertexOAuth(
  clientId: string,
  clientSecret: string,
): Promise<VertexOAuthStatus> {
  const api = appApi();
  if (!api) throw new Error("Google OAuth requires the desktop app.");
  return await api.ConnectVertexOAuth(clientId, clientSecret);
}

export async function getVertexOAuthStatus(): Promise<VertexOAuthStatus> {
  return await appApi()?.GetVertexOAuthStatus() ?? { connected: false };
}

export async function disconnectVertexOAuth(): Promise<void> {
  await appApi()?.DisconnectVertexOAuth();
}

export async function connectMCPOAuth(
  request: MCPOAuthConnectRequest,
): Promise<MCPOAuthStatus> {
  const api = appApi();
  if (!api) throw new Error("MCP OAuth requires the desktop app.");
  return await api.ConnectMCPOAuth(request);
}

export async function getMCPOAuthStatus(
  serverID: string,
  serverURL: string,
): Promise<MCPOAuthStatus> {
  return await appApi()?.GetMCPOAuthStatus(serverID, serverURL) ??
    { connected: false };
}

export async function mcpOAuthAccessToken(
  serverID: string,
  serverURL: string,
): Promise<string> {
  const api = appApi();
  if (!api) throw new Error("MCP OAuth requires the desktop app.");
  return await api.MCPOAuthAccessToken(serverID, serverURL);
}

export async function disconnectMCPOAuth(serverID: string): Promise<void> {
  await appApi()?.DisconnectMCPOAuth(serverID);
}

export async function writeBinaryFile(
  path: string,
  contentBase64: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Binary file writes require the desktop app.");
  await api.WriteBinaryFile(path, contentBase64);
}

export async function chat(request: ChatRequest): Promise<ChatResult> {
  const api = appApi();
  if (!api) throw new Error("Chat requires the desktop app.");
  return await api.Chat(request);
}

export async function cancelChat(streamID: string): Promise<boolean> {
  return await appApi()?.CancelChat(streamID) ?? false;
}

export async function selectCLIPath(): Promise<string> {
  return await appApi()?.SelectCLIPath() ?? "";
}

export async function verifyCLI(
  kind: string,
  customPath: string,
): Promise<CLIVerifyResult> {
  const api = appApi();
  if (!api) {
    return {
      success: false,
      error: "CLI verification requires the desktop app.",
    };
  }
  return await api.VerifyCLI(kind, customPath);
}

export async function stopCLI(): Promise<boolean> {
  return await appApi()?.StopCLI() ?? false;
}

export async function applyPendingFileAction(
  action: PendingFileAction,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("File actions require the desktop app.");
  await api.ApplyPendingFileAction(action);
}

export async function verifyDiscordToken(
  token: string,
): Promise<DiscordStatus> {
  const api = appApi();
  if (!api) throw new Error("Discord requires the desktop app.");
  return await api.VerifyDiscordToken(token);
}

export async function startDiscordBot(
  request: DiscordBotRequest,
): Promise<DiscordStatus> {
  const api = appApi();
  if (!api) throw new Error("Discord requires the desktop app.");
  return await api.StartDiscordBot(request);
}

export async function stopDiscordBot(): Promise<boolean> {
  return await appApi()?.StopDiscordBot() ?? false;
}

export async function getDiscordStatus(): Promise<DiscordStatus> {
  return await appApi()?.GetDiscordStatus() ??
    { running: false, connected: false };
}

export async function listPluginIDs(): Promise<string[]> {
  return await appApi()?.ListPluginIDs() ?? [];
}

export async function installPluginFiles(
  pluginID: string,
  files: Record<string, string>,
  installJSON: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Plugin installation requires the desktop app.");
  await api.InstallPluginFiles(pluginID, files, installJSON);
}

export async function uninstallManagedPlugin(pluginID: string): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Plugin uninstall requires the desktop app.");
  await api.UninstallPlugin(pluginID);
}

export async function fetchManagedPluginAsset(
  pluginID: string,
  name: string,
): Promise<ArrayBuffer> {
  const api = appApi();
  if (!api) throw new Error("Plugin assets require the desktop app.");
  const encoded = await api.FetchPluginAsset(pluginID, name);
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function externalHTTPRequest(
  request: ExternalHTTPRequest,
): Promise<ExternalHTTPResponse> {
  const api = appApi();
  if (!api) throw new Error("External requests require the desktop app.");
  return await api.ExternalHTTPRequest(request);
}

export async function workflowHTTPRequest(
  request: ExternalHTTPRequest,
): Promise<ExternalHTTPResponse> {
  const api = appApi();
  if (!api) throw new Error("Workflow HTTP nodes require the desktop app.");
  return await api.WorkflowHTTPRequest(request);
}

export async function executeWorkflowShell(
  request: WorkflowShellRequest,
): Promise<WorkflowShellResult> {
  const api = appApi();
  if (!api) throw new Error("Workflow shell nodes require the desktop app.");
  return await api.ExecuteWorkflowShell(request);
}

export async function mcpStdioStart(
  request: MCPStdioStartRequest,
): Promise<string> {
  const api = appApi();
  if (!api) throw new Error("MCP stdio requires the desktop app.");
  return await api.MCPStdioStart(request);
}

export async function mcpStdioRequest(
  sessionID: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const api = appApi();
  if (!api) throw new Error("MCP stdio requires the desktop app.");
  const response = JSON.parse(
    await api.MCPStdioRequest(sessionID, method, JSON.stringify(params)),
  ) as { result?: Record<string, unknown>; error?: { message?: string } };
  if (response.error) {
    throw new Error(response.error.message || `MCP ${method} failed.`);
  }
  return response.result ?? {};
}

export async function mcpStdioClose(sessionID: string): Promise<boolean> {
  return await appApi()?.MCPStdioClose(sessionID) ?? false;
}

export async function readMemoFile(path: string): Promise<MemoFileResult> {
  if (!path) return { exists: false, content: "" };
  return await appApi()?.ReadMemoFile(path) ?? { exists: false, content: "" };
}

export async function listMemoFiles(dir: string): Promise<MemoListEntry[]> {
  if (!dir) return [];
  return await appApi()?.ListMemoFiles(dir) ?? [];
}

export async function appendMemoFile(
  path: string,
  content: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Memo files require the desktop app.");
  await api.AppendMemoFile(path, content);
}

export async function writeMemoFileAtomic(
  path: string,
  content: string,
): Promise<void> {
  const api = appApi();
  if (!api) throw new Error("Memo files require the desktop app.");
  await api.WriteMemoFileAtomic(path, content);
}

export async function selectExternalEditor(): Promise<string> {
  return await appApi()?.SelectExternalEditor() ?? "";
}

export async function readLocalFile(
  path: string,
): Promise<LocalFileResult | null> {
  if (!path) return null;
  return await appApi()?.ReadLocalFile(path) ?? null;
}

export async function inspectLocalPath(
  path: string,
): Promise<LocalPathInfo | null> {
  return await appApi()?.InspectLocalPath(path) ?? null;
}

export async function startupFilePaths(): Promise<string[]> {
  return await appApi()?.StartupFilePaths() ?? [];
}

export async function openExternalEditor(
  editorPath: string,
  filePath: string,
): Promise<void> {
  if (!editorPath || !filePath) return;
  await appApi()?.OpenExternalEditor(editorPath, filePath);
}

type WailsFileDropCallback = (
  x: number,
  y: number,
  paths: string[],
) => void;

const wailsFileDropCallbacks = new Set<WailsFileDropCallback>();

export function onWailsFileDrop(
  callback: WailsFileDropCallback,
): (() => void) | null {
  const runtime = window.runtime;
  if (!runtime?.OnFileDrop || !runtime.OnFileDropOff) return null;
  wailsFileDropCallbacks.add(callback);
  if (wailsFileDropCallbacks.size === 1) {
    runtime.OnFileDrop((x, y, paths) => {
      for (const listener of wailsFileDropCallbacks) listener(x, y, paths);
    }, false);
  }
  return () => {
    wailsFileDropCallbacks.delete(callback);
    if (wailsFileDropCallbacks.size === 0) runtime.OnFileDropOff();
  };
}
