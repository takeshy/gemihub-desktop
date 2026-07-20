import React from "react";
import ReactDOM from "react-dom";
import {
  createDirectory,
  createWorkspaceDirectory,
  deleteWorkspaceFile,
  deleteFile,
  externalHTTPRequest,
  fileInventory,
  fetchManagedPluginAsset,
  listWorkspaceFiles,
  getWorkspaceState,
  listFileTree,
  readFile,
  readWorkspaceFile,
  getDirectoryBase,
  renameFile,
  renameWorkspaceFile,
  searchFiles,
  writeFile,
  writeBinaryFile,
  writeWorkspaceBinaryFile,
  writeWorkspaceFile,
} from "../lib/wailsBackend";
import type { PluginAPI, PluginLLMChatOptions, PluginLLMModel, PluginPermission, PluginSettingsTab, PluginSlashCommand, PluginView } from "./types";
import { registerPluginWidget } from "../dashboard/widgetRegistry";

export interface PluginRegistrationCallbacks {
  onRegisterView: (view: PluginView) => void;
  onRegisterSettingsTab: (tab: PluginSettingsTab) => void;
  onRegisterSlashCommand: (command: PluginSlashCommand) => void;
  onLLMChat?: (messages: Array<{ role: string; content: string }>, options?: PluginLLMChatOptions) => Promise<string>;
  onLLMListModels?: () => Promise<PluginLLMModel[]>;
}

function safePluginId(pluginId: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(pluginId)) throw new Error("Invalid plugin id");
  return pluginId;
}

function pluginFilePath(path: string, scope: "workspace" | "files"): string {
  const value = path.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    throw new Error(`${scope} file API accepts relative paths only.`);
  }
  return value;
}

export function createPluginAPI(
  pluginId: string,
  language: string,
  permissions: PluginPermission[] | undefined,
  callbacks: PluginRegistrationCallbacks,
): PluginAPI {
  safePluginId(pluginId);
  const has = (permission: PluginPermission) => {
    if (!permissions) return true;
    if (permission === "files") return permissions.includes("files") || permissions.includes("drive");
    if (permission === "llm") return permissions.includes("llm") || permissions.includes("gemini");
    return permissions.includes(permission);
  };
  const api: PluginAPI = {
    language,
    registerView(view) {
      callbacks.onRegisterView({ ...view, id: `${pluginId}:${view.id}`, pluginId });
    },
    registerSettingsTab(tab) {
      callbacks.onRegisterSettingsTab({ ...tab, pluginId });
    },
    registerSlashCommand(command) {
      callbacks.onRegisterSlashCommand({ ...command, pluginId });
    },
    registerWidget(widget) {
      registerPluginWidget(pluginId, widget);
    },
    onActiveFileChanged(callback) {
      const listener = (event: Event) => callback((event as CustomEvent<{ path: string | null; name: string | null }>).detail);
      window.addEventListener("llm-hub:active-file", listener);
      return () => window.removeEventListener("llm-hub:active-file", listener);
    },
    selectFile(path) {
      window.dispatchEvent(new CustomEvent("llm-hub:select-file", { detail: { path } }));
    },
    React,
    ReactDOM,
    assets: { fetch: (name) => fetchManagedPluginAsset(pluginId, name) },
  };

  if (has("files")) {
    api.files = {
      async current() {
        const path = await getDirectoryBase();
        if (!path) return null;
        const normalized = path.replace(/[\\/]+$/, "");
        return {
          id: `files:${normalized}`,
          name: normalized.split(/[\\/]/).pop() || "Files",
          path: normalized,
          createdAt: 0,
        };
      },
      inventory: fileInventory,
      async read(path) {
        const result = await readFile(pluginFilePath(path, "files"));
        if (!result) throw new Error(`File not found: ${path}`);
        return result.content;
      },
      search: searchFiles,
      tree: listFileTree,
      async create(path, content) {
        if (content instanceof ArrayBuffer) {
          const bytes = new Uint8Array(content);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await writeBinaryFile(pluginFilePath(path, "files"), btoa(binary));
        } else await writeFile(pluginFilePath(path, "files"), content);
      },
      async update(path, content) {
        if (content instanceof ArrayBuffer) {
          const bytes = new Uint8Array(content);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await writeBinaryFile(pluginFilePath(path, "files"), btoa(binary));
        } else await writeFile(pluginFilePath(path, "files"), content);
      },
      createDirectory(path) { return createDirectory(pluginFilePath(path, "files")); },
      rename(oldPath, newPath) { return renameFile(pluginFilePath(oldPath, "files"), pluginFilePath(newPath, "files")); },
      delete(path) { return deleteFile(pluginFilePath(path, "files")); },
    };
    const writeWorkspaceContent = async (path: string, content: string | ArrayBuffer) => {
      if (content instanceof ArrayBuffer) {
        const bytes = new Uint8Array(content);
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        await writeWorkspaceBinaryFile(pluginFilePath(path, "workspace"), btoa(binary));
      } else await writeWorkspaceFile(pluginFilePath(path, "workspace"), content);
    };
    api.workspaceFiles = {
      async current() {
        const state = await getWorkspaceState();
        const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
        return workspace ? { ...workspace, id: "workspace", name: "Workspace" } : null;
      },
      inventory: listWorkspaceFiles,
      async read(path) {
        const result = await readWorkspaceFile(pluginFilePath(path, "workspace"));
        if (!result) throw new Error(`Workspace file not found: ${path}`);
        return result.content;
      },
      create: writeWorkspaceContent,
      update: writeWorkspaceContent,
      createDirectory(path) { return createWorkspaceDirectory(pluginFilePath(path, "workspace")); },
      rename(oldPath, newPath) { return renameWorkspaceFile(pluginFilePath(oldPath, "workspace"), pluginFilePath(newPath, "workspace")); },
      delete(path) { return deleteWorkspaceFile(pluginFilePath(path, "workspace")); },
    };
  }
  if (has("network")) api.network = { request: externalHTTPRequest };
  if (has("llm") && callbacks.onLLMChat) {
    api.llm = {
      chat: callbacks.onLLMChat,
      listModels: callbacks.onLLMListModels ?? (async () => []),
    };
    api.gemini = api.llm;
  }

  if (has("storage")) {
    const storagePath = `.llm-hub/plugin-data/${safePluginId(pluginId)}.json`;
    const readAll = async (): Promise<Record<string, unknown>> => {
      try {
        const result = await readWorkspaceFile(storagePath);
        return result?.content ? JSON.parse(result.content) as Record<string, unknown> : {};
      } catch {
        return {};
      }
    };
    api.storage = {
      async get(key) { return (await readAll())[key]; },
      async set(key, value) {
        const current = await readAll();
        current[key] = value;
        await writeWorkspaceFile(storagePath, JSON.stringify(current, null, 2));
      },
      getAll: readAll,
    };
  }

  return api;
}
