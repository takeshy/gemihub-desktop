import React from "react";
import ReactDOM from "react-dom";
import {
  createDirectory,
  createProjectDirectory,
  deleteProjectFile,
  deleteFile,
  externalHTTPRequest,
  fetchManagedPluginAsset,
  listProjectFiles,
  listProjects,
  listFileTree,
  readFile,
  readProjectFile,
  renameFile,
  renameProjectFile,
  searchFiles,
  writeFile,
  writeBinaryFile,
  writeProjectBinaryFile,
  writeProjectFile,
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
      async read(path) {
        const result = await readFile(path);
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
          await writeBinaryFile(path, btoa(binary));
        } else await writeFile(path, content);
      },
      async update(path, content) {
        if (content instanceof ArrayBuffer) {
          const bytes = new Uint8Array(content);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await writeBinaryFile(path, btoa(binary));
        } else await writeFile(path, content);
      },
      createDirectory,
      rename: renameFile,
      delete: deleteFile,
    };
    const writeProjectContent = async (path: string, content: string | ArrayBuffer) => {
      if (content instanceof ArrayBuffer) {
        const bytes = new Uint8Array(content);
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        await writeProjectBinaryFile(path, btoa(binary));
      } else await writeProjectFile(path, content);
    };
    api.projectFiles = {
      async current() {
        const state = await listProjects();
        return state.projects.find((project) => project.id === state.activeProjectId) ?? null;
      },
      inventory: listProjectFiles,
      async read(path) {
        const result = await readProjectFile(path);
        if (!result) throw new Error(`Project file not found: ${path}`);
        return result.content;
      },
      create: writeProjectContent,
      update: writeProjectContent,
      createDirectory: createProjectDirectory,
      rename: renameProjectFile,
      delete: deleteProjectFile,
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
        const result = await readFile(storagePath);
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
        await writeFile(storagePath, JSON.stringify(current, null, 2));
      },
      getAll: readAll,
    };
  }

  return api;
}
