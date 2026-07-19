import { useEffect, useRef, useState } from "react";
import { listProjectFiles, readProjectFile as readFile, type DirectoryFileEntry } from "../lib/wailsBackend";
import type { ChatSettings } from "../llm/settings";
import { executeWorkflow } from "./executor";
import { appendWorkflowHistory } from "./history";
import { parseWorkflowFile } from "./parser";
import { keyboardEventShortcut, loadWorkflowAutomationSettings, matchWorkflowFilePattern, workflowAutomationChangedEvent, type WorkflowAutomationSettings, type WorkflowEventTrigger, type WorkflowEventType } from "./automationSettings";
import { WorkflowProgressModal } from "./WorkflowProgressModal";
import type { Workflow, WorkflowLog } from "./types";

interface FileEvent {
  type: WorkflowEventType;
  path: string;
  oldPath?: string;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.matches("input, textarea, select") || element.isContentEditable);
}

export function WorkflowAutomationHost({ directoryBase, settings, activeFile, onOpenFile }: { directoryBase: string; settings: ChatSettings; activeFile: { path: string; content: string } | null; onOpenFile: (path: string) => void }) {
  const [automation, setAutomation] = useState<WorkflowAutomationSettings>(() => loadWorkflowAutomationSettings(directoryBase));
  const snapshotRef = useRef<Map<string, DirectoryFileEntry> | null>(null);
  const blockedUntilRef = useRef(new Map<string, number>());
  const queueRef = useRef(Promise.resolve());
  const modifyTimersRef = useRef(new Map<string, number>());
  const lastOpenedRef = useRef("");
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

  const executeTrigger = async (trigger: WorkflowEventTrigger, event: FileEvent) => {
    if (Date.now() < (blockedUntilRef.current.get(event.path) ?? 0)) return;
    const workflowFile = await readFile(trigger.workflowId);
    if (!workflowFile) throw new Error(`Workflow not found: ${trigger.workflowId}`);
    const workflow = parseWorkflowFile(workflowFile.content, trigger.workflowId);
    const initial = new Map<string, string | number>();
    initial.set("_eventType", event.type);
    initial.set("_eventFilePath", event.path);
    initial.set("_eventFile", JSON.stringify({ path: event.path, basename: event.path.split("/").pop() || event.path, name: (event.path.split("/").pop() || event.path).replace(/\.[^.]+$/, ""), extension: event.path.split(".").pop() || "" }));
    if (event.oldPath) initial.set("_eventOldPath", event.oldPath);
    if (["create", "modify", "file-open"].includes(event.type)) {
      const file = event.type === "file-open" && activeFile?.path === event.path ? activeFile : await readFile(event.path).catch(() => null);
      if (file) initial.set("_eventFileContent", file.content);
    }
    blockedUntilRef.current.set(event.path, Date.now() + 12_000);
    blockedUntilRef.current.set(trigger.workflowId, Date.now() + 12_000);
    const run = await executeWorkflow(workflow, trigger.workflowId, { chatSettings: settings, activeFile, openFile: onOpenFile, interactionMode: "event" }, initial);
    await appendWorkflowHistory(run, directoryBase);
    if (run.status === "error") console.error(`Workflow ${trigger.workflowId} failed on ${event.type}: ${run.error}`);
  };

  const dispatchEvent = (event: FileEvent) => {
    const matches = automation.triggers.filter((trigger) => trigger.events.includes(event.type) && matchWorkflowFilePattern(trigger.filePattern, event.path));
    for (const trigger of matches) {
      queueRef.current = queueRef.current.then(() => executeTrigger(trigger, event)).catch((error) => console.error("Workflow event failed", error));
    }
  };

  useEffect(() => {
    if (!directoryBase || automation.triggers.length === 0) { snapshotRef.current = null; return; }
    let cancelled = false;
    const scan = async () => {
      const files = await listProjectFiles();
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

  return progress ? <WorkflowProgressModal workflow={progress.workflow} logs={progress.logs} thinking={progress.thinking} running={progress.running} onStop={() => progress.controller.abort()} onClose={() => setProgress(null)} /> : null;
}
