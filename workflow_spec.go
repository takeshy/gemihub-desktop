package main

import (
	"fmt"
	"sort"
	"strings"
)

var workflowNodeDocumentation = map[string]string{
	"variable": "variable: name is required; value is optional. Omit value to preserve caller input.", "set": "set: name and value are required. Supports one arithmetic operation; _clipboard copies the result.",
	"if": "if: condition and trueNext are required; falseNext is optional.", "while": "while: condition and trueNext are required; falseNext is the loop exit. Only while nodes may be back-reference targets.",
	"command": "command: prompt; optional model, ragSetting, vaultTools, mcpServers, enableThinking, attachments, saveTo, saveImageTo.", "http": "http: url; optional method, contentType, responseType, headers, body, saveTo, saveStatus, throwOnError. Supports FileExplorerData binary/form-data.",
	"gemihub-command": "gemihub-command: command encrypt/duplicate/convert-to-html/rename and path; optional text, metadata JSON, saveTo. PDF conversion is unavailable; publish/unpublish require Web.",
	"json":            "json: source is the bare variable name containing JSON; saveTo is required.", "note": "note: path, content; optional mode overwrite/append/create, confirm, history.", "note-read": "note-read: path and saveTo are required.",
	"note-search": "note-search: query and saveTo; optional searchContent and limit.", "note-list": "note-list: saveTo; optional folder, recursive, tags, tagMatch, createdWithin, modifiedWithin, sortBy, sortOrder, limit.",
	"folder-list": "folder-list: saveTo; optional folder. Returns {folders,count}.", "open": "open: path is required.", "dialog": "dialog: optional title, message, markdown, options, multiSelect, inputTitle, multiline, defaults, button1, button2, saveTo.",
	"prompt-file": "prompt-file: saveTo; optional title, default, forcePrompt, saveFileTo.", "prompt-selection": "prompt-selection: saveTo; optional saveSelectionTo.", "workflow": "workflow: path; optional input/output JSON mappings, prefix, saveTo.",
	"rag-sync": "rag-sync: retained for compatibility but server RAG sync is unsupported; use local RAG sync.", "file-explorer": "file-explorer: saveTo or savePathTo; optional path, mode select/create, title, extensions, default. Returns FileExplorerData.",
	"file-save": "file-save: source FileExplorerData and path; optional confirm and savePathTo.", "mcp": "mcp: HTTP url and tool; optional args, headers, saveTo, saveUiTo. MCP Apps UI is supported.",
	"sleep": "sleep: duration in milliseconds.", "script": "script: code; optional timeout and saveTo. Runs without DOM, network, or storage.",
	"shell": "shell: command; optional args JSON, cwd, env, timeout, throwOnError, saveTo, saveStderrTo, saveExitCodeTo.",
}

type WorkflowSpecContext struct {
	Models      []string `json:"models"`
	RAGSettings []string `json:"ragSettings"`
	MCPServers  []string `json:"mcpServers"`
}

func workflowSpecNodeNames(value any) []string {
	result := []string{}
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			if name, ok := item.(string); ok && strings.TrimSpace(name) != "" {
				result = append(result, strings.TrimSpace(name))
			}
		}
	case string:
		for _, name := range strings.FieldsFunc(typed, func(r rune) bool { return r == ',' || r == ' ' || r == '\n' || r == '\t' }) {
			if name != "" {
				result = append(result, name)
			}
		}
	}
	return result
}

func workflowSpecToolResult(arguments map[string]any, contexts ...WorkflowSpecContext) map[string]any {
	names := workflowSpecNodeNames(arguments["nodeTypes"])
	if len(names) == 0 {
		for name := range workflowNodeDocumentation {
			names = append(names, name)
		}
		sort.Strings(names)
	}
	lines := []string{"Workspace workflow format: one standalone pure-YAML file named *.workflow.yaml. Do not include Markdown or code fences. Nodes require unique id/type. Normal nodes use next; if/while use trueNext and falseNext. Variables use {{name}}, {{object.path}}, {{items[index].path}}, and optional :json escaping."}
	for _, name := range names {
		if documentation, ok := workflowNodeDocumentation[name]; ok {
			lines = append(lines, "- "+documentation)
		} else {
			lines = append(lines, fmt.Sprintf("- %s: unknown node type", name))
		}
	}
	if len(contexts) > 0 {
		context := contexts[0]
		if len(context.Models) > 0 {
			lines = append(lines, "Configured models: "+strings.Join(context.Models, ", "))
		}
		if len(context.RAGSettings) > 0 {
			lines = append(lines, "Configured RAG settings: "+strings.Join(context.RAGSettings, ", "))
		}
		if len(context.MCPServers) > 0 {
			lines = append(lines, "Configured MCP servers: "+strings.Join(context.MCPServers, ", "))
		}
	}
	return map[string]any{"result": strings.Join(lines, "\n")}
}
