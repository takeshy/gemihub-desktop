import { findWorkflowBlocks, serializeWorkflowData, serializeWorkflowYaml } from "./parser";

export type RawWorkflowNode = Record<string, unknown> & { id?: string; type?: string };

export interface WorkflowDocument {
  nodes: RawWorkflowNode[];
  updateNodes: (nodes: RawWorkflowNode[]) => string;
}

export function readWorkflowDocument(markdown: string): WorkflowDocument {
  const blocks = findWorkflowBlocks(markdown);
  if (blocks.length !== 1 || blocks[0].error) throw new Error(blocks[0]?.error || "Exactly one workflow block is required.");
  const block = blocks[0];
  const wrapped = !!(block.data.workflow && typeof block.data.workflow === "object" && !Array.isArray(block.data.workflow));
  const root = wrapped ? block.data.workflow as Record<string, unknown> : block.data;
  if (!Array.isArray(root.nodes)) throw new Error("Workflow nodes are missing.");
  return {
    nodes: structuredClone(root.nodes as RawWorkflowNode[]),
    updateNodes: (nodes) => {
      const data = structuredClone(block.data);
      if (wrapped) (data.workflow as Record<string, unknown>).nodes = nodes;
      else data.nodes = nodes;
      const replacement = block.format === "yaml" ? serializeWorkflowYaml(data) : serializeWorkflowData(data);
      return markdown.slice(0, block.start) + replacement + markdown.slice(block.end);
    },
  };
}
