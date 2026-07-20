import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import { chat, readWorkspaceFile as readFile, writeWorkspaceFile as writeFile } from "../lib/wailsBackend";
import {
  chatModelChoices,
  type ChatProvider,
  type ChatSettings,
  configuredChatProviders,
  providerDefaults,
  settingsForModel,
  switchChatProvider,
} from "../llm/settings";
import { computeWorkflowLineDiff } from "../workflow/diff";
import { parseWorkflowFile } from "../workflow/parser";
import { workflowGenerationSpec } from "../workflow/workflowSpec";
import { parseWorkspaceSkill, type WorkspaceSkill } from "./skills";

const workflowContentSpec = workflowGenerationSpec.slice(
  workflowGenerationSpec.indexOf("Top-level"),
);

export interface SkillAIFile {
  path: string;
  content: string;
}

export interface SkillAIChangeSet {
  summary: string;
  files: SkillAIFile[];
}

function jsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((
    match,
  ) => match[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  return [
    trimmed,
    ...fenced,
    first >= 0 && last > first ? trimmed.slice(first, last + 1) : "",
  ].filter(Boolean);
}

export function parseSkillAIChangeSet(
  text: string,
  allowedPaths: string[],
): SkillAIChangeSet {
  let parsed: unknown;
  for (const candidate of jsonCandidates(text)) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // Providers sometimes wrap the JSON in prose or a fence.
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response did not contain a valid JSON change set.");
  }
  const value = parsed as Record<string, unknown>;
  if (!Array.isArray(value.files)) {
    throw new Error("AI change set is missing files.");
  }
  const allowed = new Set(allowedPaths);
  const seen = new Set<string>();
  const files = value.files.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("AI change set contains an invalid file entry.");
    }
    const file = entry as Record<string, unknown>;
    if (typeof file.path !== "string" || !allowed.has(file.path)) {
      throw new Error(
        `AI attempted to change an unexpected path: ${
          String(file.path || "(missing)")
        }`,
      );
    }
    if (seen.has(file.path)) {
      throw new Error(`AI returned the same path more than once: ${file.path}`);
    }
    if (typeof file.content !== "string" || !file.content.trim()) {
      throw new Error(`AI returned empty content for ${file.path}.`);
    }
    seen.add(file.path);
    return { path: file.path, content: file.content };
  });
  const missing = allowedPaths.filter((path) => !seen.has(path));
  if (missing.length) {
    throw new Error(`AI omitted required files: ${missing.join(", ")}`);
  }
  return {
    summary: typeof value.summary === "string" ? value.summary.trim() : "",
    files,
  };
}

export function buildModifySkillPrompt(
  skill: WorkspaceSkill,
  files: SkillAIFile[],
  request: string,
  previous?: SkillAIChangeSet,
  feedback = "",
): string {
  const source = files.map((file) =>
    `--- BEGIN FILE: ${file.path} ---\n${file.content}\n--- END FILE ---`
  ).join("\n\n");
  const prior = previous
    ? `\n\nPrevious proposal:\n${JSON.stringify(previous)}`
    : "";
  return `Modify the Agent Skill "${skill.name}" according to this request:\n${request.trim()}\n\nThe Skill definition and every related Workflow must remain mutually consistent. Preserve paths and unrelated behavior. Return every supplied file, including unchanged files. Do not create, rename, or delete files.\n\nCurrent files:\n${source}${prior}${
    feedback.trim() ? `\n\nRefinement feedback:\n${feedback.trim()}` : ""
  }`;
}

async function loadSkillFiles(skill: WorkspaceSkill): Promise<SkillAIFile[]> {
  const paths = [
    skill.skillFilePath,
    ...skill.workflows.map((workflow) =>
      `${skill.folderPath}/${workflow.path}`
    ),
  ];
  return await Promise.all(paths.map(async (path) => {
    const file = await readFile(path);
    if (!file) throw new Error(`Skill file was not found: ${path}`);
    return { path, content: file.content };
  }));
}

function validateChangeSet(
  skill: WorkspaceSkill,
  changeSet: SkillAIChangeSet,
): void {
  const skillFile = changeSet.files.find((file) =>
    file.path === skill.skillFilePath
  );
  const parsedSkill = skillFile
    ? parseWorkspaceSkill(skill.skillFilePath, skillFile.content)
    : null;
  if (!parsedSkill) throw new Error("The proposed SKILL.md is invalid.");
  const expectedWorkflows = skill.workflows.map((workflow) => workflow.path)
    .sort();
  const proposedWorkflows = parsedSkill.workflows.map((workflow) =>
    workflow.path
  ).sort();
  if (
    expectedWorkflows.length !== proposedWorkflows.length ||
    expectedWorkflows.some((path, index) => path !== proposedWorkflows[index])
  ) {
    throw new Error(
      "The proposed SKILL.md changed the related Workflow paths. This editor only modifies existing Skill files.",
    );
  }
  for (const workflow of skill.workflows) {
    const path = `${skill.folderPath}/${workflow.path}`;
    const file = changeSet.files.find((entry) => entry.path === path);
    if (!file) throw new Error(`The proposed change is missing ${path}.`);
    try {
      parseWorkflowFile(file.content, path);
    } catch (error) {
      throw new Error(
        `${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function ModifySkillWithAIModal(
  { skill, settings, onApplied, onClose }: {
    skill: WorkspaceSkill;
    settings: ChatSettings;
    onApplied: () => Promise<void> | void;
    onClose: () => void;
  },
) {
  const [phase, setPhase] = useState<
    "loading" | "input" | "generating" | "review" | "applying"
  >("loading");
  const [files, setFiles] = useState<SkillAIFile[]>([]);
  const [request, setRequest] = useState("");
  const [feedback, setFeedback] = useState("");
  const [proposal, setProposal] = useState<SkillAIChangeSet | null>(null);
  const [provider, setProvider] = useState<ChatProvider>(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [error, setError] = useState("");
  const configured = configuredChatProviders(settings);

  useEffect(() => {
    void loadSkillFiles(skill).then((loaded) => {
      setFiles(loaded);
      setPhase("input");
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase("input");
    });
  }, [skill]);

  const changes = useMemo(() =>
    proposal?.files.map((after) => {
      const before = files.find((file) => file.path === after.path)?.content ??
        "";
      return {
        path: after.path,
        before,
        after: after.content,
        lines: computeWorkflowLineDiff(before, after.content),
      };
    }).filter((change) => change.before !== change.after) ?? [], [
    files,
    proposal,
  ]);

  const generate = async (refine = false) => {
    setPhase("generating");
    setError("");
    try {
      const resolved = settingsForModel(
        provider === settings.provider
          ? settings
          : switchChatProvider(settings, provider),
        model,
      );
      const allowedPaths = files.map((file) => file.path);
      const result = await chat({
        provider: resolved.provider,
        endpoint: resolved.endpoint,
        apiKey: resolved.apiKey,
        localFramework: resolved.localFramework,
        localUsername: resolved.localUsername,
        localPassword: resolved.localPassword,
        model: resolved.provider === "cli" ? "" : resolved.model,
        vertexProjectId: resolved.vertexProjectId,
        vertexLocation: resolved.vertexLocation,
        systemPrompt:
          `You modify an existing Agent Skill and its related Workflows as one coherent change set. Return one JSON object only, with no Markdown fence or prose. Schema: {"summary":"short explanation","files":[{"path":"exact supplied path","content":"complete file content"}]}. Every supplied path must occur exactly once; no other path is allowed. Validate all workflow nodes and connections. Workflow file contents use the following specification:\n\n${workflowContentSpec}`,
        messages: [{
          role: "user",
          content: buildModifySkillPrompt(
            skill,
            files,
            request,
            refine ? proposal ?? undefined : undefined,
            refine ? feedback : "",
          ),
        }],
        enableFileTools: false,
        fileToolMode: "none",
        cliType: resolved.cliType,
        cliPath: resolved.cliPaths[resolved.cliType],
        cliSessionId: "",
        enableThinking: true,
      });
      const next = parseSkillAIChangeSet(result.content, allowedPaths);
      validateChangeSet(skill, next);
      if (
        next.files.every((file) =>
          file.content ===
            files.find((source) => source.path === file.path)?.content
        )
      ) throw new Error("AI did not propose any changes.");
      setProposal(next);
      setFeedback("");
      setPhase("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase(proposal ? "review" : "input");
    }
  };

  const apply = async () => {
    if (!proposal || !changes.length) return;
    setPhase("applying");
    setError("");
    const applied: SkillAIFile[] = [];
    try {
      for (const original of files) {
        const current = await readFile(original.path);
        if (!current || current.content !== original.content) {
          throw new Error(
            `${original.path} changed after generation. Reload and generate the change again.`,
          );
        }
      }
      const ordered = [...changes].sort((left, right) =>
        Number(left.path === skill.skillFilePath) -
        Number(right.path === skill.skillFilePath)
      );
      for (const change of ordered) {
        await writeFile(change.path, change.after);
        applied.push({ path: change.path, content: change.before });
      }
      window.dispatchEvent(new Event("llm-hub:file-tree-refresh"));
      await onApplied();
      onClose();
    } catch (caught) {
      for (const original of applied.reverse()) {
        await writeFile(original.path, original.content).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase("review");
    }
  };

  const busy = phase === "loading" || phase === "generating" ||
    phase === "applying";
  return (
    <div className="workflow-modal-backdrop">
      <section className="ai-workflow-builder modify-skill-ai">
        <header>
          <div>
            <Sparkles size={18} />
            <strong>Modify Skill with AI</strong>
          </div>
          {!busy && (
            <button type="button" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </header>
        {phase === "loading" && (
          <div className="ai-workflow-progress">
            <RefreshCw className="spin" size={22} />
            <strong>Loading Skill files…</strong>
          </div>
        )}
        {phase === "input" && (
          <div className="ai-workflow-input">
            <section className="modify-skill-ai-summary">
              <strong>{skill.name}</strong>
              <span>
                {files.length} files · {skill.workflows.length}{" "}
                related Workflows
              </span>
            </section>
            <div className="ai-workflow-row">
              <label>
                <span>Provider</span>
                <select
                  value={provider}
                  onChange={(event) => {
                    const next = event.target.value as ChatProvider;
                    setProvider(next);
                    setModel(providerDefaults(next).model);
                  }}
                >
                  {configured.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Model</span>
                <select
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                >
                  {[
                    ...new Set([
                      model,
                      ...(provider === "cli" ? [] : [
                        ...settings.modelProfiles.filter((item) =>
                          item.provider === provider && item.enabled
                        ).flatMap((item) => item.enabledModels),
                        ...chatModelChoices[provider],
                      ]),
                    ]),
                  ].filter(Boolean).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span>Requested change</span>
              <textarea
                rows={7}
                value={request}
                onChange={(event) => setRequest(event.target.value)}
                placeholder="Describe how the Skill and its Workflows should change…"
              />
            </label>
            <details>
              <summary>Files included in this change</summary>
              <ul>
                {files.map((file) => (
                  <li key={file.path}>
                    <code>{file.path}</code>
                  </li>
                ))}
              </ul>
            </details>
            <footer>
              <button type="button" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="primary"
                disabled={!request.trim() || !files.length ||
                  !configured.includes(provider)}
                onClick={() => void generate()}
              >
                <Sparkles size={13} />Generate changes
              </button>
            </footer>
          </div>
        )}
        {phase === "generating" && (
          <div className="ai-workflow-progress">
            <RefreshCw className="spin" size={22} />
            <strong>Updating and validating the Skill bundle…</strong>
            <small>
              SKILL.md and all related Workflows are reviewed together.
            </small>
          </div>
        )}
        {(phase === "review" || phase === "applying") && proposal && (
          <div className="ai-workflow-result">
            <section className="pass">
              <strong>Locally validated</strong>
              <p>
                {proposal.summary || `${changes.length} files contain changes.`}
              </p>
            </section>
            <div className="modify-skill-file-diffs">
              {changes.map((change) => (
                <details key={change.path} open>
                  <summary>
                    <code>{change.path}</code>
                    <span>
                      {change.lines.filter((line) => line.type === "added")
                        .length} additions · {change.lines.filter((line) =>
                          line.type === "removed"
                        ).length} deletions
                    </span>
                  </summary>
                  <div className="workflow-confirm-diff">
                    {change.lines.map((line, index) => (
                      <div
                        className={line.type}
                        key={`${line.oldLine ?? ""}:${
                          line.newLine ?? ""
                        }:${index}`}
                      >
                        <span>{line.oldLine ?? ""}</span>
                        <span>{line.newLine ?? ""}</span>
                        <b>
                          {line.type === "added"
                            ? "+"
                            : line.type === "removed"
                            ? "−"
                            : ""}
                        </b>
                        <code>{line.content || " "}</code>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            <label>
              <span>Refinement feedback</span>
              <textarea
                rows={3}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Optional: describe what the AI should adjust…"
              />
            </label>
            <footer>
              <button
                type="button"
                disabled={phase === "applying"}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={phase === "applying" || !feedback.trim()}
                onClick={() => void generate(true)}
              >
                Refine
              </button>
              <button
                type="button"
                className="primary"
                disabled={phase === "applying" || !changes.length}
                onClick={() => void apply()}
              >
                {phase === "applying"
                  ? <RefreshCw className="spin" size={13} />
                  : <Check size={13} />}Apply {changes.length} changed files
              </button>
            </footer>
          </div>
        )}
        {error && <div className="workflow-error">{error}</div>}
      </section>
    </div>
  );
}
