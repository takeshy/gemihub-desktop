import React from "react";
import ReactDOM from "react-dom";
import {
  createDirectory,
  createWorkspaceDirectory,
  deleteFile,
  deleteWorkspaceFile,
  externalHTTPRequest,
  fetchManagedPluginAsset,
  fileInventory,
  getDirectoryBase,
  getWorkspaceState,
  listFileTree,
  listWorkspaceFiles,
  readFile,
  readWorkspaceFile,
  renameFile,
  renameWorkspaceFile,
  searchFiles,
  writeBinaryFile,
  writeFile,
  writeWorkspaceBinaryFile,
  writeWorkspaceFile,
} from "../lib/wailsBackend";
import type {
  PluginAPI,
  PluginLLMChatOptions,
  PluginLLMModel,
  PluginPermission,
  PluginSettingsTab,
  PluginSlashCommand,
  PluginView,
} from "./types";
import { registerPluginWidget } from "../dashboard/widgetRegistry";
import {
  refreshFileTreeDecorations,
  registerFileTreeDecorationProvider,
} from "./fileTreeExtensions";
import {
  registerFileTreeContextMenuItem,
  registerFileViewerAction,
} from "./fileActions";

interface FileActionRegistrationState {
  active: boolean;
  disposers: Set<() => void>;
}

const fileActionRegistrations = new WeakMap<
  PluginAPI,
  FileActionRegistrationState
>();

export function unregisterPluginAPIFileActions(api: PluginAPI): void {
  const state = fileActionRegistrations.get(api);
  if (!state) return;
  state.active = false;
  for (const dispose of state.disposers) dispose();
  state.disposers.clear();
}

export interface PluginRegistrationCallbacks {
  onRegisterView: (view: PluginView) => void;
  onRegisterSettingsTab: (tab: PluginSettingsTab) => void;
  onRegisterSlashCommand: (command: PluginSlashCommand) => void;
  onLLMChat?: (
    messages: Array<{ role: string; content: string }>,
    options?: PluginLLMChatOptions,
  ) => Promise<string>;
  onLLMListModels?: () => Promise<PluginLLMModel[]>;
}

function safePluginId(pluginId: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(pluginId)) {
    throw new Error("Invalid plugin id");
  }
  return pluginId;
}

function pluginFilePath(path: string, scope: "workspace" | "files"): string {
  const value = path.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    throw new Error(`${scope} file API accepts relative paths only.`);
  }
  const segments: string[] = [];
  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  const normalized = segments.join("/").toLowerCase();
  if (normalized === ".llm-hub" || normalized.startsWith(".llm-hub/")) {
    throw new Error(
      `${scope} file API cannot access protected application files.`,
    );
  }
  return value;
}

function notifyFileChanged(
  scope: "workspace" | "files",
  path: string,
  kind: "created" | "updated" | "renamed" | "deleted",
  oldPath?: string,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("llm-hub:file-tree-refresh", {
      detail: { scope, path, oldPath, kind },
    }),
  );
}

export function createPluginAPI(
  pluginId: string,
  language: string,
  permissions: PluginPermission[] | undefined,
  callbacks: PluginRegistrationCallbacks,
): PluginAPI {
  safePluginId(pluginId);
  const fileActionState: FileActionRegistrationState = {
    active: true,
    disposers: new Set(),
  };
  const trackFileAction = (register: () => () => void): () => void => {
    if (!fileActionState.active) return () => undefined;
    const disposeRegistration = register();
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      fileActionState.disposers.delete(dispose);
      disposeRegistration();
    };
    fileActionState.disposers.add(dispose);
    return dispose;
  };
  const has = (permission: PluginPermission) => {
    if (!permissions) return true;
    if (permission === "files") {
      return permissions.includes("files") || permissions.includes("drive");
    }
    if (permission === "llm") {
      return permissions.includes("llm") || permissions.includes("gemini");
    }
    return permissions.includes(permission);
  };
  const api: PluginAPI = {
    language,
    registerView(view) {
      callbacks.onRegisterView({
        ...view,
        id: `${pluginId}:${view.id}`,
        pluginId,
      });
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
      const listener = (event: Event) =>
        callback(
          (event as CustomEvent<{ path: string | null; name: string | null }>)
            .detail,
        );
      window.addEventListener("llm-hub:active-file", listener);
      return () => window.removeEventListener("llm-hub:active-file", listener);
    },
    selectFile(path) {
      window.dispatchEvent(
        new CustomEvent("llm-hub:select-file", { detail: { path } }),
      );
    },
    React,
    ReactDOM,
    assets: { fetch: (name) => fetchManagedPluginAsset(pluginId, name) },
  };

  if (has("files")) {
    api.onFilesChanged = (callback) => {
      if (typeof window === "undefined") return () => undefined;
      const listener = (event: Event) => {
        const detail = (event as CustomEvent<
          {
            scope?: "workspace" | "files";
            path?: string;
            oldPath?: string;
            kind?: "created" | "updated" | "renamed" | "deleted" | "refresh";
          }
        >).detail;
        callback({ ...detail, kind: detail?.kind ?? "refresh" });
      };
      window.addEventListener("llm-hub:file-tree-refresh", listener);
      return () =>
        window.removeEventListener("llm-hub:file-tree-refresh", listener);
    };
    api.fileTree = {
      registerDecorationProvider(provider) {
        return registerFileTreeDecorationProvider(pluginId, provider);
      },
      refreshDecorations: refreshFileTreeDecorations,
      registerContextMenuItem(action) {
        return trackFileAction(() =>
          registerFileTreeContextMenuItem(pluginId, action)
        );
      },
    };
    api.fileViewer = {
      registerAction(action) {
        return trackFileAction(() =>
          registerFileViewerAction(pluginId, action)
        );
      },
    };
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
        const target = pluginFilePath(path, "files");
        if (content instanceof ArrayBuffer) {
          const bytes = new Uint8Array(content);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await writeBinaryFile(target, btoa(binary));
        } else await writeFile(target, content);
        notifyFileChanged("files", target, "created");
      },
      async update(path, content) {
        const target = pluginFilePath(path, "files");
        if (content instanceof ArrayBuffer) {
          const bytes = new Uint8Array(content);
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          await writeBinaryFile(target, btoa(binary));
        } else await writeFile(target, content);
        notifyFileChanged("files", target, "updated");
      },
      async createDirectory(path) {
        const target = pluginFilePath(path, "files");
        await createDirectory(target);
        notifyFileChanged("files", target, "created");
      },
      rename(oldPath, newPath) {
        const source = pluginFilePath(oldPath, "files");
        const target = pluginFilePath(newPath, "files");
        return renameFile(source, target).then(() => {
          notifyFileChanged("files", target, "renamed", source);
        });
      },
      delete(path) {
        const target = pluginFilePath(path, "files");
        return deleteFile(target).then(() => {
          notifyFileChanged("files", target, "deleted");
        });
      },
    };
    const writeWorkspaceContent = async (
      path: string,
      content: string | ArrayBuffer,
    ) => {
      const target = pluginFilePath(path, "workspace");
      if (content instanceof ArrayBuffer) {
        const bytes = new Uint8Array(content);
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        await writeWorkspaceBinaryFile(target, btoa(binary));
      } else await writeWorkspaceFile(target, content);
    };
    api.workspaceFiles = {
      async current() {
        const state = await getWorkspaceState();
        const workspace = state.workspaces.find((item) =>
          item.id === state.activeWorkspaceId
        );
        return workspace
          ? { ...workspace, id: "workspace", name: "Workspace" }
          : null;
      },
      inventory: listWorkspaceFiles,
      async read(path) {
        const result = await readWorkspaceFile(
          pluginFilePath(path, "workspace"),
        );
        if (!result) throw new Error(`Workspace file not found: ${path}`);
        return result.content;
      },
      async create(path, content) {
        await writeWorkspaceContent(path, content);
        notifyFileChanged(
          "workspace",
          pluginFilePath(path, "workspace"),
          "created",
        );
      },
      async update(path, content) {
        await writeWorkspaceContent(path, content);
        notifyFileChanged(
          "workspace",
          pluginFilePath(path, "workspace"),
          "updated",
        );
      },
      async createDirectory(path) {
        const target = pluginFilePath(path, "workspace");
        await createWorkspaceDirectory(target);
        notifyFileChanged("workspace", target, "created");
      },
      rename(oldPath, newPath) {
        const source = pluginFilePath(oldPath, "workspace");
        const target = pluginFilePath(newPath, "workspace");
        return renameWorkspaceFile(source, target).then(() => {
          notifyFileChanged("workspace", target, "renamed", source);
        });
      },
      delete(path) {
        const target = pluginFilePath(path, "workspace");
        return deleteWorkspaceFile(target).then(() => {
          notifyFileChanged("workspace", target, "deleted");
        });
      },
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
        return result?.content
          ? JSON.parse(result.content) as Record<string, unknown>
          : {};
      } catch {
        return {};
      }
    };
    api.storage = {
      async get(key) {
        return (await readAll())[key];
      },
      async set(key, value) {
        const current = await readAll();
        current[key] = value;
        await writeWorkspaceFile(storagePath, JSON.stringify(current, null, 2));
      },
      getAll: readAll,
    };
  }

  fileActionRegistrations.set(api, fileActionState);
  return api;
}
