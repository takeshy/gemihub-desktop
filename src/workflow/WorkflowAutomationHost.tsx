import { useEffect, useRef, useState } from "react";
import { CheckCircle, Loader2, X, XCircle } from "lucide-react";
import { listWorkspaceFiles, readWorkspaceFile as readFile, type DirectoryFileEntry } from "../lib/wailsBackend";
import type { ChatSettings } from "../llm/settings";
import { executeWorkflow } from "./executor";
import { appendWorkflowHistory } from "./history";
import { parseWorkflowFile } from "./parser";
import { keyboardEventShortcut, loadWorkflowAutomationSettings, matchWorkflowFilePattern, workflowAutomationChangedEvent, workflowEventLabels, type WorkflowAutomationSettings, type WorkflowEventTrigger, type WorkflowEventType } from "./automationSettings";
import { WorkflowProgressModal } from "./WorkflowProgressModal";
import type { Workflow, WorkflowLog } from "./types";
import type { FileRef } from "../lib/fileRef";

interface FileEvent {
  type: WorkflowEventType;
  path: string;
  oldPath?: string;
}

// Event runs have no progress modal, so a small toast is the only sign the app
// is doing something on its own. Failures stay until dismissed.
interface AutomationNotice {
  id: number;
  name: string;
  event: WorkflowEventType;
  status: "running" | "completed" | "error";
  message?: string;
  elapsed?: string;
}

const noticeDismissMs = 5_000;
const maxNotices = 3;

function workflowLabel(workflowId: string): string {
  return (workflowId.split("/").pop() || workflowId).replace(/\.(?:workflow\.ya?ml|ya?ml|md)$/i, "");
}

function elapsedLabel(startedAt: number): string {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.matches("input, textarea, select") || element.isContentEditable);
}

export function WorkflowAutomationHost({ directoryBase, settings, activeFile, onOpenFile }: { directoryBase: string; settings: ChatSettings; activeFile: { path: string; content: string } | null; onOpenFile: (file: FileRef) => void }) {
  const [automation, setAutomation] = useState<WorkflowAutomationSettings>(() => loadWorkflowAutomationSettings(directoryBase));
  const snapshotRef = useRef<Map<string, DirectoryFileEntry> | null>(null);
  const blockedUntilRef = useRef(new Map<string, number>());
  const queueRef = useRef(Promise.resolve());
  const modifyTimersRef = useRef(new Map<string, number>());
  const lastOpenedRef = useRef("");
  const startupDispatchedRef = useRef(new Set<string>());
  const [notices, setNotices] = useState<AutomationNotice[]>([]);
  const noticeIdRef = useRef(0);
  const noticeTimersRef = useRef(new Map<number, number>());
  const [progress, setProgress] = useState<{ workflow: Workflow; logs: WorkflowLog[]; thinking: Record<string, string>; running: boolean; controller: AbortController } | null>(null);

  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ directoryBase?: string; settings?: WorkflowAutomationSettings }>).detail;
      if (!detail?.directoryBase || detail.directoryBase === directoryBase) setAutomation(detail?.settings || loadWorkflowAutomationSettings(directoryBase));
    };
    window.addEventListener(workflowAutomationChangedEvent, changed);
    return () => window.removeEventListener(workflowAutomationChangedEvent, changed);
  }, [directoryBase]);

  useEffect(() => { setAutomation(loadWorkflowAutomationSettings(directoryBase)); snapshotRef.current = null; blockedUntilRef.current.clear(); }, [directoryBase]);

  const dismissNotice = (id: number) => {
    const timer = noticeTimersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    noticeTimersRef.current.delete(id);
    setNotices((current) => current.filter((notice) => notice.id !== id));
  };

  const finishNotice = (id: number, status: "completed" | "error", startedAt: number, message?: string) => {
    setNotices((current) => current.map((notice) => notice.id === id ? { ...notice, status, message, elapsed: elapsedLabel(startedAt) } : notice));
    if (status === "error") return;
    noticeTimersRef.current.set(id, window.setTimeout(() => dismissNotice(id), noticeDismissMs));
  };

  useEffect(() => () => { for (const timer of noticeTimersRef.current.values()) window.clearTimeout(timer); noticeTimersRef.current.clear(); }, []);

  const executeTrigger = async (trigger: WorkflowEventTrigger, event: FileEvent) => {
    if (Date.now() < (blockedUntilRef.current.get(event.path) ?? 0)) return;
    const noticeId = ++noticeIdRef.current;
    const startedAt = Date.now();
    setNotices((current) => [...current.slice(-(maxNotices - 1)), { id: noticeId, name: workflowLabel(trigger.workflowId), event: event.type, status: "running" }]);
    let failure = "";
    try {
      failure = await runTrigger(trigger, event);
    } catch (error) {
      finishNotice(noticeId, "error", startedAt, error instanceof Error ? error.message : String(error));
      throw error;
    }
    finishNotice(noticeId, failure ? "error" : "completed", startedAt, failure || undefined);
  };

  const runTrigger = async (trigger: WorkflowEventTrigger, event: FileEvent): Promise<string> => {
    const workflowFile = await readFile(trigger.workflowId);
    if (!workflowFile) throw new Error(`Workflow not found: ${trigger.workflowId}`);
    const workflow = parseWorkflowFile(workflowFile.content, trigger.workflowId);
    const initial = new Map<string, string | number>();
    initial.set("_eventType", event.type);
    if (event.type !== "startup") {
      initial.set("_eventFilePath", event.path);
      initial.set("_eventFile", JSON.stringify({ path: event.path, basename: event.path.split("/").pop() || event.path, name: (event.path.split("/").pop() || event.path).replace(/\.[^.]+$/, ""), extension: event.path.split(".").pop() || "" }));
    }
    if (event.oldPath) initial.set("_eventOldPath", event.oldPath);
    if (["create", "modify", "file-open"].includes(event.type)) {
      const file = event.type === "file-open" && activeFile?.path === event.path ? activeFile : await readFile(event.path).catch(() => null);
      if (file) initial.set("_eventFileContent", file.content);
    }
    blockedUntilRef.current.set(event.path, Date.now() + 12_000);
    blockedUntilRef.current.set(trigger.workflowId, Date.now() + 12_000);
    const run = await executeWorkflow(workflow, trigger.workflowId, { chatSettings: settings, activeFile, openFile: onOpenFile, interactionMode: "event" }, initial);
    await appendWorkflowHistory(run, directoryBase);
    if (run.status !== "error") return "";
    console.error(`Workflow ${trigger.workflowId} failed on ${event.type}: ${run.error}`);
    return run.error || "Workflow failed";
  };

  const dispatchEvent = (event: FileEvent, source = automation) => {
    const matches = source.triggers.filter((trigger) => trigger.events.includes(event.type) && (event.type === "startup" || matchWorkflowFilePattern(trigger.filePattern, event.path)));
    for (const trigger of matches) {
      queueRef.current = queueRef.current.then(() => executeTrigger(trigger, event)).catch((error) => console.error("Workflow event failed", error));
    }
  };

  useEffect(() => {
    if (!directoryBase || startupDispatchedRef.current.has(directoryBase)) return;
    startupDispatchedRef.current.add(directoryBase);
    dispatchEvent({ type: "startup", path: "" }, loadWorkflowAutomationSettings(directoryBase));
  }, [directoryBase]);

  useEffect(() => {
    if (!directoryBase || automation.triggers.length === 0) { snapshotRef.current = null; return; }
    let cancelled = false;
    const scan = async () => {
      const files = await listWorkspaceFiles();
      if (cancelled) return;
      const next = new Map(files.map((file) => [file.path, file]));
      const previous = snapshotRef.current;
      snapshotRef.current = next;
      if (!previous) return;
      const created = files.filter((file) => !previous.has(file.path));
      const deleted = [...previous.values()].filter((file) => !next.has(file.path));
      const pairedCreated = new Set<string>(), pairedDeleted = new Set<string>();
      for (const removed of deleted) {
        const added = created.find((candidate) => !pairedCreated.has(candidate.path) && candidate.md5 === removed.md5);
        if (added) { pairedCreated.add(added.path); pairedDeleted.add(removed.path); dispatchEvent({ type: "rename", path: added.path, oldPath: removed.path }); }
      }
      for (const file of created) if (!pairedCreated.has(file.path)) dispatchEvent({ type: "create", path: file.path });
      for (const file of deleted) if (!pairedDeleted.has(file.path)) dispatchEvent({ type: "delete", path: file.path });
      for (const file of files) {
        const before = previous.get(file.path);
        if (!before || before.md5 === file.md5) continue;
        const existing = modifyTimersRef.current.get(file.path);
        if (existing) window.clearTimeout(existing);
        modifyTimersRef.current.set(file.path, window.setTimeout(() => { modifyTimersRef.current.delete(file.path); dispatchEvent({ type: "modify", path: file.path }); }, 5_000));
      }
    };
    void scan();
    const timer = window.setInterval(() => void scan(), 3_000);
    return () => { cancelled = true; window.clearInterval(timer); for (const value of modifyTimersRef.current.values()) window.clearTimeout(value); modifyTimersRef.current.clear(); };
  }, [directoryBase, automation.triggers, settings]);

  useEffect(() => {
    if (!activeFile?.path || activeFile.path === lastOpenedRef.current) return;
    lastOpenedRef.current = activeFile.path;
    dispatchEvent({ type: "file-open", path: activeFile.path });
  }, [activeFile?.path, automation.triggers]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const shortcut = keyboardEventShortcut(event);
      const workflowPath = Object.entries(automation.hotkeys).find(([, configured]) => configured === shortcut)?.[0];
      if (!workflowPath) return;
      event.preventDefault();
      queueRef.current = queueRef.current.then(async () => {
        const file = await readFile(workflowPath);
        if (!file) throw new Error(`Workflow not found: ${workflowPath}`);
        const workflow = parseWorkflowFile(file.content, workflowPath);
        const controller = new AbortController();
        const showProgress = workflow.options?.showProgress !== false;
        if (showProgress) setProgress({ workflow, logs: [], thinking: {}, running: true, controller });
        const initial = new Map<string, string | number>();
        if (activeFile) {
          const basename = activeFile.path.split("/").pop() || activeFile.path;
          initial.set("_hotkeyActiveFile", JSON.stringify({ path: activeFile.path, basename, name: basename.replace(/\.[^.]+$/, ""), extension: basename.includes(".") ? basename.split(".").pop() || "" : "" }));
          initial.set("_hotkeyContent", activeFile.content);
          const selectedText = window.getSelection()?.toString() || "";
          initial.set("_hotkeySelection", selectedText);
          const start = selectedText ? Math.max(0, activeFile.content.indexOf(selectedText)) : 0;
          const end = start + selectedText.length;
          initial.set("_hotkeySelectionInfo", JSON.stringify({ filePath: activeFile.path, startLine: activeFile.content.slice(0, start).split("\n").length, endLine: activeFile.content.slice(0, end).split("\n").length, start, end }));
        }
        const run = await executeWorkflow(workflow, workflowPath, {
          chatSettings: settings, activeFile, openFile: onOpenFile, interactionMode: "hotkey", signal: controller.signal,
          onLog: showProgress ? (log) => setProgress((current) => current ? { ...current, logs: [...current.logs, log] } : current) : undefined,
          onThinking: showProgress ? (nodeId, value) => setProgress((current) => current ? { ...current, thinking: { ...current.thinking, [nodeId]: value } } : current) : undefined,
        }, initial);
        await appendWorkflowHistory(run, directoryBase);
        if (showProgress) setProgress((current) => current ? { ...current, running: false } : current);
      }).catch((error) => console.error("Workflow hotkey failed", error));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeFile, automation.hotkeys, directoryBase, settings]);

  return <>
    {progress && <WorkflowProgressModal workflow={progress.workflow} logs={progress.logs} thinking={progress.thinking} running={progress.running} onStop={() => progress.controller.abort()} onClose={() => setProgress(null)} />}
    {notices.length > 0 && (
      <div className="workflow-automation-toasts">
        {notices.map((notice) => (
          <div key={notice.id} className={`workflow-automation-toast ${notice.status}`}>
            {notice.status === "running" ? <Loader2 size={13} className="spin" /> : notice.status === "completed" ? <CheckCircle size={13} /> : <XCircle size={13} />}
            <div>
              <strong>{notice.name}</strong>
              <small>
                {workflowEventLabels[notice.event]}
                {notice.status === "running" ? " · running…" : notice.elapsed ? ` · ${notice.elapsed}` : ""}
              </small>
              {notice.message && <small className="workflow-automation-toast-error">{notice.message}</small>}
            </div>
            <button type="button" onClick={() => dismissNotice(notice.id)} aria-label="Dismiss"><X size={13} /></button>
          </div>
        ))}
      </div>
    )}
  </>;
}
