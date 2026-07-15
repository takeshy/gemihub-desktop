export type WorkflowPromptRequest =
  | { kind: "value"; title: string; message?: string; defaultValue?: string; multiline?: boolean }
  | { kind: "file"; title: string; defaultPath?: string; allowCreate?: boolean; allowBinary?: boolean; extensions?: string[] }
  | { kind: "confirm-write"; title: string; path: string; mode: string; content: string; originalContent?: string }
  | { kind: "selection"; title: string; path: string; content: string }
  | { kind: "dialog"; title: string; message: string; options: string[]; multiSelect: boolean; markdown?: boolean; button1: string; button2?: string; inputTitle?: string; multiline?: boolean; defaults?: { input?: string; selected?: string[] } };

export interface WorkflowDialogResult {
  button: string;
  selected: string[];
  input?: string;
}

export interface WorkflowConfirmationResult {
  confirmed: boolean;
  additionalRequest?: string;
}

export interface WorkflowSelectionResult {
  text: string;
  start: number;
  end: number;
}

export type WorkflowPromptResult = string | boolean | WorkflowDialogResult | WorkflowConfirmationResult | WorkflowSelectionResult | null;

export interface WorkflowPromptEventDetail {
  request: WorkflowPromptRequest;
  resolve: (value: WorkflowPromptResult) => void;
}

export function requestWorkflowPrompt(request: WorkflowPromptRequest): Promise<WorkflowPromptResult> {
  return new Promise((resolve) => window.setTimeout(() => window.dispatchEvent(new CustomEvent<WorkflowPromptEventDetail>("llm-hub:workflow-prompt", { detail: { request, resolve } })), 0));
}
