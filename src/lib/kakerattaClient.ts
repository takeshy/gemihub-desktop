import { McpHttpClient } from "../mcp/httpClient";
import { KakerattaRejectedError } from "./kakerattaErrors";
import {
  type KakerattaSettings,
  validateKakerattaUrl,
} from "./kakerattaSettings";
import type { KakerattaCall } from "./kakerattaWorker";

const TOOLS = new Set([
  "sync_timeline",
  "list_personas",
  "list_asks",
  "claim_ask",
  "read_for_ask",
  "submit_answer",
  "release_ask",
  "claim_request",
  "reply_request",
  "comment_on_entry",
  "get_timeline",
  "get_thread",
  "search_timeline",
  "list_schedules",
  "list_notes",
  "read_note",
]);

const CALL_TIMEOUT_MS = 20_000;

function raceStop<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fail = (message: string) => reject(new Error(message));
    const timer = setTimeout(
      () => fail("Kakeratta did not respond in time"),
      timeoutMs,
    );
    const onAbort = () => fail("Kakeratta turn stopped");
    if (signal?.aborted) onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

function textOf(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content)
    ? result.content as { type?: string; text?: string }[]
    : [];
  return content.filter((item) => item.type === "text").map((item) =>
    item.text ?? ""
  ).join("\n");
}

/** Open one MCP connection, expose only the Kakeratta tools, and always close it. */
export async function withKakeratta<T>(
  config: KakerattaSettings,
  signal: AbortSignal,
  work: (call: KakerattaCall) => Promise<T>,
): Promise<T> {
  validateKakerattaUrl(config);
  const client = new McpHttpClient({
    name: "kakeratta",
    transport: "http",
    url: config.url,
    headers: config.headers,
    enabled: true,
  });
  try {
    return await work(async (name, args) => {
      if (!TOOLS.has(name)) throw new Error("Unsupported Kakeratta tool");
      // Cleanup needs a fresh signal after the turn stops.
      if (name !== "release_ask") signal.throwIfAborted();
      const result = await raceStop(
        client.callTool(name, args, true),
        name === "release_ask" ? undefined : signal,
        CALL_TIMEOUT_MS,
      );
      if (result.isError === true) {
        throw new KakerattaRejectedError(textOf(result));
      }
      const value: unknown = result.structuredContent ??
        JSON.parse(textOf(result));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid Kakeratta response");
      }
      return value as Record<string, unknown>;
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Identity of a connection: a changed URL or key starts a new journal scope. */
export async function kakerattaConnectionFingerprint(
  config: Pick<KakerattaSettings, "url" | "headers">,
): Promise<string> {
  const headers = Object.entries(config.headers).map((
    [key, value],
  ) => [key.toLowerCase(), value]).sort(([a], [b]) => a.localeCompare(b));
  const data = new TextEncoder().encode(JSON.stringify([config.url, headers]));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")).join("");
}
