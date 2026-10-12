import { type ChatSettings, loadChatSettings } from "../llm/settings";
import { generateHeadlessText } from "../llm/headlessChat";
import {
  kakerattaConnectionFingerprint,
  withKakeratta,
} from "./kakerattaClient";
import type { DirectOptions } from "./kakerattaDirect";
import { getDirectTools } from "./kakerattaDirectTools";
import {
  createLocalDirectStore,
  pruneDirectJournals,
} from "./kakerattaDirectStore";
import {
  type KakerattaProfile,
  resolveKakerattaProfile,
  validateKakerattaUrl,
} from "./kakerattaSettings";
import { syncTimelineLocal } from "./kakerattaTimelineLocal";
import { type PollResult, pollKakeratta } from "./kakerattaWorker";
import type { KakerattaGenerate } from "./kakerattaWorker";

export const KAKERATTA_POLL_INTERVAL_MS = 60_000;
const POLL_DEADLINE_MS = 4 * 60_000;

export interface KakerattaCycleResult {
  poll?: PollResult;
  timeline?: {
    files: number;
    conflicts: number;
    pending: number;
    backfillPending: boolean;
  };
  timelineError?: string;
}

function generator(
  settings: ChatSettings,
  profileFor: (context: unknown) => KakerattaProfile,
): KakerattaGenerate {
  return async (messages, system, _signal, context) => {
    const profile = profileFor(context);
    return await generateHeadlessText(settings, {
      model: profile.model,
      systemPrompt: system,
      messages: messages.map(({ role, content }) => ({ role, content })),
      readFiles: profile.readFiles,
      webSearch: profile.webSearch,
    });
  };
}

/** One check: Timeline synchronization, persona asks, then direct requests. */
export async function runKakerattaCycle(
  settings: ChatSettings,
  language: string,
  parent: AbortSignal,
): Promise<KakerattaCycleResult> {
  const config = settings.kakeratta;
  if (!config.enabled) return {};
  validateKakerattaUrl(config);
  const controller = new AbortController();
  const stop = () => controller.abort();
  parent.addEventListener("abort", stop, { once: true });
  if (parent.aborted) controller.abort();
  const timer = setTimeout(stop, POLL_DEADLINE_MS);
  let tools: Awaited<ReturnType<typeof getDirectTools>> | undefined;
  try {
    const fingerprint = await kakerattaConnectionFingerprint(config);
    pruneDirectJournals(fingerprint);
    tools = config.direct.enabled
      ? await getDirectTools(settings.mcpServers, config.direct.mcpServerIds)
      : undefined;
    controller.signal.throwIfAborted();
    return await withKakeratta(config, controller.signal, async (call) => {
      const result: KakerattaCycleResult = {};
      if (config.timelineSync.enabled) {
        try {
          result.timeline = await syncTimelineLocal(
            config,
            call,
            fingerprint,
            language,
            controller.signal,
          );
        } catch (error) {
          if (controller.signal.aborted) throw error;
          result.timelineError = error instanceof Error
            ? error.message
            : String(error);
        }
      }
      const direct: DirectOptions | undefined = config.direct.enabled
        ? {
          store: createLocalDirectStore(
            fingerprint,
            async () => {
              return await kakerattaConnectionFingerprint(
                loadChatSettings().kakeratta,
              ) === fingerprint;
            },
          ),
          generate: generator(settings, () => config.direct),
          tools: tools?.definitions,
          executeTool: tools?.execute,
        }
        : undefined;
      result.poll = await pollKakeratta(
        call,
        generator(
          settings,
          (context) => resolveKakerattaProfile(config, context),
        ),
        controller.signal,
        direct,
      );
      return result;
    });
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", stop);
    await tools?.close();
  }
}

export interface KakerattaPersona {
  id: string;
  name: string;
  planner: string;
}

/** Validate a candidate connection and list the personas it exposes. */
export async function listKakerattaPersonas(
  config: ChatSettings["kakeratta"],
): Promise<KakerattaPersona[]> {
  const controller = new AbortController();
  return await withKakeratta(config, controller.signal, async (call) => {
    const response = await call("list_personas", {});
    const list = Array.isArray(response.personas) ? response.personas : [];
    return list.flatMap((item: unknown) => {
      const value = item as { id?: unknown; name?: unknown; planner?: unknown };
      return typeof value?.id === "string"
        ? [{
          id: value.id,
          name: typeof value.name === "string" ? value.name : value.id,
          planner: typeof value.planner === "string" ? value.planner : "",
        }]
        : [];
    });
  });
}
