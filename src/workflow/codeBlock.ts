import { parseWorkflowFromMarkdown } from "./parser";
import { workflowToMermaid } from "./mermaid";

export function workflowCodeBlockToMermaid(source: string): string {
  return workflowToMermaid(parseWorkflowFromMarkdown(`\`\`\`hub-workflow\n${source.replace(/\n$/, "")}\n\`\`\``));
}
