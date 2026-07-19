import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { type WorkflowNodeType, workflowNodeTypes } from "./types";
import type { RawWorkflowNode } from "./document";

const structural = new Set(["id", "type", "next", "trueNext", "falseNext"]);

const suggestedProperties: Partial<Record<WorkflowNodeType, string[]>> = {
  variable: ["name", "value"],
  set: ["name", "value"],
  if: ["condition"],
  while: ["condition"],
  command: [
    "prompt",
    "systemPrompt",
    "model",
    "ragSetting",
    "vaultTools",
    "mcpServers",
    "enableThinking",
    "attachments",
    "saveTo",
    "saveImageTo",
  ],
  http: [
    "url",
    "method",
    "headers",
    "body",
    "contentType",
    "responseType",
    "saveTo",
    "saveStatus",
    "throwOnError",
  ],
  json: ["source", "saveTo"],
  note: ["path", "content", "mode", "confirm", "history"],
  "note-read": ["path", "saveTo"],
  "note-search": ["query", "searchContent", "limit", "saveTo"],
  "note-list": [
    "folder",
    "recursive",
    "tags",
    "tagMatch",
    "createdWithin",
    "modifiedWithin",
    "sortBy",
    "sortOrder",
    "limit",
    "saveTo",
  ],
  "folder-list": ["folder", "saveTo"],
  open: ["path"],
  "note-delete": ["path", "confirm"],
  "drive-delete": ["path", "confirm"],
  "prompt-value": ["title", "message", "default", "multiline", "saveTo"],
  dialog: [
    "title",
    "message",
    "options",
    "multiSelect",
    "markdown",
    "button1",
    "button2",
    "inputTitle",
    "multiline",
    "defaults",
    "saveTo",
  ],
  "prompt-file": ["title", "default", "forcePrompt", "saveTo", "saveFileTo"],
  "prompt-selection": ["saveTo", "saveSelectionTo"],
  workflow: ["path", "input", "output", "prefix", "saveTo"],
  "rag-sync": ["ragSetting", "saveTo"],
  "file-explorer": [
    "mode",
    "path",
    "default",
    "title",
    "extensions",
    "saveTo",
    "savePathTo",
  ],
  "file-save": ["source", "path", "confirm", "savePathTo"],
  mcp: ["url", "tool", "args", "headers", "saveTo", "saveUiTo"],
  "gemihub-command": ["command", "path", "text", "metadata", "saveTo"],
  sleep: ["duration"],
  script: ["code", "timeout", "saveTo"],
  shell: [
    "command",
    "args",
    "cwd",
    "env",
    "timeout",
    "throwOnError",
    "saveTo",
    "saveStderrTo",
    "saveExitCodeTo",
  ],
};

const defaultProperties: Record<WorkflowNodeType, Record<string, string>> = {
  variable: { name: "", value: "" },
  set: { name: "", value: "" },
  if: { condition: "" },
  while: { condition: "" },
  command: {
    prompt: "",
    model: "",
    ragSetting: "__none__",
    enableThinking: "true",
    attachments: "",
    saveTo: "",
  },
  http: { url: "", method: "GET", saveTo: "" },
  json: { source: "", saveTo: "" },
  note: { path: "", content: "", mode: "overwrite", confirm: "true" },
  "note-read": { path: "", saveTo: "" },
  "note-search": { query: "", searchContent: "false", limit: "10", saveTo: "" },
  "note-list": {
    folder: "",
    recursive: "false",
    tags: "",
    tagMatch: "any",
    createdWithin: "",
    modifiedWithin: "",
    sortBy: "",
    sortOrder: "desc",
    limit: "50",
    saveTo: "",
  },
  "folder-list": { folder: "", saveTo: "" },
  open: { path: "" },
  dialog: {
    title: "",
    message: "",
    markdown: "false",
    options: "",
    multiSelect: "false",
    inputTitle: "",
    multiline: "false",
    defaults: "",
    button1: "OK",
    button2: "",
    saveTo: "",
  },
  "note-delete": { path: "", confirm: "true" },
  "drive-delete": { path: "", confirm: "true" },
  "prompt-value": {
    title: "Input",
    message: "",
    default: "",
    multiline: "false",
    saveTo: "value",
  },
  "prompt-file": { title: "", saveTo: "", saveFileTo: "" },
  "prompt-selection": { title: "", saveTo: "", saveSelectionTo: "" },
  workflow: { path: "", input: "", output: "", prefix: "" },
  "rag-sync": { path: "", ragSetting: "", saveTo: "" },
  "file-explorer": {
    mode: "select",
    title: "",
    extensions: "",
    default: "",
    saveTo: "",
    savePathTo: "",
  },
  "file-save": { source: "", path: "", savePathTo: "" },
  "gemihub-command": {
    command: "duplicate",
    path: "",
    text: "",
    metadata: "",
    saveTo: "",
  },
  mcp: { url: "", tool: "", args: "", headers: "", saveTo: "" },
  sleep: { duration: "1000" },
  script: { code: "", timeout: "10000", saveTo: "" },
  shell: {
    command: "",
    args: "",
    cwd: "",
    env: "",
    timeout: "60000",
    throwOnError: "true",
    saveTo: "",
    saveStderrTo: "",
    saveExitCodeTo: "",
  },
};

export function changeWorkflowNodeType(
  node: RawWorkflowNode,
  type: WorkflowNodeType,
): RawWorkflowNode {
  const structure = Object.fromEntries(
    Object.entries(node).filter(([key]) =>
      structural.has(key) && key !== "type"
    ),
  );
  return { ...structure, type, ...defaultProperties[type] };
}

export function NodeEditorModal(
  { node, nodeIds, onSave, onDelete, onClose }: {
    node: RawWorkflowNode;
    nodeIds: string[];
    onSave: (node: RawWorkflowNode) => void;
    onDelete?: () => void;
    onClose: () => void;
  },
) {
  const [draft, setDraft] = useState<RawWorkflowNode>(() =>
    structuredClone(node)
  );
  const [newProperty, setNewProperty] = useState("");
  const [customProperty, setCustomProperty] = useState("");
  const type = workflowNodeTypes.includes(draft.type as WorkflowNodeType)
    ? draft.type as WorkflowNodeType
    : "variable";
  const properties = Object.keys(draft).filter((key) => !structural.has(key));
  const available = useMemo(
    () => (suggestedProperties[type] ?? []).filter((key) => !(key in draft)),
    [draft, type],
  );
  const conditional = type === "if" || type === "while";
  const addProperty = (key: string) => {
    if (key && !(key in draft)) {
      setDraft((current) => ({ ...current, [key]: "" }));
    }
    setNewProperty("");
  };
  const save = () => {
    const id = String(draft.id || "").trim();
    if (!id) return;
    const cleaned = Object.fromEntries(
      Object.entries(draft).filter(([, value]) =>
        value !== "" && value !== undefined
      ),
    );
    onSave({ ...cleaned, id, type });
    onClose();
  };
  return (
    <div className="workflow-modal-backdrop" onClick={onClose}>
      <section
        className="workflow-node-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <strong>{node.id ? `Edit node · ${node.id}` : "Add node"}</strong>
          <button type="button" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="workflow-node-fields">
          <label>
            <span>ID</span>
            <input
              value={String(draft.id ?? "")}
              onChange={(event) =>
                setDraft((current) => ({ ...current, id: event.target.value }))}
            />
          </label>
          <label>
            <span>Type</span>
            <select
              value={type}
              onChange={(event) =>
                setDraft((current) =>
                  changeWorkflowNodeType(
                    current,
                    event.target.value as WorkflowNodeType,
                  )
                )}
            >
              {workflowNodeTypes.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          {properties.map((key) => {
            const wide = ["prompt", "content", "code", "body", "message"]
              .includes(key);
            return (
              <label key={key} className={wide ? "wide" : ""}>
                <span>
                  {key}
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => {
                        const next = { ...current };
                        delete next[key];
                        return next;
                      })}
                  >
                    <X size={10} />
                  </button>
                </span>
                {wide
                  ? (
                    <textarea
                      rows={5}
                      value={String(draft[key] ?? "")}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))}
                    />
                  )
                  : (
                    <input
                      value={String(draft[key] ?? "")}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))}
                    />
                  )}
              </label>
            );
          })}
          <div className="workflow-add-property">
            <select
              value={newProperty}
              onChange={(event) => setNewProperty(event.target.value)}
            >
              <option value="">Add property…</option>
              {available.map((key) => <option key={key}>{key}</option>)}
              <option value="__custom">Custom…</option>
            </select>
            {newProperty === "__custom" && (
              <input
                value={customProperty}
                onChange={(event) => setCustomProperty(event.target.value)}
                placeholder="Property name"
              />
            )}
            <button
              type="button"
              onClick={() =>
                addProperty(
                  newProperty === "__custom"
                    ? customProperty.trim()
                    : newProperty,
                )}
            >
              <Plus size={12} />Add
            </button>
          </div>
          {conditional
            ? (
              <>
                <label>
                  <span>trueNext</span>
                  <select
                    value={String(draft.trueNext ?? "")}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        trueNext: event.target.value,
                      }))}
                  >
                    <option value="end">end</option>
                    {nodeIds.filter((id) => id !== draft.id).map((id) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>falseNext</span>
                  <select
                    value={String(draft.falseNext ?? "")}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        falseNext: event.target.value,
                      }))}
                  >
                    <option value="end">end</option>
                    {nodeIds.filter((id) => id !== draft.id).map((id) => (
                      <option key={id}>{id}</option>
                    ))}
                  </select>
                </label>
              </>
            )
            : (
              <label>
                <span>next</span>
                <select
                  value={String(draft.next ?? "")}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      next: event.target.value,
                    }))}
                >
                  <option value="">automatic</option>
                  <option value="end">end</option>
                  {nodeIds.filter((id) => id !== draft.id).map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
              </label>
            )}
        </div>
        <footer>
          {onDelete && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              <X size={13} />Delete
            </button>
          )}
          <span />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={save}>
            Apply
          </button>
        </footer>
      </section>
    </div>
  );
}
