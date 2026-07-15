import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpDown,
  Clock,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import type { ChatSettings } from "../llm/settings";
import { MarkdownPreview } from "../components/MarkdownPreview";
import {
  loadWorkflowWidgetCache,
  runWorkflowText,
  saveWorkflowWidgetCache,
  type WorkflowCacheRecord,
} from "./workflowRunner";

interface WorkflowWidgetConfig {
  workflow?: string;
  outputVariable?: string;
  output?: "markdown" | "html" | "table" | "card";
  refreshInterval?: number;
  columns?: string[];
  card?: {
    title?: string;
    subtitle?: string;
    image?: string;
    body?: string;
    badges?: string[];
  };
  sort?: string;
  limit?: number;
}

export function WorkflowWidget({
  widgetId,
  cacheScope = "local",
  config,
  settings,
  isDark,
}: {
  widgetId: string;
  cacheScope?: string;
  config: Record<string, unknown>;
  settings: ChatSettings;
  directoryBase: string;
  isDark: boolean;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const cfg = config as WorkflowWidgetConfig;
  const [record, setRecord] = useState<WorkflowCacheRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const recordRef = useRef(record);
  recordRef.current = record;
  const executeRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    void loadWorkflowWidgetCache(widgetId, cacheScope).then((value) => {
      if (!cancelled) {
        setRecord(value);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cacheScope, widgetId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const execute = useCallback(async () => {
    if (!cfg.workflow || executing) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setExecuting(true);
    try {
      const text = await runWorkflowText(
        settings,
        cfg.workflow,
        cfg.outputVariable,
        abort.signal,
      );
      if (abort.signal.aborted) return;
      const next: WorkflowCacheRecord = {
        ranAt: Date.now(),
        status: "ok",
        text,
      };
      await saveWorkflowWidgetCache(widgetId, next, cacheScope);
      setRecord(next);
    } catch (error) {
      if (abort.signal.aborted) return;
      const next: WorkflowCacheRecord = {
        ranAt: Date.now(),
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        text: recordRef.current?.text,
      };
      await saveWorkflowWidgetCache(widgetId, next, cacheScope);
      setRecord(next);
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
        setExecuting(false);
      }
    }
  }, [
    cacheScope,
    cfg.outputVariable,
    cfg.workflow,
    executing,
    settings,
    widgetId,
  ]);
  executeRef.current = execute;

  useEffect(() => {
    if (
      loading || !cfg.workflow || !cfg.refreshInterval ||
      cfg.refreshInterval <= 0
    ) return;
    if (
      Date.now() - (recordRef.current?.ranAt ?? 0) >
        cfg.refreshInterval * 60_000
    ) void executeRef.current();
    const timer = window.setInterval(
      () => void executeRef.current(),
      cfg.refreshInterval! * 60_000,
    );
    return () => window.clearInterval(timer);
  }, [cfg.refreshInterval, cfg.workflow, loading]);

  const output = cfg.output || "table";

  return (
    <section className="dashboard-workflow-widget">
      {config.showHeader !== false && (
        <header>
          <div>
            {record && (
              <span>
                <Clock size={11} />Last updated:{" "}
                {new Date(record.ranAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {record?.status === "error" && record.text && (
              <em>
                <AlertCircle size={11} />Stale
              </em>
            )}
          </div>
          <div>
            <button
              type="button"
              disabled={!cfg.workflow || executing}
              onClick={() => void execute()}
            >
              <RefreshCw size={12} className={executing ? "spin" : ""} />
              {executing ? "Running" : "Refresh"}
            </button>
            {executing && (
              <button
                type="button"
                className="danger"
                onClick={() => abortRef.current?.abort()}
              >
                <XCircle size={12} />
              </button>
            )}
          </div>
        </header>
      )}
      {record?.status === "error" && !record.text && (
        <div className="dashboard-workflow-error">{record.error}</div>
      )}
      <div className="dashboard-workflow-output">
        {loading ? <p>Loading…</p> : !record?.text
          ? (
            <p>
              {cfg.workflow ? "Workflow has not run." : "Select a workflow."}
            </p>
          )
          : output === "html"
          ? (
            <iframe
              srcDoc={record.text}
              sandbox="allow-scripts"
              title="Workflow output"
            />
          )
          : output === "table" || output === "card"
          ? (
            <WorkflowStructuredOutput
              text={record.text}
              mode={output}
              config={cfg}
            />
          )
          : <MarkdownPreview content={record.text} isDark={isDark} />}
      </div>
    </section>
  );
}

function WorkflowStructuredOutput(
  { text, mode, config }: {
    text: string;
    mode: "table" | "card";
    config: WorkflowWidgetConfig;
  },
) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("");
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(text) as unknown;
    rows = Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> =>
        !!item && typeof item === "object" && !Array.isArray(item)
      )
      : parsed && typeof parsed === "object"
      ? [parsed as Record<string, unknown>]
      : [];
  } catch {
    return <pre>{text}</pre>;
  }
  const detectedKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    .slice(
      0,
      20,
    );
  const keys = mode === "table" && config.columns?.length
    ? config.columns
    : detectedKeys;
  const normalized = query.trim().toLocaleLowerCase();
  const effectiveSort = sort || config.sort || "";
  const sortedRows = rows.filter((row) =>
    !normalized || JSON.stringify(row).toLocaleLowerCase().includes(normalized)
  ).sort((left, right) => {
    if (!effectiveSort) return 0;
    const descending = effectiveSort.startsWith("-");
    const key = descending ? effectiveSort.slice(1) : effectiveSort;
    const leftValue = String(left[key] ?? ""),
      rightValue = String(right[key] ?? "");
    const result = leftValue.localeCompare(rightValue, undefined, {
      numeric: true,
    });
    return descending ? -result : result;
  }).slice(0, Math.max(1, config.limit || 500));
  const controls = (
    <div className="workflow-view-controls">
      <label>
        <Search size={11} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter rows"
        />
      </label>
      <label>
        <ArrowUpDown size={11} />
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="">Configured order</option>
          {detectedKeys.flatMap((
            key,
          ) => [
            <option key={key} value={key}>{key} ↑</option>,
            <option key={`-${key}`} value={`-${key}`}>{key} ↓</option>,
          ])}
        </select>
      </label>
      <span>{sortedRows.length}/{rows.length}</span>
    </div>
  );
  if (mode === "card") {
    const mapping = config.card || {};
    const value = (row: Record<string, unknown>, key?: string) =>
      key ? String(row[key] ?? "") : "";
    return (
      <div className="dashboard-workflow-structured">
        {controls}
        <div className="dashboard-workflow-cards">
          {sortedRows.slice(0, 100).map((row, index) => (
            <article key={index} className="workflow-data-card">
              {mapping.image && value(row, mapping.image) && (
                <img
                  src={value(row, mapping.image).replace(/^!?\[\[|\]\]$/g, "")}
                  alt=""
                />
              )}
              <div>
                <strong>
                  {mapping.title
                    ? value(row, mapping.title)
                    : value(row, detectedKeys[0]) || `Row ${index + 1}`}
                </strong>
                {mapping.subtitle && (
                  <small>{value(row, mapping.subtitle)}</small>
                )}
                {mapping.body && <p>{value(row, mapping.body)}</p>}
                {mapping.badges?.length
                  ? (
                    <footer>
                      {mapping.badges.map((key) => value(row, key)).filter(
                        Boolean,
                      ).map((badge, badgeIndex) => (
                        <span key={`${badge}:${badgeIndex}`}>{badge}</span>
                      ))}
                    </footer>
                  )
                  : !mapping.title &&
                    detectedKeys.slice(1, 5).map((key) => (
                      <small key={key}>
                        <b>{key}</b> {typeof row[key] === "object"
                          ? JSON.stringify(row[key])
                          : String(row[key] ?? "")}
                      </small>
                    ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="dashboard-workflow-structured">
      {controls}
      <div className="dashboard-workflow-table">
        <table>
          <thead>
            <tr>{keys.map((key) => <th key={key}>{key}</th>)}</tr>
          </thead>
          <tbody>
            {sortedRows.slice(0, 500).map((row, index) => (
              <tr key={index}>
                {keys.map((key) => (
                  <td key={key}>
                    {typeof row[key] === "object"
                      ? JSON.stringify(row[key])
                      : String(row[key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
