package main

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
)

func TestParseCodexModelsCatalog(t *testing.T) {
	models, err := parseCodexModelsCatalog([]byte(`{"models":[{"slug":"gpt-visible","display_name":"GPT Visible","visibility":"list"},{"slug":"gpt-hidden","visibility":"hide"},{"slug":"gpt-fallback","visibility":"list"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	want := []CLIModelOption{{ID: "gpt-visible", DisplayName: "GPT Visible"}, {ID: "gpt-fallback", DisplayName: "gpt-fallback"}}
	if !reflect.DeepEqual(models, want) {
		t.Fatalf("models = %#v, want %#v", models, want)
	}
}

func TestFormatCLIHistory(t *testing.T) {
	got := formatCLIHistory([]ChatMessage{
		{Role: "user", Content: "Inspect notes"},
		{Role: "assistant", Content: "Ready"},
	}, "Stay concise")
	want := "System: Stay concise\n\nUser: Inspect notes\n\nAssistant: Ready"
	if got != want {
		t.Fatalf("unexpected prompt:\n%s", got)
	}
}

func TestLatestUserMessage(t *testing.T) {
	messages := []ChatMessage{{Role: "user", Content: "first"}, {Role: "assistant", Content: "reply"}, {Role: "user", Content: "latest"}}
	if got := latestUserMessage(messages); got != "latest" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveCLIRejectsUnknownKind(t *testing.T) {
	if _, err := resolveCLI("other", "", nil); err == nil {
		t.Fatal("expected unknown provider error")
	}
}

func TestCodexTurnOutputPrefersFinalAnswerAndDeduplicates(t *testing.T) {
	output := newCodexTurnOutput()
	output.addCompletedItem(json.RawMessage(`{"item":{"id":"reasoning","type":"reasoning","summary":["Inspecting workspace"]}}`))
	output.addCompletedItem(json.RawMessage(`{"item":{"id":"command","type":"commandExecution"}}`))
	output.addCompletedItem(json.RawMessage(`{"item":{"id":"change","type":"fileChange"}}`))
	output.addCompletedItem(json.RawMessage(`{"item":{"id":"commentary","type":"agentMessage","phase":"commentary","text":"Working"}}`))
	final := json.RawMessage(`{"item":{"id":"final","type":"agentMessage","phase":"final_answer","text":"Done"}}`)
	output.addCompletedItem(final)
	output.addCompletedItem(final)
	if got := output.text(); got != "Done" {
		t.Fatalf("got %q", got)
	}
	if len(output.toolsUsed) != 2 || output.toolsUsed[0] != "shell" || output.toolsUsed[1] != "file_change" {
		t.Fatalf("tools=%#v", output.toolsUsed)
	}
	if output.thinkingText() != "Inspecting workspace" {
		t.Fatalf("thinking=%q", output.thinkingText())
	}
}

func TestCodexApprovalRequestsAreDeclinedWithoutUI(t *testing.T) {
	var buffer bytes.Buffer
	message := codexRPCMessage{ID: json.RawMessage(`42`), Method: "item/fileChange/requestApproval"}
	if err := respondToCodexServerRequest(json.NewEncoder(&buffer), message); err != nil {
		t.Fatal(err)
	}
	var response map[string]any
	if err := json.Unmarshal(buffer.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	result := response["result"].(map[string]any)
	if result["decision"] != "decline" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestCodexDynamicToolsExposeWorkspaceAndCustomTools(t *testing.T) {
	request := ChatRequest{
		EnableFileTools: true,
		FileToolMode:    "all",
		CustomTools: []ChatToolDefinition{{
			Name: "run_skill_workflow", Description: "Run a skill workflow",
			Parameters: map[string]any{"type": "object", "properties": map[string]any{}},
		}},
	}
	tools := codexDynamicTools(request)
	found := map[string]bool{}
	for _, tool := range tools {
		if name, ok := tool["name"].(string); ok {
			found[name] = true
		}
	}
	for _, name := range []string{"read_file", "propose_file_edit", "run_skill_workflow"} {
		if !found[name] {
			t.Fatalf("dynamic tool %q was not exposed", name)
		}
	}
}

func TestCodexInitializeOptsIntoExperimentalAPI(t *testing.T) {
	params := codexInitializeParams()
	capabilities, ok := params["capabilities"].(map[string]any)
	if !ok || capabilities["experimentalApi"] != true {
		t.Fatalf("initialize capabilities = %#v", params["capabilities"])
	}
}
