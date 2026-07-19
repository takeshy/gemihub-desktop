import { useMemo, useState } from "react";
import { Code, Eye } from "lucide-react";
import { MermaidCodeBlock } from "../components/MermaidCodeBlock";
import { workflowToMermaid } from "./mermaid";
import { parseWorkflowFile } from "./parser";

export function WorkflowFileView({
  content,
  isDark,
  onChange,
}: {
  content: string;
  isDark: boolean;
  onChange: (content: string) => void;
}) {
  const [mode, setMode] = useState<"visual" | "yaml">("visual");
  const preview = useMemo(() => {
    try {
      return { chart: workflowToMermaid(parseWorkflowFile(content, "workflows/workflow.yaml")), error: "" };
    } catch (error) {
      return { chart: "", error: error instanceof Error ? error.message : String(error) };
    }
  }, [content]);

  return (
    <div className="workflow-file-view">
      <div className="workflow-file-toolbar">
        <button type="button" className={mode === "visual" ? "active" : ""} onClick={() => setMode("visual")}>
          <Eye size={14} /> Visual
        </button>
        <button type="button" className={mode === "yaml" ? "active" : ""} onClick={() => setMode("yaml")}>
          <Code size={14} /> YAML
        </button>
      </div>
      {mode === "visual" ? (
        <div className="workflow-file-preview">
          {preview.error ? (
            <div className="workflow-file-error">
              <strong>Failed to parse workflow</strong>
              <span>{preview.error}</span>
              <button type="button" onClick={() => setMode("yaml")}>Edit YAML</button>
            </div>
          ) : (
            <MermaidCodeBlock code={preview.chart} isDark={isDark} />
          )}
        </div>
      ) : (
        <textarea
          className="raw-editor widget-raw-editor workflow-file-source"
          value={content}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          aria-label="Workflow YAML"
        />
      )}
    </div>
  );
}
