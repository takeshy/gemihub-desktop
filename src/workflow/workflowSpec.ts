import type { ChatToolDefinition } from "../lib/wailsBackend";
import { type WorkflowNodeType, workflowNodeTypes } from "./types";

export const workflowGenerationSpec = `
Return exactly one Markdown fenced code block named hub-workflow. Do not add prose outside it.
The fence is the AI response envelope only. Stored workflow files are standalone pure YAML named *.workflow.yaml; the app removes the fence before saving.

Format:
\`\`\`hub-workflow
name: Workflow name
nodes:
  - id: unique-id
    type: variable
    name: input
    value: example
    next: next-id
\`\`\`

Top-level \`options.showProgress: false\` suppresses the hotkey execution progress window (default: true).

Every node needs a unique id and type. Normal nodes use next; if/while use trueNext and falseNext. Terminate with \`next: end\` (or a branch target of \`end\`). Never create a node with \`type: end\`; \`end\` is a reserved target, not a node type.

Variable syntax:
- {{name}}, {{object.property}}, {{array[0].name}}, and {{array[index]}} where index is another variable.
- {{name:json}} escapes a string for use inside a quoted JSON/JavaScript string; it does not add surrounding quotes. Write "{{name:json}}" when a string literal is required.
- set supports one arithmetic operation: +, -, *, /, or %.
- A variable node without value preserves caller input. A variable node with value always initializes it.

System variables include _date, _time, _datetime, _workflowName, and _lastModel. Event runs also provide _eventType, _eventFilePath, _eventFile, _eventFileContent, and _eventOldPath. Hotkey runs provide _hotkeyContent, _hotkeySelection, _hotkeyActiveFile, and _hotkeySelectionInfo. Setting _clipboard copies text to the clipboard.

Supported nodes:
- variable: required name; optional value. Omit value only for input supplied by a parent workflow, skill, hotkey, or other caller. It does not show an input dialog and becomes empty when a standalone run has no caller value.
- set: required name and value (supports simple arithmetic; _clipboard copies the result)
- if / while: condition using ==, !=, <, >, <=, >=, contains; required trueNext and optional falseNext
- command: prompt, optional model, ragSetting (__websearch__/__none__/configured name; omitted uses the Chat-selected RAG), vaultTools (all/noSearch/none), mcpServers (comma-separated configured names), enableThinking (true by default), attachments, saveTo, saveImageTo. When using saveImageTo, model must explicitly name a configured image-generation model (for example gemini-3.1-flash-image-preview); a text model cannot create image data.
- gemihub-command: command (encrypt, duplicate, convert-to-html, rename), path, optional text, metadata JSON, saveTo. PDF conversion is unavailable; publish/unpublish require Web.
- http: reserved for APIs, webhooks, explicit file downloads/binary transfer, or requests that must inspect status/headers; url; method GET/POST/PUT/PATCH/DELETE; contentType json/form-data/text/binary; responseType auto/text/binary; headers JSON; body; saveTo; saveStatus; throwOnError. Binary input/output uses FileExplorerData. Do not use http to read an ordinary public webpage for summarization, translation, extraction, or infographic generation; use command with __websearch__ instead.
- json: source (bare variable name), saveTo
- note: path, content, mode (overwrite/append/create), confirm (true by default), history
- note-read: path, saveTo
- note-search: query, searchContent, limit, saveTo
- note-list: folder, recursive, tags, tagMatch (any/all), createdWithin, modifiedWithin, sortBy, sortOrder, limit, saveTo
- folder-list: folder, saveTo
- open: path
- dialog: title, message, markdown, options, multiSelect, inputTitle, multiline, defaults JSON, button1, button2, saveTo
- prompt-value: saveTo; optional title, message, default, multiline. Use this to ask the user for text during an interactive standalone run. Headless runs require default.
- prompt-file: title, default, forcePrompt, saveTo (content), saveFileTo (path)
- prompt-selection: saveTo (content), saveSelectionTo (selection metadata)
- workflow: path; input maps child variables to values; output maps parent variables to child names; without output all child variables are copied with optional prefix; saveTo stores the complete child result
- rag-sync: ragSetting, saveTo
- file-explorer: mode (select/create), direct path or default, title, extensions, saveTo (FileExplorerData), savePathTo
- file-save: source FileExplorerData, path, optional confirm, savePathTo. The source extension is added when path has none. Generated images from saveImageTo can be saved here.
- mcp: url, tool, args JSON, headers JSON, saveTo, saveUiTo; MCP App UI resources open in a sandboxed modal
- sleep: duration in milliseconds
- script: code, timeout, saveTo. Code must return a cloneable value.
- shell: command, args JSON array, cwd, env JSON object, timeout, throwOnError, saveTo, saveStderrTo, saveExitCodeTo

FileExplorerData is JSON with path, basename, name, extension, mimeType, contentType (text or binary), and data (text or Base64).

For skill workflows, every {{variable}} that is never initialized by variable/set or a save property becomes an input. Save meaningful outputs to named variables; the chat caller automatically receives every variable not beginning with __. Do not add a final command merely to display a value.

For a standalone interactive workflow, acquire every required user value with prompt-value, prompt-file, prompt-selection, file-explorer, or dialog before using it. Do not use an uninitialized variable node as a substitute for a user prompt. Use variable without value only when the request explicitly says the workflow is called with that input, or when authoring a skill/child workflow whose caller supplies it.

Interpret "infographic" as a readable, visually structured Markdown or HTML document by default. Use headings, short sections, emoji/icons, callouts, cards, tables, timelines, and restrained colors as appropriate. Do not assume it means a bitmap image. Use saveImageTo and an image-generation model only when the user explicitly asks for an image, illustration, PNG, JPEG, or other raster output. For HTML infographic output, have a command return the complete HTML to saveTo and then write it with a note node or another appropriate text-file output.

Prefer Workspace file nodes (note, note-read, note-search, note-list) and never call them vault operations in names or descriptions. Use confirm: true for writes. Keep the graph connected and finite; only while nodes may be loop targets. Always specify saveTo for output-producing nodes. Use one task per command node and add a comment property when its purpose is not obvious.

Simplicity is a primary design requirement:
- Build the smallest connected workflow that fulfills the explicit request. Prefer one clear happy-path chain.
- Do not add validation, empty-result checks, status branches, retry loops, normalization scripts, or custom error-result nodes unless the user explicitly requests that behavior or the next node cannot operate safely without it. Runtime errors already surface to the user.
- For reading and transforming a public webpage, use a command node with \`ragSetting: __websearch__\` and the URL in its prompt. Do not use http or fetch raw HTML, and do not write a custom extraction script. The http node is for APIs, webhooks, downloads/binary transfer, or explicitly requested low-level HTTP behavior.
- Prefer high-level Workspace nodes over script or shell. Use script only for deterministic transformation that ordinary nodes cannot express.
- Do not split one natural LLM task across multiple command nodes unless the intermediate result is independently useful or the user requested separate stages.
- A normal interactive workflow usually needs only: acquire required input, perform the task, choose/derive an output path if needed, save, and optionally open or return the path.

Critical data-flow rules and examples:
- \`json.source\` is a bare variable name. Correct: \`source: responseBody\`. Wrong: \`source: "{{responseBody}}"\` or \`source: "[{{responseBody}}]"\`.
- \`{{value:json}}\` only escapes characters and never adds quotes. In JavaScript use \`const text = "{{value:json}}"\`; bare \`const text = {{value:json}}\` is invalid for ordinary strings.
- A JSON array/object already stored in a variable can be embedded as a JavaScript literal with \`const items = {{items}}\`; alternatively parse a string with \`JSON.parse("{{items:json}}")\`.
- HTTP errors throw by default. Set \`throwOnError: false\` only when \`saveStatus\` is checked by a downstream \`if\` branch that handles non-success status codes. Do not turn failures into ordinary result strings.
- All values used later must first come from variable/set, a caller input, a system variable, or a node save property. Property names in \`saveTo\` are variable names, not \`{{...}}\` expressions.
- Backward edges may target only a while node. Increment a loop counter with set, then use \`next\` to return to the while node.

Common result shapes:
- note-search saves a JSON array of matching note records.
- note-list saves \`{notes: [...], count, totalCount, hasMore}\`. Iterate with \`{{list.notes[index].path}}\` and stop with \`{{index}} < {{list.count}}\`.
- folder-list saves \`{folders: [{name, path}], count}\`.
- dialog saves JSON containing \`button\`, \`selected\`, and \`input\`.
- prompt-file can save file content with \`saveTo\` and file metadata/path with \`saveFileTo\`.
- file-explorer and binary HTTP responses use FileExplorerData. Pass the variable name, without braces, to file-save.source or command.attachments.
- http saves the response in saveTo and the numeric status in saveStatus.
- shell can save stdout, stderr, and exit code separately. Keep throwOnError true unless the graph explicitly handles a non-zero exit.

Examples:
\`\`\`yaml
name: summarize-note
nodes:
  - id: choose-note
    type: file-explorer
    mode: select
    extensions: md
    saveTo: selectedFile
    savePathTo: selectedPath
    next: summarize
  - id: summarize
    type: command
    prompt: "Summarize the attached note."
    attachments: selectedFile
    saveTo: summary
    next: save-summary
  - id: save-summary
    type: note
    path: "Summaries/{{selectedPath}}.md"
    content: "{{summary}}"
    mode: overwrite
    confirm: true
    next: end
\`\`\`

\`\`\`yaml
name: webpage-to-markdown
nodes:
  - id: ask-url
    type: prompt-value
    title: Webpage URL
    saveTo: url
    next: create-markdown
  - id: create-markdown
    type: command
    ragSetting: __websearch__
    vaultTools: none
    prompt: |
      Read {{url}} and create a concise Markdown infographic from its main content.
      Preserve facts and include the source URL. Return Markdown only.
    saveTo: markdown
    next: choose-output
  - id: choose-output
    type: file-explorer
    mode: create
    default: webpage-infographic.md
    extensions: md
    savePathTo: outputPath
    next: save-output
  - id: save-output
    type: note
    path: "{{outputPath}}"
    content: "{{markdown}}"
    mode: overwrite
    confirm: true
    next: end
\`\`\`
`.trim();

export interface WorkflowGenerationContext {
  models?: string[];
  ragSettings?: string[];
  mcpServers?: string[];
}

export function buildWorkflowGenerationSpec(
  context?: WorkflowGenerationContext,
): string {
  const configured = [
    context?.models?.length
      ? `Configured models (use an exact name when setting command.model): ${
        context.models.join(", ")
      }`
      : "No configured model names were supplied. Omit command.model to use the selected workflow model.",
    context?.ragSettings?.length
      ? `Configured RAG settings: ${context.ragSettings.join(", ")}`
      : "No named RAG settings are configured. Use __none__ or omit ragSetting; __websearch__ is available only when the selected provider supports it.",
    context?.mcpServers?.length
      ? `Enabled MCP servers (command.mcpServers uses these exact names): ${
        context.mcpServers.join(", ")
      }`
      : "No MCP servers are enabled. Do not invent command.mcpServers values.",
  ].join("\n");
  return `${workflowGenerationSpec}\n\nRuntime configuration:\n${configured}\n\nFINAL AUTHORING PRIORITY: Keep the YAML as concise and simple as possible while fulfilling the explicit request. Use the fewest necessary nodes and one clear happy path. Do not add validation, branching, scripts, retries, or error-reporting nodes unless the user explicitly requested them or they are essential to the requested operation.`;
}

export const getWorkflowSpecTool: ChatToolDefinition = {
  name: "get_workflow_spec",
  description:
    "Return the Workspace workflow specification. Pass nodeTypes to retrieve only the requested node documentation. Use this before explaining, debugging, or writing workflow YAML.",
  parameters: {
    type: "object",
    properties: {
      nodeTypes: {
        type: "array",
        description:
          "Optional workflow node type names, such as command, http, or note-list.",
        items: { type: "string" },
      },
    },
  },
};

const workflowNodeDocumentation: Record<WorkflowNodeType, string> = {
  variable:
    "- variable: required name; optional value. Omit value only for caller-supplied input; it does not display a user prompt and is empty in a standalone run without caller input.",
  set:
    "- set: required name and value; supports one arithmetic operation. Setting _clipboard copies the result.",
  if:
    "- if: required condition and trueNext; optional falseNext. Conditions support ==, !=, <, >, <=, >=, contains.",
  while:
    "- while: required condition and trueNext; optional falseNext is the exit. Only while nodes may be loop targets.",
  command:
    "- command: prompt; optional model, ragSetting (__websearch__/__none__/configured name), vaultTools (all/noSearch/none), mcpServers, enableThinking, attachments, saveTo, saveImageTo. saveImageTo requires an explicitly selected image-generation model.",
  "gemihub-command":
    "- gemihub-command: command encrypt/duplicate/convert-to-html/rename and path; optional text, metadata JSON, saveTo. convert-to-pdf is unavailable; publish/unpublish require the Web service.",
  http:
    "- http: url; method GET/POST/PUT/PATCH/DELETE; contentType json/form-data/text/binary; responseType auto/text/binary; headers, body, saveTo, saveStatus, throwOnError.",
  json:
    "- json: source is the bare variable name containing JSON; saveTo is required.",
  note:
    "- note: path and content; optional mode overwrite/append/create, confirm (true by default), history.",
  "note-read": "- note-read: path and saveTo are required.",
  "note-search":
    "- note-search: query and saveTo; optional searchContent and limit.",
  "note-list":
    "- note-list: saveTo; optional folder, recursive, tags, tagMatch, createdWithin, modifiedWithin, sortBy, sortOrder, limit.",
  "folder-list":
    "- folder-list: saveTo; optional folder. Returns folders and count.",
  "note-delete":
    "- note-delete: path; optional confirm (true by default). Moves the file to the application Trash.",
  "drive-delete": "- drive-delete: compatibility alias for note-delete.",
  open:
    "- open: path is required and opens the file in the current workspace widget.",
  dialog:
    "- dialog: title, message, markdown, options, multiSelect, inputTitle, multiline, defaults JSON, button1, button2, saveTo.",
  "prompt-value":
    "- prompt-value: saveTo; optional title, message, default and multiline. Headless runs require default.",
  "prompt-file":
    "- prompt-file: saveTo; optional title, default, forcePrompt, saveFileTo. Hotkey/event runs automatically use their active file.",
  "prompt-selection":
    "- prompt-selection: saveTo; optional saveSelectionTo. Hotkey/event runs automatically use selection or full file content.",
  workflow:
    "- workflow: path; optional input/output mappings, prefix and saveTo. Without output, all child variables are copied.",
  "rag-sync":
    "- rag-sync: retained for compatibility; server RAG sync is unsupported and the result directs users to local RAG.",
  "file-explorer":
    "- file-explorer: mode select/create, path or default, title, extensions, saveTo (FileExplorerData), savePathTo.",
  "file-save":
    "- file-save: source FileExplorerData and path; optional confirm and savePathTo. Adds the source extension when needed.",
  mcp:
    "- mcp: HTTP url and tool; optional args JSON, headers JSON, saveTo, saveUiTo. MCP App UI can be reopened from history.",
  sleep: "- sleep: duration in milliseconds.",
  script:
    "- script: code; optional timeout and saveTo. Runs without DOM, network or storage.",
  shell:
    "- shell: command; optional args JSON array, cwd, env JSON object, timeout, throwOnError, saveTo, saveStderrTo, saveExitCodeTo.",
};

function requestedNodeTypes(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string")
      .map((value) => value.trim()).filter(Boolean);
  }
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string =>
        typeof value === "string"
      );
    }
  } catch { /* accept loose model output */ }
  return raw.trim().split(/[,\s]+/).filter(Boolean);
}

export function getWorkflowNodeSpec(
  rawNodeTypes?: unknown,
  context?: {
    models?: string[];
    ragSettings?: string[];
    mcpServers?: string[];
  },
): string {
  const requested = requestedNodeTypes(rawNodeTypes);
  if (!requested.length) {
    return buildWorkflowGenerationSpec(context);
  }
  const contextLines = buildWorkflowGenerationSpec(context).split(
    "\n\nRuntime configuration:\n",
  )[1] ?? "";
  const sections = requested.map((name) =>
    workflowNodeDocumentation[name as WorkflowNodeType] ??
      `- ${name}: unknown node type; verify the name against the full workflow specification.`
  );
  return [
    "Workspace workflow nodes use unique id/type fields. Normal nodes use next; if/while use trueNext and falseNext. Variables use {{name}} and nested paths such as {{items[index].path}}.",
    ...sections,
    contextLines,
  ].filter(Boolean).join("\n\n");
}

export function documentedWorkflowNodeTypes(): string[] {
  return workflowNodeTypes.filter((type) => !!workflowNodeDocumentation[type]);
}
