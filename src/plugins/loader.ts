import React from "react";
import ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import { readWorkspaceFile } from "../lib/wailsBackend";
import type {
  PluginAPI,
  PluginConfig,
  PluginInstance,
  PluginManifest,
} from "./types";

function createRequire() {
  const modules: Record<string, unknown> = {
    react: React,
    "react-dom": ReactDOM,
    "react-dom/client": ReactDOMClient,
  };
  return (name: string) => {
    if (name in modules) return modules[name];
    throw new Error(`Module "${name}" is not available to plugins`);
  };
}

function executePluginCode(
  code: string,
): new () => PluginInstance["instance"] {
  const module = { exports: {} as unknown };
  const fn = new Function("module", "exports", "require", code);
  fn(module, module.exports, createRequire());
  const exported = module.exports as { default?: unknown };
  const PluginClass = typeof exported === "function"
    ? exported
    : exported?.default;
  if (typeof PluginClass !== "function") {
    throw new Error("Plugin must export a class");
  }
  return PluginClass as new () => PluginInstance["instance"];
}

async function readPluginText(pluginId: string, name: string): Promise<string> {
  const result = await readWorkspaceFile(`.llm-hub/plugins/${pluginId}/${name}`);
  if (!result) throw new Error(`Missing plugin asset: ${name}`);
  return result.content;
}

export async function readPluginManifest(
  pluginId: string,
): Promise<PluginManifest> {
  const parsed = JSON.parse(
    await readPluginText(pluginId, "manifest.json"),
  ) as PluginManifest;
  if (parsed.id !== pluginId || !parsed.name || !parsed.version) {
    throw new Error("Invalid plugin manifest");
  }
  return parsed;
}

export async function loadPlugin(
  config: PluginConfig,
  api: PluginAPI,
): Promise<PluginInstance> {
  const manifest = await readPluginManifest(config.id);
  const PluginClass = executePluginCode(
    await readPluginText(config.id, "main.js"),
  );
  const instance = new PluginClass();
  await instance.onload(api);
  try {
    const css = await readPluginText(config.id, "styles.css");
    const style = document.createElement("style");
    style.dataset.plugin = config.id;
    style.textContent = css;
    document.head.appendChild(style);
  } catch {
    // Optional stylesheet.
  }
  return { id: config.id, manifest, config, instance };
}

export async function unloadPlugin(plugin: PluginInstance): Promise<void> {
  await plugin.instance.onunload?.();
  document.querySelector(`style[data-plugin="${CSS.escape(plugin.id)}"]`)
    ?.remove();
}
