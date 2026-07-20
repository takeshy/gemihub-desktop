import yaml from "js-yaml";
import {
  isWorkflowNodeType,
  normalizeWorkflowValue,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
} from "./types";
import { workflowNodeTypeForDesktop } from "./dialect";

export interface WorkflowBlock {
  name?: string;
  data: Record<string, unknown>;
  start: number;
  end: number;
  raw: string;
  format: "markdown" | "yaml";
  error?: string;
}

const blockPattern =
  /^(`{3,})(?:hub-workflow|workflow)[^\n]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/gm;

// Used only to distinguish trailing workflow properties from unindented block
// scalar content produced by an LLM. A backwards scan prevents JavaScript
// object keys such as `name:` or `path:` from being mistaken for YAML fields.
const workflowYamlKeys = new Set([
  "id",
  "type",
  "next",
  "trueNext",
  "falseNext",
  "name",
  "value",
  "comment",
  "saveTo",
  "timeout",
  "path",
  "mode",
  "condition",
  "code",
  "prompt",
  "content",
  "source",
  "title",
  "message",
  "enableThinking",
  "model",
  "attachments",
  "enableTools",
  "vaultTools",
  "mcpServers",
  "saveImageTo",
  "url",
  "method",
  "contentType",
  "responseType",
  "headers",
  "body",
  "saveStatus",
  "throwOnError",
  "folder",
  "recursive",
  "tags",
  "tagMatch",
  "createdWithin",
  "modifiedWithin",
  "sortBy",
  "sortOrder",
  "limit",
  "query",
  "searchContent",
  "confirm",
  "history",
  "options",
  "multiSelect",
  "markdown",
  "inputTitle",
  "multiline",
  "defaults",
  "button1",
  "button2",
  "default",
  "forcePrompt",
  "extensions",
  "savePathTo",
  "saveFileTo",
  "saveSelectionTo",
  "command",
  "input",
  "output",
  "prefix",
  "duration",
  "oldPath",
  "ragSetting",
  "args",
  "env",
  "cwd",
  "tool",
  "saveStderrTo",
  "saveExitCodeTo",
  "systemPrompt",
  "metadata",
  "text",
  "nodes",
]);

/** Normalize common external/LLM YAML mistakes before parsing. */
export function normalizeWorkflowYaml(yamlText: string): string {
  const text = yamlText.replace(/^(\s*)\* (?=\w[\w-]*:(\s|$))/gm, "$1- ");
  const lines = text.split("\n"), result: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const scalar = line.match(/^(\s*)\S.*:\s*[|>][+-]?\s*$/);
    if (!scalar) {
      result.push(line);
      index++;
      continue;
    }
    const keyIndent = scalar[1].length;
    result.push(line);
    index++;
    let first = index;
    while (first < lines.length && lines[first].trim() === "") first++;
    if (first >= lines.length) continue;
    const firstIndent = lines[first].search(/\S/);
    if (firstIndent < 0 || firstIndent > keyIndent) continue;
    const padding = " ".repeat(keyIndent + 2 - firstIndent);
    let nodeEnd = lines.length;
    for (let cursor = first; cursor < lines.length; cursor++) {
      if (
        lines[cursor].trim() && /^\s*-\s/.test(lines[cursor]) &&
        lines[cursor].search(/\S/) < keyIndent
      ) {
        nodeEnd = cursor;
        break;
      }
    }
    let contentEnd = nodeEnd;
    for (let cursor = nodeEnd - 1; cursor >= first; cursor--) {
      if (!lines[cursor].trim()) continue;
      if (lines[cursor].search(/\S/) === keyIndent) {
        const property = lines[cursor].match(/^\s*([\w-]+):(\s|$)/);
        if (property && workflowYamlKeys.has(property[1])) {
          contentEnd = cursor;
          continue;
        }
      }
      break;
    }
    while (index < first) result.push(lines[index++]);
    while (index < contentEnd) {
      result.push(lines[index].trim() ? padding + lines[index] : lines[index]);
      index++;
    }
  }
  return result.join("\n");
}

export function findWorkflowBlocks(markdown: string): WorkflowBlock[] {
  const blocks: WorkflowBlock[] = [];
  blockPattern.lastIndex = 0;
  for (
    let match = blockPattern.exec(markdown);
    match;
    match = blockPattern.exec(markdown)
  ) {
    let data: Record<string, unknown> = {};
    let error: string | undefined;
    try {
      const parsed = yaml.load(normalizeWorkflowYaml(match[2]), {
        schema: yaml.JSON_SCHEMA,
      });
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      } else error = "Workflow YAML must be an object.";
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    blocks.push({
      name: typeof data.name === "string" ? data.name : undefined,
      data,
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      format: "markdown",
      error,
    });
  }
  if (blocks.length === 0) {
    try {
      const parsed = yaml.load(normalizeWorkflowYaml(markdown), {
        schema: yaml.JSON_SCHEMA,
      });
      const data =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null;
      const root = data?.workflow && typeof data.workflow === "object" &&
          !Array.isArray(data.workflow)
        ? data.workflow as Record<string, unknown>
        : data;
      if (data && Array.isArray(root?.nodes)) {
        blocks.push({
          name: typeof root.name === "string" ? root.name : undefined,
          data,
          start: 0,
          end: markdown.length,
          raw: markdown,
          format: "yaml",
        });
      }
    } catch {
      // Non-workflow text is allowed here; path-aware callers surface malformed YAML.
    }
  }
  return blocks;
}

export function serializeWorkflowData(data: Record<string, unknown>): string {
  return `\`\`\`hub-workflow\n${
    yaml.dump(data, { lineWidth: -1, noRefs: true }).trimEnd()
  }\n\`\`\``;
}

export function serializeWorkflowYaml(data: Record<string, unknown>): string {
  return `${yaml.dump(data, { lineWidth: -1, noRefs: true }).trimEnd()}\n`;
}

export function isWorkflowFilePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return /(?:^|\/)workflows\/.*\.(?:workflow\.ya?ml|ya?ml|workflow)$/i.test(
    normalized,
  ) ||
    /\.workflow\.ya?ml$/i.test(normalized);
}

export function canonicalWorkflowPath(path: string): string {
  const trimmed = path.trim();
  if (/\.workflow\.ya?ml$/i.test(trimmed)) {
    return trimmed.replace(/\.workflow\.yml$/i, ".workflow.yaml");
  }
  return trimmed.replace(/\.(?:md|ya?ml|workflow)$/i, "") + ".workflow.yaml";
}

export function workflowNameFromFilePath(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.workflow\.ya?ml$/i, "").replace(
    /\.(?:md|ya?ml|workflow)$/i,
    "",
  ) || "Workflow";
}

export function workflowYamlFromContent(content: string): string {
  const definition = findWorkflowBlocks(content)[0];
  if (!definition || definition.error) {
    throw new Error(definition?.error || "Workflow definition was not found.");
  }
  return serializeWorkflowYaml(definition.data);
}

export function replaceWorkflowDefinition(
  source: string,
  replacement: string,
): string {
  const current = findWorkflowBlocks(source)[0];
  const next = findWorkflowBlocks(replacement)[0];
  if (!current || current.error) {
    throw new Error(
      current?.error || "Current workflow definition was not found.",
    );
  }
  if (!next || next.error) {
    throw new Error(
      next?.error || "Replacement workflow definition was not found.",
    );
  }
  const serialized = current.format === "yaml"
    ? serializeWorkflowYaml(next.data)
    : serializeWorkflowData(next.data);
  return source.slice(0, current.start) + serialized +
    source.slice(current.end);
}

export function parseWorkflowFile(content: string, path: string): Workflow {
  if (!isWorkflowFilePath(path)) {
    throw new Error(
      "Workflow files must use .workflow.yaml, .yaml, .yml, or .workflow under a workflows directory.",
    );
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(normalizeWorkflowYaml(content), {
      schema: yaml.JSON_SCHEMA,
    });
  } catch (caught) {
    throw new Error(caught instanceof Error ? caught.message : String(caught));
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Workflow YAML must be an object.");
  }
  return parseWorkflowFromMarkdown(
    serializeWorkflowData(parsed as Record<string, unknown>),
  );
}

export function parseWorkflowFromMarkdown(markdown: string): Workflow {
  const blocks = findWorkflowBlocks(markdown);
  if (blocks.length === 0) {
    throw new Error("Workflow code block was not found.");
  }
  if (blocks.length > 1) {
    throw new Error("Only one workflow code block is allowed per file.");
  }
  if (blocks[0].error) throw new Error(blocks[0].error);
  const root =
    blocks[0].data.workflow && typeof blocks[0].data.workflow === "object"
      ? blocks[0].data.workflow as Record<string, unknown>
      : blocks[0].data;
  if (!Array.isArray(root.nodes)) {
    throw new Error("Workflow nodes are missing.");
  }

  const workflow: Workflow = {
    name: typeof root.name === "string" ? root.name : blocks[0].name,
    nodes: new Map(),
    edges: [],
    startNode: null,
    options: typeof root.options === "object"
      ? root.options as Workflow["options"]
      : undefined,
  };
  const rawNodes = root.nodes as Array<Record<string, unknown>>;
  const terminalNodeIds = new Set(
    rawNodes.filter((raw) => raw?.type === "end").map((raw, index) =>
      normalizeWorkflowValue(raw.id) || `node-${index + 1}`
    ),
  );
  rawNodes.forEach((raw, index) => {
    const normalizedType = workflowNodeTypeForDesktop(raw?.type);
    if (
      !raw || typeof raw !== "object" || !isWorkflowNodeType(normalizedType)
    ) return;
    const id = normalizeWorkflowValue(raw.id) || `node-${index + 1}`;
    const properties: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (["id", "type", "next", "trueNext", "falseNext"].includes(key)) {
        continue;
      }
      const normalized = normalizeWorkflowValue(value);
      if (normalized !== "") properties[key] = normalized;
    }
    const node: WorkflowNode = { id, type: normalizedType, properties };
    workflow.nodes.set(id, node);
    workflow.startNode ??= id;
  });
  if (!workflow.startNode) throw new Error("Workflow has no valid nodes.");

  const ids = new Set(workflow.nodes.keys());
  const indexes = new Map<string, number>();
  rawNodes.forEach((raw, index) =>
    indexes.set(normalizeWorkflowValue(raw?.id) || `node-${index + 1}`, index)
  );
  const edge = (from: string, to: string, label?: WorkflowEdge["label"]) => {
    if (to === "end" || terminalNodeIds.has(to)) return;
    if (!ids.has(to)) {
      throw new Error(`Invalid edge reference: ${from} -> ${to}`);
    }
    const fromIndex = indexes.get(from), toIndex = indexes.get(to);
    if (
      fromIndex !== undefined && toIndex !== undefined &&
      toIndex <= fromIndex && workflow.nodes.get(to)?.type !== "while"
    ) {
      throw new Error(
        `Invalid back-reference: ${from} -> ${to}. Only while nodes can be loop targets.`,
      );
    }
    workflow.edges.push({ from, to, label });
  };
  rawNodes.forEach((raw, index) => {
    const id = normalizeWorkflowValue(raw?.id) || `node-${index + 1}`;
    const node = workflow.nodes.get(id);
    if (!node) return;
    if (node.type === "if" || node.type === "while") {
      const trueNext = normalizeWorkflowValue(raw.trueNext);
      const falseNext = normalizeWorkflowValue(raw.falseNext);
      if (!trueNext) {
        throw new Error(`${node.type} node ${id} is missing trueNext.`);
      }
      edge(id, trueNext, "true");
      if (falseNext) edge(id, falseNext, "false");
      else if (rawNodes[index + 1]) {
        edge(
          id,
          normalizeWorkflowValue(rawNodes[index + 1].id) || `node-${index + 2}`,
          "false",
        );
      }
    } else {
      const next = normalizeWorkflowValue(raw.next);
      if (next) edge(id, next);
      else if (rawNodes[index + 1]) {
        edge(
          id,
          normalizeWorkflowValue(rawNodes[index + 1].id) || `node-${index + 2}`,
        );
      }
    }
  });
  return workflow;
}

export function nextWorkflowNode(
  workflow: Workflow,
  nodeId: string,
  condition?: boolean,
): string | null {
  const node = workflow.nodes.get(nodeId);
  const outgoing = workflow.edges.filter((item) => item.from === nodeId);
  if (node?.type === "if" || node?.type === "while") {
    return outgoing.find((item) =>
      item.label === (condition ? "true" : "false")
    )?.to ?? null;
  }
  return outgoing[0]?.to ?? null;
}
