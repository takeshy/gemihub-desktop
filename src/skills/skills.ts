import yaml from "js-yaml";
import { listProjectFiles, readProjectFile, writeFile, type ChatToolDefinition } from "../lib/wailsBackend";
import { getBuiltinSkillMetadata, isBuiltinSkillPath, loadBuiltinSkill } from "./builtinSkills";
import { findWorkflowBlocks } from "../workflow/parser";

export interface SkillWorkflowRef {
  path: string;
  description: string;
  inputVariables?: string[];
}

export interface WorkspaceSkill {
  name: string;
  description: string;
  folderPath: string;
  skillFilePath: string;
  instructions: string;
  references: string[];
  workflows: SkillWorkflowRef[];
  builtin?: boolean;
}

export interface SkillWorkflowEntry {
  id: string;
  skill: WorkspaceSkill;
  workflow: SkillWorkflowRef;
  workflowPath: string;
}

const capabilitiesFence = /^```skill-capabilities[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m;

export function extractSkillCapabilities(body: string): Record<string, unknown> | null {
  const match = body.match(capabilitiesFence);
  if (!match) return null;
  try {
    const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function stripSkillCapabilities(body: string): string {
  return body.replace(capabilitiesFence, "").trim();
}

export function buildSkillMarkdown(name: string, description: string, instructions: string, workflow: SkillWorkflowRef): string {
  const frontmatter = yaml.dump({ name, description }, { lineWidth: -1, noRefs: true }).trimEnd();
  const capabilities = yaml.dump({ workflows: [workflow] }, { lineWidth: -1, noRefs: true }).trimEnd();
  return `---\n${frontmatter}\n---\n\n\`\`\`skill-capabilities\n${capabilities}\n\`\`\`\n\n${stripSkillCapabilities(instructions)}\n`;
}

export function deriveWorkflowInputVariables(workflowMarkdown: string): string[] {
  const initialized = new Set<string>();
  const referenced = new Set<string>();
  const definition = findWorkflowBlocks(workflowMarkdown)[0];
  if (!definition || definition.error) return [];
  const data: unknown = definition.data;
  const root = data && typeof data === "object" && !Array.isArray(data) && "workflow" in data ? (data as Record<string, unknown>).workflow : data;
  const nodes = root && typeof root === "object" && !Array.isArray(root) && Array.isArray((root as Record<string, unknown>).nodes) ? (root as Record<string, unknown>).nodes as Array<Record<string, unknown>> : [];
  for (const node of nodes) {
    if ((node.type === "variable" || node.type === "set") && typeof node.name === "string") initialized.add(node.name);
    for (const key of ["saveTo", "saveStatus", "saveFileTo", "savePathTo", "saveImageTo", "saveSelectionTo", "saveStderrTo", "saveExitCodeTo", "saveUiTo"]) if (typeof node[key] === "string") initialized.add(node[key] as string);
    for (const value of Object.values(node)) if (typeof value === "string") for (const match of value.matchAll(/\{\{([\w]+)(?:[.\[]|(?::json)?\}\})/g)) referenced.add(match[1]);
  }
  return [...referenced].filter((name) => !initialized.has(name) && !name.startsWith("_")).sort();
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  try {
    const parsed = yaml.load(match[1], { schema: yaml.JSON_SCHEMA });
    return { frontmatter: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}, body: match[2] };
  } catch {
    return { frontmatter: {}, body: match[2] };
  }
}

function writeSkillDocument(frontmatter: Record<string, unknown>, body: string): string {
  const header = yaml.dump(frontmatter, { lineWidth: -1, noRefs: true }).trimEnd();
  return `---\n${header}\n---\n\n${body.trim()}\n`;
}

function upsertSkillCapabilities(body: string, capabilities: Record<string, unknown>): string {
  const block = `\`\`\`skill-capabilities\n${yaml.dump(capabilities, { lineWidth: -1, noRefs: true }).trimEnd()}\n\`\`\``;
  return capabilitiesFence.test(body) ? body.replace(capabilitiesFence, block) : `${block}\n\n${body.trim()}`;
}

export function updateSkillWorkflowInputVariables(skillContent: string, workflowRelativePath: string, workflowMarkdown: string): string | null {
  const { frontmatter, body } = parseFrontmatter(skillContent);
  const fromBlock = extractSkillCapabilities(body);
  const legacy = Array.isArray(frontmatter.workflows) || Array.isArray(frontmatter.scripts) ? { workflows: frontmatter.workflows, scripts: frontmatter.scripts } : null;
  const capabilities = fromBlock ?? legacy;
  if (!capabilities || !Array.isArray(capabilities.workflows)) return null;
  const workflows = capabilities.workflows.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry));
  const target = workflows.findIndex((entry) => entry.path === workflowRelativePath);
  if (target < 0) return null;
  const inputs = deriveWorkflowInputVariables(workflowMarkdown);
  const existing = Array.isArray(workflows[target].inputVariables) ? workflows[target].inputVariables?.filter((value): value is string => typeof value === "string") : [];
  if (fromBlock && existing.length === inputs.length && existing.every((value, index) => value === inputs[index])) return null;
  const updated = { ...workflows[target] };
  if (inputs.length) updated.inputVariables = inputs; else delete updated.inputVariables;
  const nextCapabilities = { ...capabilities, workflows: workflows.map((entry, index) => index === target ? updated : entry) };
  const nextFrontmatter = { ...frontmatter };
  delete nextFrontmatter.workflows;
  delete nextFrontmatter.scripts;
  return writeSkillDocument(nextFrontmatter, upsertSkillCapabilities(body, nextCapabilities));
}

export async function syncSkillWorkflowInputVariables(workflowPath: string, workflowMarkdown: string): Promise<{ path: string; content: string } | null> {
  if (!/^skills\/[^/]+\//i.test(workflowPath)) return null;
  const segments = workflowPath.split("/");
  const skillRoot = segments.slice(0, 2).join("/");
  const skillPath = `${skillRoot}/SKILL.md`;
  const relativePath = workflowPath === skillPath ? "SKILL.md" : segments.slice(2).join("/");
  const skillFile = workflowPath === skillPath ? { content: workflowMarkdown } : await readProjectFile(skillPath);
  if (!skillFile) return null;
  const updated = updateSkillWorkflowInputVariables(skillFile.content, relativePath, workflowMarkdown);
  if (!updated) return null;
  await writeFile(skillPath, updated);
  return { path: skillPath, content: updated };
}

function safeSkillRelativePath(path: string): boolean {
  return !!path && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..");
}

export function parseWorkspaceSkill(skillFilePath: string, content: string): WorkspaceSkill | null {
  const match = skillFilePath.match(/^(skills\/[^/]+)\/SKILL\.md$/i);
  if (!match) return null;
  const folderPath = match[1];
  const folderName = folderPath.split("/").pop() || "skill";
  const { frontmatter, body } = parseFrontmatter(content);
  const capabilities = extractSkillCapabilities(body) ?? frontmatter;
  const rawWorkflows = Array.isArray(capabilities.workflows) ? capabilities.workflows : [];
  const workflows: SkillWorkflowRef[] = [];
  for (const item of rawWorkflows) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    if (typeof value.path !== "string" || !safeSkillRelativePath(value.path)) continue;
    workflows.push({
      path: value.path,
      description: typeof value.description === "string" ? value.description : value.path,
      inputVariables: Array.isArray(value.inputVariables) ? value.inputVariables.filter((entry): entry is string => typeof entry === "string") : undefined,
    });
  }
  return {
    name: typeof frontmatter.name === "string" && frontmatter.name.trim() ? frontmatter.name.trim() : folderName,
    description: typeof frontmatter.description === "string" ? frontmatter.description : "",
    folderPath,
    skillFilePath,
    instructions: body,
    references: [],
    workflows,
    builtin: false,
  };
}

export async function discoverWorkspaceSkills(): Promise<WorkspaceSkill[]> {
  const paths = (await listProjectFiles()).map((entry) => entry.path).filter((path) => /^skills\/[^/]+\/SKILL\.md$/i.test(path));
  const loaded = await Promise.all(paths.map(async (path) => {
    const file = await readProjectFile(path);
    return file ? parseWorkspaceSkill(path, file.content) : null;
  }));
  return [...getBuiltinSkillMetadata(), ...loaded.filter((skill): skill is WorkspaceSkill => skill !== null)]
    .sort((left, right) => Number(right.builtin) - Number(left.builtin) || left.name.localeCompare(right.name));
}

/** Load the selected skills' complete prompt content and reference files. */
export async function loadActiveSkillContents(skills: WorkspaceSkill[]): Promise<WorkspaceSkill[]> {
  const inventory = await listProjectFiles();
  return await Promise.all(skills.map(async (skill) => {
    if (isBuiltinSkillPath(skill.folderPath)) return loadBuiltinSkill(skill.folderPath) ?? skill;
    const prefix = `${skill.folderPath}/references/`.toLowerCase();
    const paths = inventory.filter((entry) => !entry.binary && entry.path.toLowerCase().startsWith(prefix)).map((entry) => entry.path).sort();
    const references = (await Promise.all(paths.map(async (path) => {
      const file = await readProjectFile(path);
      return file ? `[${path.slice(skill.folderPath.length + 1)}]\n${file.content}` : null;
    }))).filter((value): value is string => value !== null);
    return { ...skill, references };
  }));
}

export function collectSkillWorkflows(skills: WorkspaceSkill[]): Map<string, SkillWorkflowEntry> {
  const entries = new Map<string, SkillWorkflowEntry>();
  for (const skill of skills) for (const workflow of skill.workflows) {
    const base = workflow.path.replace(/\.workflow\.ya?ml$/i, "").replace(/\.(?:md|ya?ml|workflow)$/i, "").replaceAll("/", "_");
    const id = `${skill.name}/${base}`;
    entries.set(id, { id, skill, workflow, workflowPath: `${skill.folderPath}/${workflow.path}` });
  }
  return entries;
}

export function skillWorkflowTool(skills: WorkspaceSkill[]): ChatToolDefinition[] {
  if (![...collectSkillWorkflows(skills).keys()].length) return [];
  return [{
    name: "run_skill_workflow",
    description: "Run a workflow provided by an active workspace skill. Use the workflow ID and input variables declared in the active skill instructions. If execution fails, do not retry automatically; report the error to the user.",
    parameters: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "Workflow ID in the form skillName/workflow_path" },
        variables: { type: "string", description: "JSON object containing the workflow input variables" },
      },
      required: ["workflowId"],
    },
  }];
}

export function buildSkillSystemPrompt(skills: WorkspaceSkill[]): string {
  if (!skills.length) return "";
  const sections = skills.map((skill) => {
    const workflows = [...collectSkillWorkflows([skill]).values()].map((entry) => `- ${entry.id}: ${entry.workflow.description}; inputs: ${(entry.workflow.inputVariables ?? []).join(", ") || "none"}`).join("\n");
    const references = skill.references.length ? `\n\n### References\n\n${skill.references.join("\n\n")}` : "";
    return `## Active skill: ${skill.name}\n${skill.description}\n${skill.builtin ? "Built in" : `Source: ${skill.skillFilePath}`}\n\n${skill.instructions.trim()}${references}${workflows ? `\n\n### Available workflows\nUse run_skill_workflow to execute these workflows:\n${workflows}` : ""}`;
  });
  const protocol = skills.some((skill) => skill.workflows.length) ? `\n\n## Skill Workflow Execution Protocol\nWhen multiple workflows are needed, plan their order, run them one at a time, inspect each result, then read modified files to verify correctness. Execute a single explicit workflow immediately. Do not retry a failed workflow automatically.` : "";
  return `\n\n# Active agent skills\nProactively follow the relevant skill instructions and references. Pass required inputs to run_skill_workflow as a JSON string. Infer values from the request when possible and ask only when a required value cannot be inferred.${protocol}\n\n${sections.join("\n\n---\n\n")}`;
}
