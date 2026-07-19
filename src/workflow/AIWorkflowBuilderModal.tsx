import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import {
  chat,
  type ChatAttachment,
  type ChatUsage,
  onChatStream,
  readWorkspaceFile as readFile,
} from "../lib/wailsBackend";
import {
  chatModelChoices,
  type ChatProvider,
  type ChatSettings,
  configuredChatProviders,
  providerDefaults,
  settingsForModel,
  switchChatProvider,
} from "../llm/settings";
import {
  findWorkflowBlocks,
  parseWorkflowFromMarkdown,
  serializeWorkflowData,
} from "./parser";
import type { WorkflowRun } from "./types";
import { workflowGenerationSpec } from "./workflowSpec";
import yaml from "js-yaml";

type Phase =
  | "input"
  | "external"
  | "planning"
  | "plan-review"
  | "generating"
  | "reviewing"
  | "result";
interface ReviewIssue {
  severity?: string;
  nodeId?: string;
  message?: string;
  suggestion?: string;
}
interface ReviewResult {
  verdict: "pass" | "fail";
  summary: string;
  issues: ReviewIssue[];
}

function extractSkillInstructions(text: string): string {
  return text.match(/```skill-instructions\s*\r?\n([\s\S]*?)\r?\n```/i)?.[1]
    .trim() || "";
}

export function parseReviewResponse(text: string): ReviewResult | null {
  const trimmed = text.trim();
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((
    match,
  ) => match[1].trim());
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidates = [
    trimmed,
    ...fenced,
    firstBrace >= 0 && lastBrace > firstBrace
      ? trimmed.slice(firstBrace, lastBrace + 1)
      : "",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as Partial<ReviewResult>;
      if (value.verdict !== "pass" && value.verdict !== "fail") continue;
      return {
        verdict: value.verdict,
        summary: typeof value.summary === "string" && value.summary.trim()
          ? value.summary.trim()
          : value.verdict === "pass"
          ? "Review passed."
          : "Review found issues.",
        issues: Array.isArray(value.issues)
          ? value.issues.filter((issue): issue is ReviewIssue =>
            !!issue && typeof issue.message === "string"
          )
          : [],
      };
    } catch {
      // Try the next possible JSON section. Some providers wrap JSON in prose.
    }
  }
  return null;
}

function mergeUsage(
  total: ChatUsage | undefined,
  next: ChatUsage | undefined,
): ChatUsage | undefined {
  if (!next) return total;
  return {
    inputTokens: (total?.inputTokens || 0) + (next.inputTokens || 0),
    outputTokens: (total?.outputTokens || 0) + (next.outputTokens || 0),
    thinkingTokens: (total?.thinkingTokens || 0) + (next.thinkingTokens || 0),
    totalTokens: (total?.totalTokens || 0) + (next.totalTokens || 0),
    cachedTokens: (total?.cachedTokens || 0) + (next.cachedTokens || 0),
  };
}

function withoutFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

export function outputPathForArtifactName(
  kind: "skill" | "workflow",
  name: string,
): string {
  const fallback = kind === "skill" ? "new-skill" : "new-workflow";
  const slug = name
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[-._]+|[-._]+$/g, "") || fallback;
  return kind === "skill"
    ? `skills/${slug}`
    : `workflows/${slug}.workflow.yaml`;
}

export function AIWorkflowBuilderModal({
  mode,
  artifactKind = "workflow",
  currentMarkdown,
  currentPath,
  currentName,
  activeFile,
  settings,
  history,
  additionalInstructions = "",
  onApply,
  onClose,
}: {
  mode: "create" | "modify";
  artifactKind?: "workflow" | "skill";
  currentMarkdown: string;
  currentPath: string;
  currentName?: string;
  activeFile?: { path: string; content: string } | null;
  settings: ChatSettings;
  history: WorkflowRun[];
  additionalInstructions?: string;
  onApply: (
    result: {
      block: string;
      path: string;
      name: string;
      request: string;
      skillInstructions?: string;
    },
  ) => Promise<void>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("input");
  const [provider, setProvider] = useState<ChatProvider>(settings.provider);
  const [model, setModel] = useState(settings.model);
  const [name, setName] = useState(
    mode === "modify"
      ? currentName || currentPath.split("/").pop()?.replace(/\.md$/i, "") ||
        "Workflow"
      : artifactKind === "skill"
      ? "New Skill"
      : "New Workflow",
  );
  const [path, setPath] = useState(
    mode === "modify"
      ? currentPath
      : artifactKind === "skill"
      ? "skills/new-skill"
      : "workflows/new-workflow.workflow.yaml",
  );
  const [request, setRequest] = useState("");
  const [plan, setPlan] = useState("");
  const [planFeedback, setPlanFeedback] = useState("");
  const [generatedBlock, setGeneratedBlock] = useState("");
  const [skillInstructions, setSkillInstructions] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [externalResponse, setExternalResponse] = useState("");
  const [attachmentPaths, setAttachmentPaths] = useState("");
  const [acceptReviewIssues, setAcceptReviewIssues] = useState(false);
  const [thinking, setThinking] = useState("");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<ChatUsage>();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [selectedSteps, setSelectedSteps] = useState<Record<string, string[]>>(
    {},
  );
  const streamRef = useRef("");
  const configured = configuredChatProviders(settings);
  const relevantHistory = useMemo(
    () =>
      history.filter((run) => !currentPath || run.workflowPath === currentPath)
        .slice(0, 10),
    [currentPath, history],
  );
  const externalPrompt = useMemo(
    () =>
      `Create the ${artifactKind} named "${name}" for this request:\n${request}\n${
        additionalInstructions
          ? `\nAdditional requirements:\n${additionalInstructions}\n`
          : ""
      }\n${
        mode === "modify"
          ? `Current ${artifactKind}:\n${currentMarkdown}\n\n`
          : ""
      }${
        artifactKind === "skill"
          ? "Return a skill-instructions fenced Markdown block followed by "
          : "Return "
      }one complete hub-workflow fenced block.\n\n${workflowGenerationSpec}`,
    [
      additionalInstructions,
      artifactKind,
      currentMarkdown,
      mode,
      name,
      request,
    ],
  );

  useEffect(() =>
    onChatStream((event) => {
      if (event.streamId !== streamRef.current) return;
      if (event.type === "thinking" && event.delta) {
        setThinking((value) => value + event.delta);
      }
      if (event.type === "text" && event.delta) {
        setStreamText((value) => value + event.delta);
      }
    }), []);

  useEffect(() => {
    if (mode === "create") {
      setPath(outputPathForArtifactName(artifactKind, name));
    }
  }, [artifactKind, mode, name]);

  const providerSettings = () => {
    const resolved = provider === settings.provider
      ? settings
      : switchChatProvider(settings, provider);
    return settingsForModel(resolved, model);
  };
  const call = async (
    systemPrompt: string,
    userPrompt: string,
    attachments: ChatAttachment[] = [],
  ) => {
    const resolved = providerSettings(),
      streamId = crypto.randomUUID(),
      started = performance.now();
    streamRef.current = streamId;
    setThinking("");
    setStreamText("");
    setError("");
    // Workflow authoring/review always enables reasoning, matching the source
    // workflow generator independently of the normal chat toggle.
    const result = await chat({
      provider: resolved.provider,
      endpoint: resolved.endpoint,
      apiKey: resolved.apiKey,
      model: resolved.provider === "cli" ? "" : resolved.model,
      vertexProjectId: resolved.vertexProjectId,
      vertexLocation: resolved.vertexLocation,
      systemPrompt,
      messages: [{
        role: "user",
        content: userPrompt,
        attachments: attachments.length ? attachments : undefined,
      }],
      enableFileTools: false,
      fileToolMode: "none",
      cliType: resolved.cliType,
      cliPath: resolved.cliPaths[resolved.cliType],
      cliSessionId: "",
      streamId,
      enableThinking: true,
    });
    setUsage((value) => mergeUsage(value, result.usage));
    setElapsedMs((value) => value + Math.round(performance.now() - started));
    streamRef.current = "";
    return result.content;
  };

  const historyContext = () =>
    selectedRuns.map((id) => relevantHistory.find((run) => run.id === id))
      .filter(Boolean).map((run) => {
        const keys = new Set(selectedSteps[run!.id] ?? []);
        const logs = run!.logs.filter((log, index) =>
          log.status !== "info" && keys.has(`${log.nodeId}:${index}`)
        );
        return `Run ${run!.startTime} (${run!.status})\n${
          logs.map((log) =>
            `${log.nodeId}/${log.nodeType}: ${log.status} ${log.message}\nInput: ${
              JSON.stringify(log.input)
            }\nOutput: ${JSON.stringify(log.output)}${
              log.usage ? `\nUsage: ${JSON.stringify(log.usage)}` : ""
            }`
          ).join("\n")
        }`;
      }).join("\n\n");

  const toggleHistoryRun = (run: WorkflowRun, checked: boolean) => {
    setSelectedRuns((items) =>
      checked
        ? [...new Set([...items, run.id])]
        : items.filter((id) => id !== run.id)
    );
    setSelectedSteps((current) => {
      const next = { ...current };
      if (checked) {
        next[run.id] = run.logs.map((log, index) => ({ log, index })).filter((
          { log },
        ) => log.status !== "info").map(({ log, index }) =>
          `${log.nodeId}:${index}`
        );
      } else delete next[run.id];
      return next;
    });
  };

  const toggleHistoryStep = (
    run: WorkflowRun,
    key: string,
    checked: boolean,
  ) => {
    setSelectedSteps((current) => ({
      ...current,
      [run.id]: checked
        ? [...new Set([...(current[run.id] ?? []), key])]
        : (current[run.id] ?? []).filter((value) => value !== key),
    }));
  };

  const referenceInputs = async () => {
    const references = new Map<string, string>();
    const attachments: ChatAttachment[] = [];
    if (activeFile && /@\{(?:selection|content)\}/.test(request)) {
      references.set(activeFile.path, activeFile.content);
    }
    const paths = new Set(
      [...request.matchAll(/@([\w./-]+\.[A-Za-z0-9_-]+)/g)].map((match) =>
        match[1]
      ),
    );
    for (
      const path of attachmentPaths.split(",").map((value) => value.trim())
        .filter(Boolean)
    ) paths.add(path);
    for (const path of paths) {
      const file = await readFile(path).catch(() => null);
      if (!file) continue;
      const dataUrl = file.content.match(/^data:([^;,]+);base64,([\s\S]+)$/);
      if (dataUrl) {
        attachments.push({
          name: file.fileName || path.split("/").pop() || path,
          mimeType: dataUrl[1],
          data: dataUrl[2],
        });
      } else references.set(path, file.content);
    }
    return {
      text: [...references].map(([filePath, content]) =>
        `--- BEGIN REFERENCE: ${filePath} ---\n${
          withoutFrontmatter(content).slice(0, 200_000)
        }\n--- END REFERENCE ---`
      ).join("\n\n"),
      attachments,
    };
  };

  const runPlanning = async (feedback = "") => {
    setPhase("planning");
    try {
      const references = await referenceInputs();
      const text = await call(
        "Plan a Workspace workflow in plain language. Cover goal, ordered steps, inputs, outputs, and edge cases. Do not mention YAML or node types. Keep it concise.",
        `Workflow name: ${name}\nRequest: ${request}${
          additionalInstructions
            ? `\nAdditional requirements:\n${additionalInstructions}`
            : ""
        }${references.text ? `\n\nReferenced files:\n${references.text}` : ""}${
          feedback ? `\nFeedback on previous plan: ${feedback}` : ""
        }`,
        references.attachments,
      );
      setPlan(text);
      setPhase("plan-review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase("input");
    }
  };

  const generate = async (feedback = "") => {
    setPhase("generating");
    setReview(null);
    setAcceptReviewIssues(false);
    const historyText = historyContext();
    const references = await referenceInputs();
    const basePrompt = `${
      mode === "create" ? "Create" : "Modify"
    } the ${artifactKind} named "${name}".\n\nUser request:\n${request}\n${
      additionalInstructions
        ? `\nAdditional requirements:\n${additionalInstructions}\n`
        : ""
    }${references.text ? `\nReferenced files:\n${references.text}\n` : ""}${
      plan ? `\nApproved plan:\n${plan}\n` : ""
    }${
      mode === "modify"
        ? `\nCurrent ${artifactKind}:\n${currentMarkdown}\n`
        : ""
    }${historyText ? `\nSelected execution history:\n${historyText}\n` : ""}${
      feedback
        ? `\nRevision instructions:\n${feedback}\n\nPrevious generated ${artifactKind}:\n${
          skillInstructions
            ? `\`\`\`skill-instructions\n${skillInstructions}\n\`\`\`\n`
            : ""
        }${generatedBlock}`
        : ""
    }`;
    try {
      const skillSpec = artifactKind === "skill"
        ? "\nYou are authoring an Agent Skill. Return exactly two fenced blocks: first `skill-instructions` containing concise Markdown instructions for the chat model, then one `hub-workflow` block. Do not put frontmatter or skill-capabilities in the instructions block. The workflow must save meaningful results to variables; the caller automatically receives them."
        : "";
      let response = await call(
        `You are a workflow author. ${workflowGenerationSpec}${skillSpec}`,
        basePrompt,
        references.attachments,
      );
      let block = findWorkflowBlocks(response)[0];
      let instructions = artifactKind === "skill"
        ? extractSkillInstructions(response)
        : "";
      for (
        let attempt = 1;
        (!block || block.error ||
          (artifactKind === "skill" && !instructions)) && attempt <= 2;
        attempt++
      ) {
        response = await call(
          `You repair workflow YAML. ${workflowGenerationSpec}${skillSpec}`,
          `The previous output is invalid. ${
            artifactKind === "skill"
              ? "Return one skill-instructions block followed by one complete valid hub-workflow block."
              : "Return one complete valid hub-workflow block only."
          }\n\nPrevious output:\n${response}\n\nError:\n${
            block?.error || (!instructions && artifactKind === "skill"
              ? "No skill-instructions block found"
              : "No workflow block found")
          }`,
          references.attachments,
        );
        block = findWorkflowBlocks(response)[0];
        instructions = artifactKind === "skill"
          ? extractSkillInstructions(response)
          : "";
      }
      if (!block || block.error) {
        throw new Error(
          block?.error || "AI response did not contain a valid workflow block.",
        );
      }
      if (artifactKind === "skill" && !instructions) {
        throw new Error(
          "AI response did not contain a skill-instructions block.",
        );
      }
      parseWorkflowFromMarkdown(block.raw);
      setGeneratedBlock(block.raw);
      setSkillInstructions(instructions);
      await reviewGenerated(
        `${
          instructions ? `Skill instructions:\n${instructions}\n\n` : ""
        }${block.raw}`,
        basePrompt,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase(plan ? "plan-review" : "input");
    }
  };

  const reviewGenerated = async (block: string, originalRequest: string) => {
    setPhase("reviewing");
    const systemPrompt =
      'Review a workflow for correctness, valid connections, finite control flow, required properties, safe file writes, and whether it fulfills the request. Return one JSON object only. Never repeat the workflow or use Markdown fences. Schema: {"verdict":"pass|fail","summary":"...","issues":[{"severity":"high|medium|low","nodeId":"...","message":"...","suggestion":"..."}]}';
    const prompt =
      `Request:\n${originalRequest}\n\nWorkflow:\n${block}\n\nSpecification:\n${workflowGenerationSpec}`;
    let response = await call(systemPrompt, prompt);
    let parsed = parseReviewResponse(response);
    if (!parsed) {
      response = await call(
        "Convert the supplied review response to the required JSON schema. Return JSON only; do not include or repeat any workflow YAML.",
        `Required schema: {\"verdict\":\"pass|fail\",\"summary\":\"...\",\"issues\":[]}\n\nInvalid review response:\n${
          response.slice(0, 20_000)
        }`,
      );
      parsed = parseReviewResponse(response);
    }
    setReview(
      parsed ??
        {
          verdict: "pass",
          summary:
            "AI review returned an unsupported format. Local workflow validation passed, so no unstructured review text was treated as an issue.",
          issues: [],
        },
    );
    setPhase("result");
  };

  const begin = () => {
    if (!request.trim() || !name.trim()) return;
    if (mode === "create") void runPlanning();
    else void generate();
  };
  const acceptExternal = () => {
    try {
      let block = findWorkflowBlocks(externalResponse)[0];
      if (!block && artifactKind === "workflow") {
        const parsed = yaml.load(externalResponse, {
          schema: yaml.JSON_SCHEMA,
        });
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          block = findWorkflowBlocks(
            serializeWorkflowData(parsed as Record<string, unknown>),
          )[0];
        }
      }
      const instructions = artifactKind === "skill"
        ? extractSkillInstructions(externalResponse)
        : "";
      if (!block || block.error) {
        throw new Error(
          block?.error || "No workflow block was found in the pasted response.",
        );
      }
      if (artifactKind === "skill" && !instructions) {
        throw new Error(
          "No skill-instructions block was found in the pasted response.",
        );
      }
      parseWorkflowFromMarkdown(block.raw);
      setGeneratedBlock(block.raw);
      setSkillInstructions(instructions);
      setReview({
        verdict: "pass",
        summary:
          "The external response passed local YAML, node, and connection validation. AI review was not run.",
        issues: [],
      });
      setPhase("result");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  const apply = async () => {
    try {
      await onApply({
        block: generatedBlock,
        path: artifactKind === "skill"
          ? path.replace(/\/SKILL\.md$/i, "")
          : path,
        name,
        request,
        skillInstructions: artifactKind === "skill"
          ? skillInstructions
          : undefined,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  const busy = ["planning", "generating", "reviewing"].includes(phase);
  return (
    <div className="workflow-modal-backdrop">
      <section className="ai-workflow-builder">
        <header>
          <div>
            <Sparkles size={18} />
            <strong>
              {mode === "create"
                ? `Create ${
                  artifactKind === "skill" ? "Skill" : "Workflow"
                } with AI`
                : `Modify ${
                  artifactKind === "skill" ? "Skill" : "Workflow"
                } with AI`}
            </strong>
          </div>
          {!busy && (
            <button type="button" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </header>
        {phase === "input" && (
          <div className="ai-workflow-input">
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
              <span>Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {mode === "create" && (
              <label>
                <span>Output path</span>
                <input
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                />
              </label>
            )}
            <label>
              <span>Request</span>
              <textarea
                rows={7}
                value={request}
                onChange={(event) => setRequest(event.target.value)}
              />
            </label>
            <label>
              <span>Reference attachments</span>
              <input
                value={attachmentPaths}
                onChange={(event) => setAttachmentPaths(event.target.value)}
                placeholder="images/design.png, docs/spec.pdf"
              />
              <small>
                Comma-separated Workspace paths. Text is embedded; images,
                PDFs, audio, and video are sent as multimodal attachments.
              </small>
            </label>
            {mode === "modify" && relevantHistory.length > 0 && (
              <fieldset className="ai-workflow-history-select">
                <legend>Reference execution history</legend>
                {relevantHistory.map((run) => (
                  <details key={run.id} open={selectedRuns.includes(run.id)}>
                    <summary>
                      <label
                        onClick={(event) =>
                          event.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRuns.includes(run.id)}
                          onChange={(event) =>
                            toggleHistoryRun(run, event.target.checked)}
                        />
                        <span>
                          {new Date(run.startTime).toLocaleString()} ·{" "}
                          {run.status}
                        </span>
                      </label>
                    </summary>
                    {run.logs.map((log, index) => ({ log, index })).filter((
                      { log },
                    ) =>
                      log.status !== "info"
                    ).map(({ log, index }) => {
                      const key = `${log.nodeId}:${index}`;
                      return (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={(selectedSteps[run.id] ?? []).includes(
                              key,
                            )}
                            disabled={!selectedRuns.includes(run.id)}
                            onChange={(event) =>
                              toggleHistoryStep(run, key, event.target.checked)}
                          />
                          <span>
                            <b>{log.nodeId} · {log.nodeType}</b>
                            <small>{log.status} · {log.message}</small>
                          </span>
                        </label>
                      );
                    })}
                  </details>
                ))}
              </fieldset>
            )}
            <footer>
              <button type="button" onClick={onClose}>Cancel</button>
              <button
                type="button"
                disabled={!request.trim() || !name.trim()}
                onClick={() => setPhase("external")}
              >
                Use external LLM
              </button>
              <button
                type="button"
                className="primary"
                disabled={!request.trim() || !name.trim() ||
                  configured.length === 0}
                onClick={begin}
              >
                <Sparkles size={13} />Start
              </button>
            </footer>
          </div>
        )}
        {phase === "external" && (
          <div className="ai-workflow-review">
            <h3>External LLM</h3>
            <p>
              Copy this prompt to another model, then paste its complete
              response below.
            </p>
            <label>
              <span>Prompt</span>
              <textarea readOnly rows={8} value={externalPrompt} />
            </label>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(externalPrompt)}
            >
              Copy prompt
            </button>
            <label>
              <span>Response</span>
              <textarea
                rows={10}
                value={externalResponse}
                onChange={(event) => setExternalResponse(event.target.value)}
              />
            </label>
            <footer>
              <button type="button" onClick={() => setPhase("input")}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                disabled={!externalResponse.trim()}
                onClick={acceptExternal}
              >
                Validate response
              </button>
            </footer>
          </div>
        )}
        {busy && (
          <div className="ai-workflow-progress">
            <div className="ai-workflow-phases">
              <span
                className={phase === "planning" ? "active" : plan ? "done" : ""}
              >
                1 Plan
              </span>
              <span
                className={phase === "generating"
                  ? "active"
                  : generatedBlock
                  ? "done"
                  : ""}
              >
                2 Generate
              </span>
              <span
                className={phase === "reviewing"
                  ? "active"
                  : review
                  ? "done"
                  : ""}
              >
                3 Review
              </span>
            </div>
            <RefreshCw className="spin" size={22} />
            <strong>
              {phase === "planning"
                ? "Planning…"
                : phase === "generating"
                ? "Generating and validating…"
                : "Reviewing…"}
            </strong>
            {thinking && (
              <details open>
                <summary>Thinking</summary>
                <pre>{thinking}</pre>
              </details>
            )}
            {streamText && (
              <details>
                <summary>Streaming output</summary>
                <pre>{streamText}</pre>
              </details>
            )}
          </div>
        )}
        {phase === "plan-review" && (
          <div className="ai-workflow-review">
            <h3>Plan</h3>
            <pre>{plan}</pre>
            <label>
              <span>Feedback for re-plan</span>
              <textarea
                rows={3}
                value={planFeedback}
                onChange={(event) => setPlanFeedback(event.target.value)}
              />
            </label>
            <footer>
              <button type="button" onClick={onClose}>Cancel</button>
              <button
                type="button"
                disabled={!planFeedback.trim()}
                onClick={() => void runPlanning(planFeedback)}
              >
                Re-plan
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void generate()}
              >
                <Check size={13} />Approve plan
              </button>
            </footer>
          </div>
        )}
        {phase === "result" && (
          <div className="ai-workflow-result">
            <div className="ai-workflow-phases">
              <span className="done">1 Plan</span>
              <span className="done">2 Generate</span>
              <span className="done">3 Review</span>
            </div>
            <section className={review?.verdict === "pass" ? "pass" : "fail"}>
              <strong>
                {review?.verdict === "pass"
                  ? "Review passed"
                  : "Review found issues"}
              </strong>
              <p>{review?.summary}</p>
              {review?.issues.map((issue, index) => (
                <article key={index}>
                  <b>
                    {issue.severity || "issue"}
                    {issue.nodeId ? ` · ${issue.nodeId}` : ""}
                  </b>
                  <span>{issue.message}</span>
                  {issue.suggestion && <small>{issue.suggestion}</small>}
                </article>
              ))}
              {review?.verdict === "fail" && (
                <label className="ai-workflow-risk">
                  <input
                    type="checkbox"
                    checked={acceptReviewIssues}
                    onChange={(event) =>
                      setAcceptReviewIssues(event.target.checked)}
                  />I reviewed these issues and want to use the result without
                  another refinement.
                </label>
              )}
            </section>
            {artifactKind === "skill" && (
              <details open>
                <summary>Skill instructions</summary>
                <pre>{skillInstructions}</pre>
              </details>
            )}
            {mode === "modify"
              ? (
                <div className="ai-workflow-diff">
                  <section>
                    <strong>Before</strong>
                    <pre>{currentMarkdown}</pre>
                  </section>
                  <section>
                    <strong>After</strong>
                    <pre>{skillInstructions ? `${skillInstructions}\n\n` : ""}{generatedBlock}</pre>
                  </section>
                </div>
              )
              : (
                <details open>
                  <summary>Generated workflow</summary>
                  <pre>{generatedBlock}</pre>
                </details>
              )}
            <label>
              <span>Additional refinement</span>
              <textarea
                rows={3}
                value={refineFeedback}
                onChange={(event) => setRefineFeedback(event.target.value)}
              />
            </label>
            <div className="ai-workflow-usage">
              {elapsedMs ? `${(elapsedMs / 1000).toFixed(1)}s` : ""}
              {usage
                ? ` · ${usage.inputTokens || 0} → ${
                  usage.outputTokens || 0
                } tokens${
                  usage.thinkingTokens
                    ? ` · Thinking ${usage.thinkingTokens}`
                    : ""
                }`
                : ""}
            </div>
            <footer>
              <button type="button" onClick={onClose}>Cancel</button>
              <button
                type="button"
                disabled={!refineFeedback.trim() && review?.verdict === "pass"}
                onClick={() =>
                  void generate(
                    `${review?.summary || ""}\n${
                      review?.issues.map((issue) =>
                        `${issue.severity}: ${issue.message} ${
                          issue.suggestion || ""
                        }`
                      ).join("\n")
                    }\n${refineFeedback}`,
                  )}
              >
                Refine
              </button>
              <button
                type="button"
                className="primary"
                disabled={review?.verdict === "fail" && !acceptReviewIssues}
                onClick={() => void apply()}
              >
                Use this {artifactKind}
              </button>
            </footer>
          </div>
        )}
        {error && <div className="workflow-error">{error}</div>}
      </section>
    </div>
  );
}
