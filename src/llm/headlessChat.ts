import { chat, type ChatMessage } from "../lib/wailsBackend";
import {
  type ChatSettings,
  selectConfiguredModel,
} from "./settings";

export interface HeadlessChatOptions {
  /** A configuredModelOptions key; empty uses the current Chat model. */
  model?: string;
  systemPrompt: string;
  messages: ChatMessage[];
  /** Allow the read-only Workspace file tools. */
  readFiles?: boolean;
  webSearch?: boolean;
}

/** One non-interactive generation on the same providers as Chat. */
export async function generateHeadlessText(
  base: ChatSettings,
  options: HeadlessChatOptions,
): Promise<string> {
  const settings = options.model
    ? selectConfiguredModel(base, options.model)
    : base;
  const readFiles = options.readFiles === true && settings.provider !== "cli";
  const result = await chat({
    provider: settings.provider,
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    localFramework: settings.localFramework,
    localUsername: settings.localUsername,
    localPassword: settings.localPassword,
    streamIdleTimeoutSeconds: settings.streamIdleTimeoutSeconds,
    model: settings.provider === "cli"
      ? settings.cliModels[settings.cliType]
      : settings.model,
    vertexProjectId: settings.vertexProjectId,
    vertexLocation: settings.vertexLocation,
    systemPrompt: [settings.systemPrompt, options.systemPrompt].filter(Boolean)
      .join("\n\n"),
    messages: options.messages,
    enableFileTools: readFiles,
    fileToolMode: readFiles ? "readOnly" : "none",
    enableWebSearch: options.webSearch === true,
    cliType: settings.cliType,
    cliPath: settings.cliPaths[settings.cliType],
    cliSessionId: "",
  });
  const content = result.content.trim();
  if (!content) throw new Error("The AI returned an empty answer");
  return content;
}
