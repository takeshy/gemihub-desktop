import {
  findWorkflowBlocks,
  serializeWorkflowData,
  serializeWorkflowYaml,
} from "./parser";
import { convertWorkflowNodes, workflowDialectForPath } from "./dialect";

export type RawWorkflowNode = Record<string, unknown> & {
  id?: string;
  type?: string;
};

export interface WorkflowDocument {
  nodes: RawWorkflowNode[];
  updateNodes: (nodes: RawWorkflowNode[]) => string;
}

export function readWorkflowDocument(
  markdown: string,
  path = "",
): WorkflowDocument {
  const blocks = findWorkflowBlocks(markdown);
  if (blocks.length !== 1 || blocks[0].error) {
    throw new Error(
      blocks[0]?.error || "Exactly one workflow block is required.",
    );
  }
  const block = blocks[0];
  const wrapped =
    !!(block.data.workflow && typeof block.data.workflow === "object" &&
      !Array.isArray(block.data.workflow));
  const root = wrapped
    ? block.data.workflow as Record<string, unknown>
    : block.data;
  if (!Array.isArray(root.nodes)) {
    throw new Error("Workflow nodes are missing.");
  }
  return {
    nodes: convertWorkflowNodes(root.nodes as RawWorkflowNode[], "desktop"),
    updateNodes: (nodes) => {
      const data = structuredClone(block.data);
      const serializedNodes = convertWorkflowNodes(
        nodes,
        workflowDialectForPath(path),
      );
      if (wrapped) {
        (data.workflow as Record<string, unknown>).nodes = serializedNodes;
      } else data.nodes = serializedNodes;
      const replacement = block.format === "yaml"
        ? serializeWorkflowYaml(data)
        : serializeWorkflowData(data);
      return markdown.slice(0, block.start) + replacement +
        markdown.slice(block.end);
    },
  };
}
