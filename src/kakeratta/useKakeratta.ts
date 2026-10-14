import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatSettings } from "../llm/settings";
import {
  KAKERATTA_POLL_INTERVAL_MS,
  type KakerattaCycleResult,
  runKakerattaCycle,
} from "../lib/kakerattaRunner";

export interface KakerattaStatus {
  state: "off" | "idle" | "running" | "ok" | "error";
  message: string;
  at: number;
  result?: KakerattaCycleResult;
}

const OFF: KakerattaStatus = { state: "off", message: "", at: 0 };

function summarize(result: KakerattaCycleResult): string {
  const parts: string[] = [];
  const poll = result.poll;
  if (poll) {
    parts.push(
      `${poll.submitted}/${poll.pending} persona answers submitted`,
    );
    if (poll.requests) {
      parts.push(
        `${poll.requests.replied} direct replies, ${poll.requests.incomplete} incomplete`,
      );
      if (poll.requests.failed) parts.push(`${poll.requests.failed} direct request errors`);
    }
    if (poll.errors.length) parts.push(`${poll.errors.length} errors`);
  }
  if (result.timeline) {
    parts.push(`Timeline: ${result.timeline.files} files updated`);
    if (result.timeline.conflicts) {
      parts.push(`${result.timeline.conflicts} conflicts preserved`);
    }
  }
  if (result.timelineError) {
    parts.push(`Timeline sync failed: ${result.timelineError}`);
  }
  return parts.join(" · ") || "Checked";
}

/**
 * Checks Kakeratta once when enabled (or when its settings change), then every
 * minute while the app is open unless periodic checks are turned off.
 */
export function useKakeratta(settings: ChatSettings) {
  const [status, setStatus] = useState<KakerattaStatus>(OFF);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const running = useRef<AbortController | null>(null);
  const config = settings.kakeratta;
  const key = JSON.stringify([config, settings.model, settings.provider, settings.mcpServers]);

  const runOnce = useCallback(async () => {
    if (running.current) return;
    const current = settingsRef.current;
    if (!current.kakeratta.enabled || !current.kakeratta.url) {
      setStatus(OFF);
      return;
    }
    const controller = new AbortController();
    running.current = controller;
    setStatus((previous) => ({ ...previous, state: "running" }));
    try {
      const result = await runKakerattaCycle(
        current,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const failed = !!result.timelineError ||
        (result.poll?.errors.length ?? 0) > 0 ||
        (result.poll?.requests?.failed ?? 0) > 0;
      setStatus({
        state: failed ? "error" : "ok",
        message: summarize(result),
        at: Date.now(),
        result,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus({
        state: "error",
        message: error instanceof Error ? error.message : String(error),
        at: Date.now(),
      });
    } finally {
      if (running.current === controller) running.current = null;
    }
  }, []);

  useEffect(() => {
    if (!config.enabled || !config.url) {
      setStatus(OFF);
      return;
    }
    // A settings change cancels the current check; claims protect ownership.
    running.current?.abort();
    running.current = null;
    void runOnce();
    const timer = config.pollEnabled ? window.setInterval(
      () => void runOnce(),
      KAKERATTA_POLL_INTERVAL_MS,
    ) : undefined;
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      running.current?.abort();
      running.current = null;
    };
  }, [key, config.enabled, config.url, config.pollEnabled, runOnce]);

  return { status, runNow: runOnce };
}
