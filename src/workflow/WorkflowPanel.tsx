import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Braces,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  FilePlus2,
  GripVertical,
  History,
  Info,
  Library,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Workflow as WorkflowIcon,
  X,
  XCircle,
} from "lucide-react";
import {
  listWorkspaceFiles,
  readWorkspaceFile as readFile,
  writeWorkspaceFile as writeFile,
} from "../lib/wailsBackend";
import type { ChatSettings } from "../llm/settings";
import { executeWorkflow, reopenWorkflowMcpApp } from "./executor";
import {
  canonicalWorkflowPath,
  findWorkflowBlocks,
  isWorkflowFilePath,
  parseWorkflowFile,
  replaceWorkflowDefinition,
  serializeWorkflowYaml,
  workflowNameFromFilePath,
  workflowYamlFromContent,
} from "./parser";
import type { Workflow, WorkflowLog, WorkflowRun } from "./types";
import {
  appendWorkflowHistory,
  clearWorkflowHistory,
  loadWorkflowHistory,
  removeWorkflowHistory,
} from "./history";
import {
  loadWorkflowAutomationSettings,
  saveWorkflowAutomationSettings,
  workflowAutomationChangedEvent,
  type WorkflowAutomationSettings,
} from "./automationSettings";
import { WorkflowAutomationModal } from "./WorkflowAutomationModal";
import { requestWorkflowPrompt } from "./promptService";
import { type RawWorkflowNode, readWorkflowDocument } from "./document";
import { NodeEditorModal } from "./NodeEditorModal";
import { workflowToMermaid } from "./mermaid";
import { WorkflowProgressModal } from "./WorkflowProgressModal";
import { AIWorkflowBuilderModal } from "./AIWorkflowBuilderModal";
import {
  buildSkillMarkdown,
  deriveWorkflowInputVariables,
  parseWorkspaceSkill,
  syncSkillWorkflowInputVariables,
} from "../skills/skills";

function workflowTemplate(name: string): string {
  return serializeWorkflowYaml({
    name,
    nodes: [
      { id: "input", type: "variable", name: "topic", value: "Workspace" },
      {
        id: "ask",
        type: "command",
        prompt: "Summarize {{topic}} in a concise paragraph.",
        saveTo: "result",
        enableThinking: true,
      },
      {
        id: "save",
        type: "note",
        path: "workflow-output.md",
        content: "{{result}}",
        mode: "overwrite",
        confirm: true,
      },
    ],
  });
}

function compactOutput(output: unknown): string {
  if (output === undefined) return "";
  const text = typeof output === "string" ? output : JSON.stringify(output);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function workflowNodeSummary(
  type: string,
  properties: Record<string, unknown>,
): string {
  const text = (key: string) =>
    typeof properties[key] === "string"
      ? String(properties[key]).replace(/\s+/g, " ").trim()
      : "";
  const truncate = (value: string, max = 60) =>
    value.length > max ? `${value.slice(0, max - 1)}…` : value;
  if (type === "variable" || type === "set") {
    return text("name")
      ? `${text("name")} = ${truncate(text("value"), 40)}`
      : "";
  }
  if (type === "if" || type === "while") return truncate(text("condition"));
  if (type === "command") return truncate(text("prompt"));
  if (type === "http") {
    return `${(text("method") || "GET").toUpperCase()} ${
      truncate(text("url"), 50)
    }`.trim();
  }
  if (type === "json") {
    return text("saveTo")
      ? `${truncate(text("source"), 20)} → ${text("saveTo")}`
      : "";
  }
  if (type === "note") {
    return `${truncate(text("path"), 40)} (${text("mode") || "overwrite"})`;
  }
  if (type === "open") {
    return `${truncate(text("path"), 30)}${
      text("saveTo") ? ` → ${text("saveTo")}` : ""
    }`;
  }
  if (type === "search") return truncate(text("query"));
  if (type === "folder-list") return truncate(text("folder"));
  if (type === "file-explorer") return truncate(text("title"));
  if (type === "dialog") return truncate(text("title") || text("message"));
  if (["prompt-value", "prompt-file", "prompt-selection"].includes(type)) {
    return truncate(text("title"));
  }
  if (type === "workflow") return text("path") || text("name");
  if (type === "mcp") {
    return text("tool") ? `${truncate(text("url"), 20)}:${text("tool")}` : "";
  }
  if (type === "script") {
    return text("saveTo")
      ? `JS → ${text("saveTo")}`
      : truncate(text("code"), 40);
  }
  if (type === "sleep") return text("duration") ? `${text("duration")}ms` : "";
  return truncate(text("description") || text("content"));
}

function workflowNodeTypeLabel(type: string): string {
  return ({
    variable: "Variable",
    set: "Set",
    if: "If",
    while: "While",
    command: "LLM",
    http: "HTTP",
    json: "JSON",
    note: "Drive File",
    open: "Drive Read",
    search: "Drive Search",
    "folder-list": "Folder List",
    "file-explorer": "File Picker",
    dialog: "Dialog",
    "prompt-value": "Prompt",
    "prompt-file": "File Prompt",
    "prompt-selection": "Selection",
    workflow: "Workflow",
    mcp: "MCP",
    "rag-sync": "RAG Sync",
    script: "Script",
    sleep: "Sleep",
  } as Record<string, string>)[type] || type;
}

function workflowNodeColor(type: string): string {
  if (["if", "while"].includes(type)) return "blue";
  if (["variable", "set"].includes(type)) return "slate";
  if (type === "command") return "purple";
  if (
    ["note", "open", "search", "folder-list", "file-explorer"].includes(type)
  ) return "green";
  if (
    ["dialog", "prompt-value", "prompt-file", "prompt-selection"].includes(type)
  ) return "amber";
  if (type === "script") return "orange";
  if (["http", "json", "mcp", "rag-sync"].includes(type)) return "cyan";
  if (type === "workflow") return "indigo";
  return "slate";
}

function appendAIWorkflowHistory(markdown: string, request: string): string {
  const comment = `# AI Workflow History: ${
    new Date().toLocaleString()
  } - Modified - "${
    request.replace(/\s+/g, " ").trim().replaceAll('"', "'")
  }"\n`;
  return `${comment}${markdown.replace(/^# AI Workflow History:.*\n/, "")}`;
}

export function WorkflowPanel({
  directoryBase,
  settings,
  activeFile,
  onOpenFile,
}: {
  directoryBase: string;
  settings: ChatSettings;
  activeFile: { path: string; content: string } | null;
  onOpenFile: (path: string) => void;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [path, setPath] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [parseError, setParseError] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [thinking, setThinking] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<WorkflowRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"create" | "modify" | null>(null);
  const [aiArtifact, setAiArtifact] = useState<"workflow" | "skill">(
    "workflow",
  );
  const [skillWorkflowMarkdown, setSkillWorkflowMarkdown] = useState("");
  const [automation, setAutomation] = useState<WorkflowAutomationSettings>(() =>
    loadWorkflowAutomationSettings(directoryBase)
  );
  const [automationOpen, setAutomationOpen] = useState(false);
  const [editingNodeIndex, setEditingNodeIndex] = useState<number | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const [expandedLogIndex, setExpandedLogIndex] = useState<number | null>(null);
  const [draggedNodeIndex, setDraggedNodeIndex] = useState<number | null>(null);
  const [dropNodeTarget, setDropNodeTarget] = useState<
    { index: number; position: "above" | "below" } | null
  >(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = async () => {
    if (!directoryBase) {
      setPaths([]);
      return;
    }
    setLoading(true);
    try {
      const candidates = (await listWorkspaceFiles()).filter((item) =>
        !item.binary && isWorkflowFilePath(item.path)
      ).slice(0, 1000);
      const found: string[] = [];
      for (let index = 0; index < candidates.length; index += 20) {
        const batch = await Promise.all(
          candidates.slice(index, index + 20).map(async (item) => ({
            path: item.path,
            file: await readFile(item.path).catch(() => null),
          })),
        );
        for (const item of batch) {
          if (
            item.file && findWorkflowBlocks(item.file.content).length > 0 &&
            !/\/SKILL\.md$/i.test(item.path)
          ) found.push(item.path);
        }
      }
      setPaths(found.sort());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [directoryBase]);

  useEffect(() => {
    if (
      !activeFile ||
      (!/^skills\/[^/]+\/SKILL\.md$/i.test(activeFile.path) &&
        !isWorkflowFilePath(activeFile.path))
    ) {
      setPath("");
      return;
    }
    if (!/\/SKILL\.md$/i.test(activeFile.path)) {
      setPaths((current) => [...new Set([...current, activeFile.path])].sort());
    }
    setPath(activeFile.path);
  }, [activeFile?.path]);

  useEffect(() => {
    if (activeFile?.path === path && activeFile.content !== markdown) {
      setMarkdown(activeFile.content);
    }
  }, [activeFile?.content, activeFile?.path, path]);

  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<
        { directoryBase?: string; settings?: WorkflowAutomationSettings }
      >).detail;
      if (!detail?.directoryBase || detail.directoryBase === directoryBase) {
        setAutomation(
          detail?.settings || loadWorkflowAutomationSettings(directoryBase),
        );
      }
    };
    const historyChanged = (event: Event) => {
      const detail = (event as CustomEvent<
        { workspaceBase?: string; records?: WorkflowRun[]; reload?: boolean }
      >).detail;
      if (
        detail?.workspaceBase !== undefined &&
        detail.workspaceBase !== directoryBase
      ) return;
      if (detail?.records) setHistory(detail.records);
      else {void loadWorkflowHistory(directoryBase, detail?.reload === true)
          .then(setHistory);}
    };
    window.addEventListener(workflowAutomationChangedEvent, changed);
    window.addEventListener("llm-hub:workflow-history-changed", historyChanged);
    return () => {
      window.removeEventListener(workflowAutomationChangedEvent, changed);
      window.removeEventListener(
        "llm-hub:workflow-history-changed",
        historyChanged,
      );
    };
  }, [directoryBase]);

  useEffect(
    () => setAutomation(loadWorkflowAutomationSettings(directoryBase)),
    [directoryBase],
  );
  useEffect(() => {
    let cancelled = false;
    void loadWorkflowHistory(directoryBase).then((records) => {
      if (!cancelled) setHistory(records);
    });
    return () => {
      cancelled = true;
    };
  }, [directoryBase]);

  useEffect(() => {
    if (!path) {
      setMarkdown("");
      setWorkflow(null);
      return;
    }
    void readFile(path).then((file) => setMarkdown(file?.content ?? "")).catch((
      error,
    ) => setParseError(error instanceof Error ? error.message : String(error)));
  }, [path]);

  useEffect(() => {
    if (!markdown) {
      setWorkflow(null);
      setParseError("");
      return;
    }
    if (/\/SKILL\.md$/i.test(path)) {
      setWorkflow(null);
      setParseError("");
      return;
    }
    try {
      setWorkflow(parseWorkflowFile(markdown, path));
      setParseError("");
    } catch (error) {
      setWorkflow(null);
      setParseError(error instanceof Error ? error.message : String(error));
    }
  }, [markdown, path]);

  const skill = useMemo(
    () =>
      /\/SKILL\.md$/i.test(path) ? parseWorkspaceSkill(path, markdown) : null,
    [markdown, path],
  );

  useEffect(() => {
    const workflowPath = skill?.workflows[0]
      ? `${skill.folderPath}/${skill.workflows[0].path}`
      : "";
    if (!workflowPath) {
      setSkillWorkflowMarkdown("");
      return;
    }
    void readFile(workflowPath).then((file) =>
      setSkillWorkflowMarkdown(file?.content || "")
    ).catch(() => setSkillWorkflowMarkdown(""));
  }, [skill?.skillFilePath, skill?.workflows[0]?.path]);

  const outgoing = useMemo(() => {
    const result = new Map<string, Array<{ to: string; label?: string }>>();
    for (const edge of workflow?.edges ?? []) {
      result.set(edge.from, [...(result.get(edge.from) ?? []), {
        to: edge.to,
        label: edge.label,
      }]);
    }
    return result;
  }, [workflow]);
  const workflowDocument = useMemo(() => {
    try {
      return markdown ? readWorkflowDocument(markdown, path) : null;
    } catch {
      return null;
    }
  }, [markdown, path]);
  const visibleHistory = useMemo(
    () => path ? history.filter((item) => item.workflowPath === path) : history,
    [history, path],
  );
  const executionState = running
    ? "running"
    : logs.some((log) => log.status === "error")
    ? "error"
    : logs.length > 0
    ? "completed"
    : "idle";

  const updateRawNodes = (nodes: RawWorkflowNode[]) => {
    if (!workflowDocument) return;
    const next = workflowDocument.updateNodes(nodes);
    setMarkdown(next);
    if (path) {
      void writeFile(path, next).then(() => {
        window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
        window.dispatchEvent(
          new CustomEvent("llm-hub:dashboard-data-changed", {
            detail: { path },
          }),
        );
      }).catch((error: unknown) =>
        setParseError(error instanceof Error ? error.message : String(error))
      );
    }
  };

  const addNode = () => {
    if (!workflowDocument) return;
    const ids = new Set(
      workflowDocument.nodes.map((node) => String(node.id || "")),
    );
    let number = workflowDocument.nodes.length + 1;
    while (ids.has(`node-${number}`)) number++;
    const nodes = [...workflowDocument.nodes, {
      id: `node-${number}`,
      type: "variable",
      name: "value",
      value: "",
    }];
    updateRawNodes(nodes);
    setEditingNodeIndex(nodes.length - 1);
  };

  const reorderNode = (
    fromIndex: number,
    targetIndex: number,
    position: "above" | "below",
  ) => {
    if (
      !workflowDocument || fromIndex < 0 || targetIndex < 0 ||
      fromIndex >= workflowDocument.nodes.length ||
      targetIndex >= workflowDocument.nodes.length
    ) return;
    const nodes = [...workflowDocument.nodes];
    const [moved] = nodes.splice(fromIndex, 1);
    let insertionIndex = targetIndex + (position === "below" ? 1 : 0);
    if (fromIndex < insertionIndex) insertionIndex--;
    nodes.splice(Math.max(0, Math.min(nodes.length, insertionIndex)), 0, moved);
    updateRawNodes(nodes);
  };

  const deleteNode = (index: number) => {
    if (!workflowDocument?.nodes[index]) return;
    const removed = workflowDocument.nodes[index];
    if (!window.confirm(`Delete node "${String(removed.id || index + 1)}"?`)) {
      return;
    }
    const replacement = String(removed.next || "end");
    const nodes = workflowDocument.nodes.filter((_, nodeIndex) =>
      nodeIndex !== index
    ).map((node) => {
      const next = { ...node };
      for (const key of ["next", "trueNext", "falseNext"]) {
        if (next[key] === removed.id) next[key] = replacement;
      }
      return next;
    });
    updateRawNodes(nodes);
  };

  const saveCurrent = async () => {
    if (!path || (!workflow && !skill)) return;
    await writeFile(path, markdown);
    const synced = await syncSkillWorkflowInputVariables(path, markdown);
    if (synced?.path === path) setMarkdown(synced.content);
    window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  };

  const exportMermaid = () => {
    if (!workflow) return;
    const blob = new Blob([workflowToMermaid(workflow)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url;
    link.download = `${
      (workflow.name || "workflow").replace(/[^A-Za-z0-9_-]+/g, "-")
    }.mmd`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportHistory = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url;
    link.download = `workflow-history-${
      new Date().toISOString().replace(/[:.]/g, "-")
    }.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const createWorkflow = async () => {
    const requested = ((await requestWorkflowPrompt({
      kind: "value",
      title: "New workflow",
      message: "Workflow file path",
      defaultValue: "workflows/new-workflow.workflow.yaml",
    })) as string | null)?.trim();
    if (!requested) return;
    const nextPath = canonicalWorkflowPath(requested);
    const name = workflowNameFromFilePath(nextPath);
    await writeFile(nextPath, workflowTemplate(name));
    setPaths((current) => [...new Set([...current, nextPath])].sort());
    setPath(nextPath);
    onOpenFile(nextPath);
    window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
  };

  const loadWorkflow = async (workflowPath: string) => {
    const file = await readFile(workflowPath);
    if (!file) throw new Error(`Workflow not found: ${workflowPath}`);
    return parseWorkflowFile(file.content, workflowPath);
  };

  const run = async () => {
    if (!workflow || !path || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setLogsOpen(true);
    setLogs([]);
    setThinking({});
    const result = await executeWorkflow(workflow, path, {
      chatSettings: settings,
      activeFile,
      openFile: onOpenFile,
      loadWorkflow,
      signal: controller.signal,
      onLog: (log) => setLogs((current) => [...current, log]),
      onThinking: (nodeId, value) =>
        setThinking((current) => ({ ...current, [nodeId]: value })),
    });
    setRunning(false);
    abortRef.current = null;
    setHistory(await appendWorkflowHistory(result, directoryBase));
  };

  const retryFrom = async (
    record: WorkflowRun,
    nodeId: string,
    variables: Record<string, string | number>,
  ) => {
    if (running) return;
    const file = await readFile(record.workflowPath);
    if (!file) {
      setParseError(`Workflow not found: ${record.workflowPath}`);
      return;
    }
    const retryWorkflow = parseWorkflowFile(file.content, record.workflowPath);
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setLogs([]);
    setThinking({});
    setHistoryOpen(false);
    setProgressOpen(true);
    const result = await executeWorkflow(retryWorkflow, record.workflowPath, {
      chatSettings: settings,
      activeFile,
      openFile: onOpenFile,
      loadWorkflow,
      signal: controller.signal,
      startNodeId: nodeId,
      onLog: (log) => setLogs((current) => [...current, log]),
      onThinking: (thinkingNodeId, value) =>
        setThinking((current) => ({ ...current, [thinkingNodeId]: value })),
    }, new Map(Object.entries(variables)));
    setHistory(await appendWorkflowHistory(result, directoryBase));
    setRunning(false);
    abortRef.current = null;
  };

  return (
    <section className="workflow-panel">
      {!path
        ? (
          <>
            <header className="workflow-list-header">
              <strong>WORKFLOW</strong>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                title="Reload workflows"
              >
                <RefreshCw size={14} className={loading ? "spin" : ""} />
              </button>
            </header>
            <div className="workflow-create-actions">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setAiArtifact("workflow");
                  setAiMode("create");
                }}
                disabled={!directoryBase}
              >
                <Sparkles size={13} />Create workflow with AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiArtifact("skill");
                  setAiMode("create");
                }}
                disabled={!directoryBase}
              >
                <Sparkles size={13} />Create skill with AI
              </button>
              <p>
                <strong>Workflow</strong>{" "}
                automates a predefined series of steps and can run here, from a
                hotkey, or from a dashboard.
              </p>
              <p>
                <strong>Skill</strong>{" "}
                adds reusable instructions and workflows that Chat can invoke.
              </p>
            </div>
            <div className="workflow-file-list">
              {loading
                ? (
                  <div className="workflow-list-empty">
                    <Loader2 size={20} className="spin" />Searching workflows…
                  </div>
                )
                : paths.length === 0
                ? (
                  <div className="workflow-list-empty">
                    <WorkflowIcon size={28} />No workflows yet.
                  </div>
                )
                : paths.map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => {
                      setPath(item);
                      onOpenFile(item);
                    }}
                  >
                    <span className="workflow">
                      <FileCode2 size={15} />
                    </span>
                    <span>
                      <strong>{workflowNameFromFilePath(item)}</strong>
                      <small>{item}</small>
                    </span>
                  </button>
                ))}
            </div>
          </>
        )
        : historyOpen
        ? (
          <div className="workflow-history">
            <header>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                title="Back"
              >
                <ChevronRight size={13} />
              </button>
              <strong>{path ? `History · ${path}` : "Workflow history"}</strong>
              <button
                type="button"
                disabled={history.length === 0}
                onClick={exportHistory}
                title="Export history"
              >
                <Download size={12} />
              </button>
              <button
                type="button"
                disabled={visibleHistory.length === 0}
                onClick={() =>
                  void clearWorkflowHistory(path || undefined, directoryBase)
                    .then(setHistory)}
              >
                Clear
              </button>
            </header>
            {visibleHistory.length === 0
              ? <p>No execution history.</p>
              : visibleHistory.map((item) => (
                <details key={item.id}>
                  <summary>
                    <span className={item.status}>{item.status}</span>
                    <strong>{item.workflowName || item.workflowPath}</strong>
                    <time>{new Date(item.startTime).toLocaleString()}</time>
                  </summary>
                  {item.error && (
                    <div className="workflow-error">{item.error}</div>
                  )}
                  <div className="workflow-history-steps">
                    {item.logs.filter((log) => log.status !== "info").map((
                      log,
                      index,
                    ) => (
                      <div
                        key={`${log.nodeId}-${index}`}
                        className={log.status}
                      >
                        <span>{log.nodeId} · {log.nodeType}</span>
                        <strong>{log.message}</strong>
                        {log.elapsedMs !== undefined && (
                          <time>{(log.elapsedMs / 1000).toFixed(1)}s</time>
                        )}
                        {(log.mcpAppInfo || log.variablesSnapshot) && (
                          <div className="workflow-history-step-actions">
                            {log.mcpAppInfo && (
                              <button
                                type="button"
                                onClick={() =>
                                  void reopenWorkflowMcpApp(log.mcpAppInfo!)}
                                title="Reopen MCP App"
                              >
                                <Braces size={11} />MCP App
                              </button>
                            )}
                            {log.variablesSnapshot && (
                              <button
                                type="button"
                                onClick={() =>
                                  void retryFrom(
                                    item,
                                    log.nodeId,
                                    log.variablesSnapshot!,
                                  )}
                                title="Retry from this step"
                              >
                                <RotateCcw size={11} />Retry
                              </button>
                            )}
                          </div>
                        )}
                        {(log.input || log.output !== undefined || log.usage) &&
                          (
                            <details>
                              <summary>Step details</summary>
                              {log.input && (
                                <>
                                  <b>Input</b>
                                  <pre>{JSON.stringify(log.input, null, 2)}</pre>
                                </>
                              )}
                              {log.output !== undefined && (
                                <>
                                  <b>Output</b>
                                  <pre>{JSON.stringify(log.output, null, 2)}</pre>
                                </>
                              )}
                              {log.usage && (
                                <>
                                  <b>Usage</b>
                                  <pre>{JSON.stringify(log.usage, null, 2)}</pre>
                                </>
                              )}
                            </details>
                          )}
                      </div>
                    ))}
                  </div>
                  <pre>{JSON.stringify(item.variables, null, 2)}</pre>
                  <button
                    type="button"
                    className="workflow-history-delete"
                    onClick={() =>
                      void removeWorkflowHistory(item.id, directoryBase).then(
                        setHistory,
                      )}
                  >
                    Delete history
                  </button>
                </details>
              ))}
          </div>
        )
        : (
          <>
            <header className="workflow-detail-header">
              <strong title={skill?.name || workflow?.name || path}>
                {skill?.name || workflow?.name || path.split("/").pop()}
              </strong>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    void readFile(path).then((file) =>
                      file && setMarkdown(file.content)
                    );
                  }}
                  title="Refresh"
                >
                  <RefreshCw size={14} />
                </button>
                {workflow && (
                  <button
                    type="button"
                    onClick={addNode}
                    disabled={running}
                    title="Add node"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </header>
            {parseError && <div className="workflow-error">{parseError}</div>}
            {skill
              ? (
                <div className="workflow-skill-side">
                  <div>
                    <Library size={24} />
                    <strong>{skill.name}</strong>
                    <p>{skill.description || skill.skillFilePath}</p>
                  </div>
                  {skill.workflows.length
                    ? skill.workflows.map((item) => {
                      const target = `${skill.folderPath}/${item.path}`;
                      return (
                        <button
                          type="button"
                          key={item.path}
                          onClick={() => {
                            setPath(target);
                            onOpenFile(target);
                          }}
                        >
                          <WorkflowIcon size={14} />
                          <span>
                            <strong>{item.path}</strong>
                            <small>
                              {item.description}
                              {item.inputVariables?.length
                                ? ` · inputs: ${item.inputVariables.join(", ")}`
                                : ""}
                            </small>
                          </span>
                          <ArrowRight size={12} />
                        </button>
                      );
                    })
                    : <p>No workflow capability is declared.</p>}
                </div>
              )
              : workflow
              ? (
                <div className="workflow-node-list">
                  {[...workflow.nodes.values()].map((node, index) => {
                    const completed = logs.some((log) =>
                      log.nodeId === node.id && log.status === "success"
                    );
                    const failed = logs.some((log) =>
                      log.nodeId === node.id && log.status === "error"
                    );
                    const executing = running &&
                      logs.at(-1)?.nodeId === node.id;
                    const summary = workflowNodeSummary(
                      node.type,
                      node.properties,
                    );
                    const edges = outgoing.get(node.id) || [];
                    const dropPosition = dropNodeTarget?.index === index
                      ? dropNodeTarget.position
                      : null;
                    return (
                      <div
                        className={`workflow-node-row ${
                          dropPosition ? `drop-${dropPosition}` : ""
                        }`}
                        key={node.id}
                        draggable={!running}
                        onDragStart={() => setDraggedNodeIndex(index)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (
                            draggedNodeIndex === null ||
                            draggedNodeIndex === index
                          ) {
                            setDropNodeTarget(null);
                            return;
                          }
                          const bounds = event.currentTarget
                            .getBoundingClientRect();
                          setDropNodeTarget({
                            index,
                            position:
                              event.clientY < bounds.top + bounds.height / 2
                                ? "above"
                                : "below",
                          });
                        }}
                        onDragEnd={() => {
                          setDraggedNodeIndex(null);
                          setDropNodeTarget(null);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggedNodeIndex !== null && dropNodeTarget) {
                            reorderNode(
                              draggedNodeIndex,
                              dropNodeTarget.index,
                              dropNodeTarget.position,
                            );
                          }
                          setDraggedNodeIndex(null);
                          setDropNodeTarget(null);
                        }}
                      >
                        <article
                          className={failed
                            ? "error"
                            : completed
                            ? "success"
                            : executing
                            ? "running"
                            : ""}
                        >
                          <header>
                            <GripVertical size={12} />
                            <em data-color={workflowNodeColor(node.type)}>
                              {workflowNodeTypeLabel(node.type)}
                            </em>
                            <strong>{node.id}</strong>
                            {completed && !failed && <CheckCircle size={14} />}
                            {failed && <XCircle size={14} />}
                            {executing && (
                              <Loader2 size={14} className="spin" />
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setEditingNodeIndex(index)}
                              title="Edit"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteNode(index)}
                              title="Delete"
                            >
                              <X size={12} />
                            </button>
                          </header>
                          {summary && <p>{summary}</p>}
                          {typeof node.properties.comment === "string" &&
                            node.properties.comment && (
                            <small className="comment">
                              {node.properties.comment}
                            </small>
                          )}
                        </article>
                        {edges.map((edge, edgeIndex) => (
                          <div
                            className="workflow-node-edge"
                            key={`${edge.to}-${edgeIndex}`}
                          >
                            {edge.label
                              ? (
                                <b className={edge.label}>
                                  {edge.label === "true"
                                    ? "T"
                                    : edge.label === "false"
                                    ? "F"
                                    : edge.label}
                                </b>
                              )
                              : <ArrowRight size={9} />}
                            <span>{edge.to}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )
              : (
                <div className="workflow-list-empty">
                  Failed to parse workflow.
                </div>
              )}
            {logs.length > 0 && (
              <div className="workflow-side-logs">
                <button
                  type="button"
                  onClick={() => setLogsOpen((value) => !value)}
                >
                  {logsOpen
                    ? <ChevronDown size={10} />
                    : <ChevronRight size={10} />}Logs ({logs.length})
                </button>
                {logsOpen && (
                  <div>
                    {logs.map((log, index) => {
                      const expanded = expandedLogIndex === index;
                      const hasDetail = !!log.input ||
                        log.output !== undefined || !!log.usage;
                      return (
                        <div
                          className={`workflow-side-log ${log.status}`}
                          key={`${log.nodeId}-${index}`}
                        >
                          <div
                            className={hasDetail ? "expandable" : ""}
                            onClick={() =>
                              hasDetail &&
                              setExpandedLogIndex(expanded ? null : index)}
                          >
                            {log.status === "success"
                              ? <CheckCircle size={10} />
                              : log.status === "error"
                              ? <XCircle size={10} />
                              : <Info size={10} />}
                            {hasDetail && (expanded
                              ? <ChevronDown size={10} />
                              : <ChevronRight size={10} />)}
                            <b>[{log.nodeId}]</b>
                            <span>{log.message}</span>
                            {log.mcpAppInfo && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void reopenWorkflowMcpApp(log.mcpAppInfo!);
                                }}
                              >
                                <Braces size={11} />
                              </button>
                            )}
                          </div>
                          {expanded && (
                            <div className="workflow-side-log-details">
                              {log.input && (
                                <section>
                                  <b>Input:</b>
                                  <pre>{JSON.stringify(log.input, null, 2)}</pre>
                                </section>
                              )}
                              {log.output !== undefined && (
                                <section>
                                  <b>Output:</b>
                                  <pre>{typeof log.output === "string" ? log.output : JSON.stringify(log.output, null, 2)}</pre>
                                </section>
                              )}
                              {log.usage && (
                                <section>
                                  <b>Usage:</b>
                                  <pre>{JSON.stringify(log.usage, null, 2)}</pre>
                                </section>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <footer className="workflow-side-footer">
              {workflow && (running
                ? (
                  <button
                    type="button"
                    className="stop"
                    onClick={() => abortRef.current?.abort()}
                  >
                    <Square size={14} />Stop
                  </button>
                )
                : (
                  <button
                    type="button"
                    className="execute"
                    onClick={() => void run()}
                  >
                    <Play size={14} />Execute
                  </button>
                ))}
              <button type="button" onClick={() => setHistoryOpen(true)}>
                <History size={14} />History
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiArtifact(skill ? "skill" : "workflow");
                  setAiMode("modify");
                }}
                disabled={(!workflow && !skill) || running}
              >
                <Sparkles size={14} />AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiArtifact("workflow");
                  setAiMode("create");
                }}
              >
                <FilePlus2 size={14} />New
              </button>
              {executionState !== "idle" && (
                <span
                  className={`workflow-run-status ${executionState}`}
                  title={executionState}
                >
                  {executionState === "running"
                    ? <Loader2 size={14} className="spin" />
                    : executionState === "error"
                    ? <XCircle size={14} />
                    : <CheckCircle size={14} />}
                </span>
              )}
            </footer>
          </>
        )}
      {automationOpen && path && (
        <WorkflowAutomationModal
          path={path}
          name={workflow?.name || path}
          settings={automation}
          onSave={(next) => {
            saveWorkflowAutomationSettings(next, directoryBase);
            setAutomation(next);
          }}
          onClose={() => setAutomationOpen(false)}
        />
      )}
      {editingNodeIndex !== null && workflowDocument?.nodes[editingNodeIndex] &&
        (
          <NodeEditorModal
            node={workflowDocument.nodes[editingNodeIndex]}
            nodeIds={workflowDocument.nodes.map((node) =>
              String(node.id || "")
            )}
            onSave={(updated) => {
              const nodes = workflowDocument.nodes.map((node, index) =>
                index === editingNodeIndex ? updated : { ...node }
              );
              const oldId = String(
                workflowDocument.nodes[editingNodeIndex].id || "",
              );
              const newId = String(updated.id || "");
              if (oldId && newId && oldId !== newId) {
                for (const node of nodes) {
                  for (const key of ["next", "trueNext", "falseNext"]) {
                    if (node[key] === oldId) node[key] = newId;
                  }
                }
              }
              updateRawNodes(nodes);
            }}
            onDelete={() => {
              const removed = workflowDocument.nodes[editingNodeIndex];
              const replacement = String(removed.next || "end");
              const nodes = workflowDocument.nodes.filter((_, index) =>
                index !== editingNodeIndex
              ).map((node) => {
                const next = { ...node };
                for (
                  const key of ["next", "trueNext", "falseNext"]
                ) if (next[key] === removed.id) next[key] = replacement;
                return next;
              });
              updateRawNodes(nodes);
            }}
            onClose={() => setEditingNodeIndex(null)}
          />
        )}
      {progressOpen && workflow && (
        <WorkflowProgressModal
          workflow={workflow}
          logs={logs}
          thinking={thinking}
          running={running}
          onStop={() => abortRef.current?.abort()}
          onClose={() => setProgressOpen(false)}
        />
      )}
      {aiMode && (
        <AIWorkflowBuilderModal
          mode={aiMode}
          artifactKind={aiArtifact}
          currentMarkdown={aiArtifact === "skill"
            ? `${markdown}\n\n--- RELATED WORKFLOW ---\n${skillWorkflowMarkdown}`
            : markdown}
          currentPath={path}
          currentName={skill?.name || workflow?.name}
          activeFile={activeFile}
          settings={settings}
          history={history}
          onClose={() => setAiMode(null)}
          onApply={async (result) => {
            if (aiArtifact === "skill") {
              const folder = result.path.replace(/\/$/, "");
              const workflowPath = `${folder}/workflows/main.workflow.yaml`;
              const skillPath = `${folder}/SKILL.md`;
              if (
                aiMode === "create" &&
                ((await readFile(skillPath).catch(() => null)) ||
                  (await readFile(workflowPath).catch(() => null)))
              ) throw new Error(`A skill already exists at ${folder}.`);
              const previous = aiMode === "modify" ? skill : null;
              const existingWorkflowPath = previous?.workflows[0]
                ? `${previous.folderPath}/${previous.workflows[0].path}`
                : workflowPath;
              const relativeWorkflowPath = existingWorkflowPath.slice(
                folder.length + 1,
              );
              const inputVariables = deriveWorkflowInputVariables(result.block);
              const skillMarkdown = buildSkillMarkdown(
                result.name,
                previous?.description || `Workspace skill: ${result.name}`,
                result.skillInstructions || "",
                {
                  path: relativeWorkflowPath,
                  description: previous?.workflows[0]?.description ||
                    `Run the ${result.name} workflow`,
                  inputVariables,
                },
              );
              let workflowMarkdown = workflowYamlFromContent(result.block);
              if (aiMode === "modify") {
                const existingFile = await readFile(existingWorkflowPath).catch(
                  () => null,
                );
                if (existingFile) {
                  workflowMarkdown = replaceWorkflowDefinition(
                    existingFile.content,
                    result.block,
                  );
                  workflowMarkdown = appendAIWorkflowHistory(
                    workflowMarkdown,
                    result.request,
                  );
                }
              }
              await writeFile(existingWorkflowPath, workflowMarkdown);
              await writeFile(skillPath, skillMarkdown);
              setPaths((current) =>
                [...new Set([...current, existingWorkflowPath])].sort()
              );
              setPath(skillPath);
              setMarkdown(skillMarkdown);
              onOpenFile(skillPath);
              window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
              return;
            }
            if (aiMode === "create") {
              const target = canonicalWorkflowPath(result.path);
              if (await readFile(target).catch(() => null)) {
                throw new Error(`A file already exists at ${target}.`);
              }
              const nextMarkdown = workflowYamlFromContent(result.block);
              await writeFile(target, nextMarkdown);
              setPaths((current) => [...new Set([...current, target])].sort());
              setPath(target);
              setMarkdown(nextMarkdown);
              onOpenFile(target);
            } else {
              const replaced = replaceWorkflowDefinition(
                markdown,
                result.block,
              );
              const nextMarkdown = appendAIWorkflowHistory(
                replaced,
                result.request,
              );
              await writeFile(path, nextMarkdown);
              setMarkdown(nextMarkdown);
            }
            window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
          }}
        />
      )}
    </section>
  );
}
