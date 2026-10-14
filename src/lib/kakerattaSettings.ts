export interface KakerattaProfile {
  /** A configuredModelOptions key; empty uses the current Chat model. */
  model: string;
  readFiles: boolean;
  webSearch: boolean;
}

export interface KakerattaDirectProfile extends KakerattaProfile {
  enabled: boolean;
  /** MCP server IDs the direct agent may use (existing approvals only). */
  mcpServerIds: string[];
}

export interface KakerattaSettings {
  enabled: boolean;
  pollEnabled: boolean;
  url: string;
  headers: Record<string, string>;
  timelineSync: { enabled: boolean; name: string };
  defaultProfile: KakerattaProfile;
  personas: Record<string, KakerattaProfile>;
  direct: KakerattaDirectProfile;
}

const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const TIMELINE_NAME = /^[^\\/:*?"<>|#[\]\n\r\t]+$/;

export const defaultKakerattaProfile = (): KakerattaProfile => ({
  model: "",
  readFiles: false,
  webSearch: false,
});

export const defaultKakerattaSettings = (): KakerattaSettings => ({
  enabled: false,
  pollEnabled: true,
  url: "",
  headers: {},
  timelineSync: { enabled: false, name: "Timeline" },
  defaultProfile: defaultKakerattaProfile(),
  personas: {},
  direct: {
    ...defaultKakerattaProfile(),
    enabled: true,
    mcpServerIds: [],
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function profile(value: unknown): KakerattaProfile {
  const source = isRecord(value) ? value : {};
  return {
    model: typeof source.model === "string" ? source.model : "",
    readFiles: source.readFiles === true,
    webSearch: source.webSearch === true,
  };
}

/** Tolerant loader: invalid saved data falls back to defaults field by field. */
export function normalizeKakerattaSettings(value: unknown): KakerattaSettings {
  const source = isRecord(value) ? value : {};
  const defaults = defaultKakerattaSettings();
  const headers: Record<string, string> = {};
  if (isRecord(source.headers)) {
    for (const [key, header] of Object.entries(source.headers)) {
      if (
        HEADER_NAME.test(key) && typeof header === "string" &&
        !/[\r\n]/.test(header)
      ) headers[key] = header;
    }
  }
  const sync = isRecord(source.timelineSync) ? source.timelineSync : {};
  const name = typeof sync.name === "string" ? sync.name.trim() : "";
  const direct = isRecord(source.direct) ? source.direct : {};
  const personas: Record<string, KakerattaProfile> = {};
  if (isRecord(source.personas)) {
    for (const [id, item] of Object.entries(source.personas)) {
      personas[id] = profile(item);
    }
  }
  return {
    enabled: source.enabled === true,
    pollEnabled: source.pollEnabled !== false,
    url: typeof source.url === "string" ? source.url.trim() : "",
    headers,
    timelineSync: {
      enabled: sync.enabled === true,
      name: name && name.length <= 80 && TIMELINE_NAME.test(name)
        ? name
        : defaults.timelineSync.name,
    },
    defaultProfile: profile(source.defaultProfile),
    personas,
    direct: {
      ...profile(direct),
      enabled: direct.enabled !== false,
      mcpServerIds: Array.isArray(direct.mcpServerIds)
        ? direct.mcpServerIds.filter((id): id is string =>
          typeof id === "string"
        )
        : [],
    },
  };
}

export function resolveKakerattaProfile(
  config: KakerattaSettings,
  context: unknown,
): KakerattaProfile {
  const id = (context as { persona?: { id?: unknown } } | null)?.persona?.id;
  return (typeof id === "string" && Object.hasOwn(config.personas, id)
    ? config.personas[id]
    : undefined) ?? config.defaultProfile;
}

/** Only http(s) endpoints may receive the connection headers. */
export function validateKakerattaUrl(config: KakerattaSettings): void {
  if (!config.url && !config.enabled) return;
  let parsed: URL;
  try {
    parsed = new URL(config.url);
  } catch {
    throw new Error("Enter the Kakeratta MCP URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("The Kakeratta MCP URL must use http or https.");
  }
}
