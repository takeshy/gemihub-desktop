import type { Workflow, WorkflowNode } from "./types";

function safeId(id: string): string { return `n_${id.replace(/[^A-Za-z0-9_]/g, "_")}`; }
function escapeLabel(value: string): string { return value.replace(/"/g, "'").replace(/[\[\]{}()]/g, "").replace(/\n/g, "<br/>"); }
function label(node: WorkflowNode): string {
  const p = node.properties;
  if (node.type === "if" || node.type === "while") return `${node.id}<br/>${p.condition || "condition"}`;
  if (node.type === "command") return `${node.id}<br/>${p.prompt || "prompt"}${p.saveTo ? `<br/>→ ${p.saveTo}` : ""}`;
  if (node.type === "variable" || node.type === "set") return `${node.id}<br/>${p.name || ""} = ${p.value || ""}`;
  if (node.type === "note" || node.type === "note-read") return `${node.id}<br/>${node.type}: ${p.path || ""}`;
  return `${node.id}<br/>${node.type}`;
}

export function workflowToMermaid(workflow: Workflow): string {
  if (!workflow.nodes.size) return "flowchart TD\n  empty[No nodes]";
  const lines = ["flowchart TD"];
  for (const node of workflow.nodes.values()) {
    const id = safeId(node.id), text = escapeLabel(label(node));
    if (node.type === "if" || node.type === "while") lines.push(`  ${id}{"${text}"}`);
    else if (node.type === "command") lines.push(`  ${id}[["${text}"]]`);
    else if (node.type === "variable" || node.type === "set") lines.push(`  ${id}[/"${text}"/]`);
    else lines.push(`  ${id}["${text}"]`);
  }
  let terminal = false;
  for (const node of workflow.nodes.values()) {
    const edges = workflow.edges.filter((edge) => edge.from === node.id);
    if (!edges.length) { lines.push(`  ${safeId(node.id)} --> FINISH`); terminal = true; continue; }
    for (const edge of edges) lines.push(`  ${safeId(edge.from)} -->${edge.label ? `|${edge.label === "true" ? "Yes" : "No"}|` : ""} ${safeId(edge.to)}`);
  }
  if (terminal) lines.push("  FINISH([\"END\"])");
  return lines.join("\n");
}
