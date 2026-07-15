import { useEffect } from "react";
import { onChatToolRequest, readFile, resolveChatTool } from "../lib/wailsBackend";
import type { ChatSettings } from "../llm/settings";
import { executeWorkflow } from "../workflow/executor";
import { appendWorkflowHistory } from "../workflow/history";
import { parseWorkflowFile } from "../workflow/parser";
import { collectSkillWorkflows, discoverWorkspaceSkills } from "./skills";

function workflowVariables(value: unknown): Map<string, string | number> {
  let parsed: Record<string, unknown> = {};
  if (typeof value === "string" && value.trim()) parsed = JSON.parse(value) as Record<string, unknown>;
  else if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  const result = new Map<string, string | number>();
  for (const [key, item] of Object.entries(parsed)) {
    result.set(key, typeof item === "number" ? item : typeof item === "string" ? item : JSON.stringify(item));
  }
  return result;
}

export function SkillWorkflowToolHost({ directoryBase, settings, activeFile }: { directoryBase: string; settings: ChatSettings; activeFile: { path: string; content: string } | null }) {
  useEffect(() => onChatToolRequest((request) => {
    if (request.streamId || request.name !== "run_skill_workflow") return;
    void (async () => {
      const workflowId = typeof request.arguments.workflowId === "string" ? request.arguments.workflowId : "";
      const workflows = collectSkillWorkflows(await discoverWorkspaceSkills());
      const entry = workflows.get(workflowId);
      if (!entry) return { error: `Unknown workflow ID: ${workflowId}. Available: ${[...workflows.keys()].join(", ")}` };
      const file = await readFile(entry.workflowPath);
      if (!file) return { error: `Workflow file not found: ${entry.workflowPath}` };
      const workflow = parseWorkflowFile(file.content, entry.workflowPath);
      const run = await executeWorkflow(workflow, entry.workflowPath, {
        chatSettings: settings,
        activeFile,
        interactionMode: "headless",
        loadWorkflow: async (path) => {
          const nested = await readFile(path);
          if (!nested) throw new Error(`Workflow file not found: ${path}`);
          return parseWorkflowFile(nested.content, path);
        },
      }, workflowVariables(request.arguments.variables));
      await appendWorkflowHistory(run, directoryBase);
      if (run.status !== "completed") return { error: `Workflow execution failed: ${run.error || run.status}. Do not retry automatically; report the error to the user.`, workflowId, workflowPath: entry.workflowPath };
      return {
        success: true,
        workflowId,
        variables: Object.fromEntries(Object.entries(run.variables).filter(([key]) => !key.startsWith("__"))),
        logs: run.logs.filter((log) => log.status !== "info").map((log) => ({ node: log.nodeType, status: log.status, message: log.message })),
      };
    })().then((result) => resolveChatTool(request.requestId, result)).catch((caught) => resolveChatTool(request.requestId, { error: `Workflow execution failed: ${caught instanceof Error ? caught.message : String(caught)}. Do not retry automatically; report the error to the user.` }));
  }), [activeFile, directoryBase, settings]);

  return null;
}
