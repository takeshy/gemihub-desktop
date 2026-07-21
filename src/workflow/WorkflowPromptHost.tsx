import { useEffect, useMemo, useState } from "react";
import { Check, FileSearch, X } from "lucide-react";
import { listWorkspaceFiles } from "../lib/wailsBackend";
import type {
  WorkflowDialogResult,
  WorkflowPromptEventDetail,
  WorkflowPromptResult,
  WorkflowSelectionResult,
} from "./promptService";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { computeWorkflowLineDiff, workflowDiffFeedback } from "./diff";

export function WorkflowPromptHost() {
  const [queue, setQueue] = useState<WorkflowPromptEventDetail[]>([]);
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  const [confirmationFeedback, setConfirmationFeedback] = useState("");
  const [lineFeedback, setLineFeedback] = useState<Record<number, string>>({});
  const current = queue[0];

  useEffect(() => {
    const receive = (event: Event) =>
      setQueue((
        items,
      ) => [
        ...items,
        (event as CustomEvent<WorkflowPromptEventDetail>).detail,
      ]);
    window.addEventListener("llm-hub:workflow-prompt", receive);
    return () => window.removeEventListener("llm-hub:workflow-prompt", receive);
  }, []);

  useEffect(() => {
    if (!current) return;
    const request = current.request;
    setQuery("");
    setConfirmationFeedback("");
    setLineFeedback({});
    if (request.kind === "value") setValue(request.defaultValue ?? "");
    else if (request.kind === "password") setValue("");
    else if (request.kind === "file") {
      setValue(request.defaultPath ?? "");
      void listWorkspaceFiles().then((items) =>
        setPaths(
          items.filter((item) =>
            (request.allowBinary || !item.binary) &&
            (!request.extensions?.length ||
              request.extensions.includes(
                item.path.split(".").pop()?.toLowerCase() || "",
              ))
          ).map((item) => item.path),
        )
      );
    } else if (request.kind === "dialog") {
      setValue(request.defaults?.input ?? "");
      setSelected(request.defaults?.selected ?? []);
    } else if (request.kind === "selection") {
      setSelectionRange({ start: 0, end: 0 });
    }
  }, [current]);

  const filteredPaths = useMemo(
    () =>
      paths.filter((path) =>
        !query || path.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 200),
    [paths, query],
  );
  const confirmationDiff = useMemo(
    () =>
      current?.request.kind === "confirm-write" &&
        current.request.originalContent !== undefined
        ? computeWorkflowLineDiff(
          current.request.originalContent,
          current.request.content,
        )
        : [],
    [current],
  );
  if (!current) return null;
  const finish = (result: WorkflowPromptResult) => {
    current.resolve(result);
    setQueue((items) => items.slice(1));
  };
  const request = current.request;
  const dialogResult = (button: string): WorkflowDialogResult => ({
    button,
    selected,
    input: request.kind === "dialog" && request.inputTitle ? value : undefined,
  });
  const selectionResult = (): WorkflowSelectionResult | null =>
    request.kind === "selection" && selectionRange.end > selectionRange.start
      ? {
        text: request.content.slice(selectionRange.start, selectionRange.end),
        ...selectionRange,
      }
      : null;
  return (
    <div className="workflow-modal-backdrop">
      <section className="workflow-prompt-modal">
        <header>
          <div>
            {request.kind === "file"
              ? <FileSearch size={17} />
              : <Check size={17} />}
            <strong>{request.title}</strong>
          </div>
          <button type="button" onClick={() => finish(null)}>
            <X size={16} />
          </button>
        </header>
        {request.kind === "value" && (
          <div className="workflow-prompt-content">
            {request.message && <p>{request.message}</p>}
            {request.multiline
              ? (
                <textarea
                  autoFocus
                  rows={8}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              )
              : (
                <input
                  autoFocus
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") finish(value);
                  }}
                />
              )}
          </div>
        )}
        {request.kind === "password" && (
          <div className="workflow-prompt-content">
            {request.message && <p>{request.message}</p>}
            <input
              autoFocus
              type="password"
              autoComplete="current-password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && value) finish(value);
              }}
            />
          </div>
        )}
        {request.kind === "file" && (
          <div className="workflow-prompt-content">
            <label className="workflow-file-search">
              <FileSearch size={13} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Workspace files"
              />
            </label>
            <div className="workflow-file-options">
              {filteredPaths.map((path) => (
                <button
                  type="button"
                  className={value === path ? "selected" : ""}
                  key={path}
                  onClick={() => setValue(path)}
                >
                  {path}
                </button>
              ))}
            </div>
            {request.allowCreate && (
              <label>
                <span>New path</span>
                <input
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
            )}
          </div>
        )}
        {request.kind === "confirm-write" && (
          <div className="workflow-prompt-content">
            <div className="workflow-confirm-meta">
              <strong>{request.path}</strong>
              <span>{request.mode}</span>
            </div>
            {confirmationDiff.length
              ? (
                <div className="workflow-confirm-diff">
                  {confirmationDiff.map((line, index) => (
                    <div key={index} className={line.type}>
                      <span>{line.oldLine ?? ""}</span>
                      <span>{line.newLine ?? ""}</span>
                      <b>
                        {line.type === "added"
                          ? "+"
                          : line.type === "removed"
                          ? "−"
                          : " "}
                      </b>
                      <code>{line.content || " "}</code>
                      {line.type !== "unchanged" && (
                        <input
                          value={lineFeedback[index] || ""}
                          onChange={(event) =>
                            setLineFeedback((current) => ({
                              ...current,
                              [index]: event.target.value,
                            }))}
                          placeholder="AI feedback for this line"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )
              : (
                <>
                  <strong>New content</strong>
                  <pre className="workflow-confirm-preview">{request.content}</pre>
                </>
              )}
            <label>
              <span>Regeneration feedback</span>
              <textarea
                rows={3}
                value={confirmationFeedback}
                onChange={(event) =>
                  setConfirmationFeedback(event.target.value)}
                placeholder="Describe how the previous AI output should change"
              />
            </label>
          </div>
        )}
        {request.kind === "selection" && (
          <div className="workflow-prompt-content">
            <p>Select text below, then confirm.</p>
            <textarea
              className="workflow-selection-source"
              rows={14}
              readOnly
              value={request.content}
              onSelect={(event) =>
                setSelectionRange({
                  start: event.currentTarget.selectionStart,
                  end: event.currentTarget.selectionEnd,
                })}
            />
            <small>
              {selectionRange.end > selectionRange.start
                ? `${
                  selectionRange.end - selectionRange.start
                } characters selected`
                : "No text selected"} · {request.path}
            </small>
          </div>
        )}
        {request.kind === "dialog" && (
          <div className="workflow-prompt-content">
            {request.markdown
              ? (
                <div className="workflow-dialog-markdown">
                  <MarkdownPreview
                    content={request.message}
                    isDark={document.documentElement.classList.contains("dark")}
                  />
                </div>
              )
              : <p className="workflow-dialog-message">{request.message}</p>}
            {request.options.length > 0 && (
              <div className="workflow-dialog-options">
                {request.options.map((option) => (
                  <label key={option}>
                    <input
                      type={request.multiSelect ? "checkbox" : "radio"}
                      name="workflow-dialog-option"
                      checked={selected.includes(option)}
                      onChange={(event) =>
                        setSelected((items) =>
                          event.target.checked
                            ? (request.multiSelect
                              ? [
                                ...items.filter((item) => item !== option),
                                option,
                              ]
                              : [option])
                            : items.filter((item) =>
                              item !== option
                            )
                        )}
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}
            {request.inputTitle && (
              <label>
                <span>{request.inputTitle}</span>
                {request.multiline
                  ? (
                    <textarea
                      rows={6}
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                    />
                  )
                  : (
                    <input
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                    />
                  )}
              </label>
            )}
          </div>
        )}
        <footer>
          {request.kind === "dialog" && request.button2
            ? (
              <button
                type="button"
                onClick={() => finish(dialogResult(request.button2!))}
              >
                {request.button2}
              </button>
            )
            : (
              <button
                type="button"
                onClick={() =>
                  finish(
                    request.kind === "confirm-write"
                      ? { confirmed: false }
                      : null,
                  )}
              >
                Cancel
              </button>
            )}
          {request.kind === "confirm-write" && (
            <button
              type="button"
              disabled={!workflowDiffFeedback(
                confirmationDiff,
                lineFeedback,
                confirmationFeedback,
              )}
              onClick={() =>
                finish({
                  confirmed: false,
                  additionalRequest: workflowDiffFeedback(
                    confirmationDiff,
                    lineFeedback,
                    confirmationFeedback,
                  ),
                })}
            >
              Regenerate
            </button>
          )}
          <button
            type="button"
            className="primary"
            disabled={((request.kind === "file" ||
              request.kind === "password") && !value.trim()) ||
              (request.kind === "selection" && !selectionResult())}
            onClick={() =>
              finish(
                request.kind === "confirm-write"
                  ? { confirmed: true }
                  : request.kind === "dialog"
                  ? dialogResult(request.button1)
                  : request.kind === "selection"
                  ? selectionResult()
                  : value,
              )}
          >
            {request.kind === "dialog"
              ? request.button1
              : request.kind === "confirm-write"
              ? "Apply"
              : "Confirm"}
          </button>
        </footer>
      </section>
    </div>
  );
}
