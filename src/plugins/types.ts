import type React from "react";
import type ReactDOM from "react-dom";
import type {
  DirectoryFileEntry,
  ExternalHTTPRequest,
  ExternalHTTPResponse,
  FileSearchResult,
  FileTreeNode,
} from "../lib/wailsBackend";
import type { PluginWidgetDefinition } from "../dashboard/widgetRegistry";
import type { FileScope } from "../lib/fileRef";

export type PluginPermission =
  | "files"
  | "storage"
  | "network"
  | "llm"
  | "drive"
  | "gemini"
  | "calendar"
  | "gmail"
  | "sheets";

export interface PluginAsset {
  name: string;
  url: string;
  sha256?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  description?: string;
  author?: string;
  permissions?: PluginPermission[];
  assets?: PluginAsset[];
  hostPatches?: Record<string, string[]>;
}

export interface PluginConfig {
  id: string;
  enabled: boolean;
  version: string;
  source: "local" | "github";
  repo?: string;
  releaseTag?: string;
  permissions?: PluginPermission[];
}

export interface PluginViewProps {
  api: PluginAPI;
  language?: string;
  /** Web-compatible alias for the currently opened file path. */
  fileId?: string;
  filePath?: string;
  /** Storage root for filePath. Paths remain root-relative. */
  fileRoot?: FileScope;
  fileName?: string;
  fileContent?: string;
}

export interface PluginView {
  id: string;
  pluginId: string;
  name: string;
  icon?: string;
  location: "sidebar" | "main";
  extensions?: string[];
  component: React.ComponentType<PluginViewProps>;
}

export interface PluginSettingsTab {
  pluginId: string;
  name?: string;
  component: React.ComponentType<PluginViewProps & { onClose?: () => void }>;
}
export interface PluginSlashCommand {
  pluginId: string;
  name: string;
  description?: string;
  execute: (args: string) => string | Promise<string>;
}

export interface PluginLLMModel {
  id: string;
  label: string;
  provider: string;
  model: string;
}

export interface PluginLLMChatOptions {
  model?: string;
  /** Exact configured-model identifier returned by listModels(). */
  modelId?: string;
  systemPrompt?: string;
}

export interface PluginFileRoot {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export interface PluginAPI {
  language: string;
  registerView(
    view: Omit<PluginView, "id" | "pluginId"> & { id: string },
  ): void;
  registerSettingsTab(
    tab: { name?: string; component: PluginSettingsTab["component"] },
  ): void;
  registerSlashCommand(command: Omit<PluginSlashCommand, "pluginId">): void;
  registerWidget(widget: PluginWidgetDefinition): void;
  onActiveFileChanged(
    callback: (detail: { path: string | null; name: string | null }) => void,
  ): () => void;
  selectFile(path: string): void;
  files?: {
    current(): Promise<PluginFileRoot | null>;
    inventory(): Promise<DirectoryFileEntry[]>;
    read(path: string): Promise<string>;
    search(query: string, limit?: number): Promise<FileSearchResult[]>;
    tree(): Promise<FileTreeNode[]>;
    create(path: string, content: string | ArrayBuffer): Promise<void>;
    update(path: string, content: string | ArrayBuffer): Promise<void>;
    createDirectory(path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    delete(path: string): Promise<void>;
  };
  workspaceFiles?: {
    current(): Promise<PluginFileRoot | null>;
    inventory(): Promise<DirectoryFileEntry[]>;
    read(path: string): Promise<string>;
    create(path: string, content: string | ArrayBuffer): Promise<void>;
    update(path: string, content: string | ArrayBuffer): Promise<void>;
    createDirectory(path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    delete(path: string): Promise<void>;
  };
  network?: {
    request(request: ExternalHTTPRequest): Promise<ExternalHTTPResponse>;
  };
  llm?: {
    listModels(): Promise<PluginLLMModel[]>;
    chat(
      messages: Array<{ role: string; content: string }>,
      options?: PluginLLMChatOptions,
    ): Promise<string>;
  };
  gemini?: {
    chat(
      messages: Array<{ role: string; content: string }>,
      options?: { model?: string; systemPrompt?: string },
    ): Promise<string>;
  };
  storage?: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    getAll(): Promise<Record<string, unknown>>;
  };
  assets: { fetch(name: string): Promise<ArrayBuffer> };
  React: typeof React;
  ReactDOM: typeof ReactDOM;
}

export interface PluginInstance {
  id: string;
  manifest: PluginManifest;
  config: PluginConfig;
  instance: {
    onload: (api: PluginAPI) => void | Promise<void>;
    onunload?: () => void | Promise<void>;
  };
}
