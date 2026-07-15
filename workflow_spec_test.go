package main

import (
	"strings"
	"testing"
)

func TestWorkflowSpecToolFiltersNodeTypes(t *testing.T) {
	result := workflowSpecToolResult(map[string]any{"nodeTypes": []any{"command", "http"}})
	text, _ := result["result"].(string)
	if !strings.Contains(text, "- command:") || !strings.Contains(text, "- http:") || strings.Contains(text, "- note:") {
		t.Fatalf("unexpected filtered workflow spec: %s", text)
	}
	if !strings.Contains(text, "*.workflow.yaml") || strings.Contains(text, "fenced YAML") {
		t.Fatalf("workflow spec did not describe the canonical YAML file format: %s", text)
	}
}

func TestWorkflowSpecToolIncludesConfiguredContext(t *testing.T) {
	result := workflowSpecToolResult(map[string]any{"nodeTypes": []any{"command"}}, WorkflowSpecContext{Models: []string{"gemini-3.5-flash"}, RAGSettings: []string{"docs"}, MCPServers: []string{"browser"}})
	text, _ := result["result"].(string)
	for _, expected := range []string{"Configured models: gemini-3.5-flash", "Configured RAG settings: docs", "Configured MCP servers: browser"} {
		if !strings.Contains(text, expected) {
			t.Fatalf("missing %q in %s", expected, text)
		}
	}
}
