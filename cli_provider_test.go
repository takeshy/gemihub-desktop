package main

import (
	"bytes"
	"encoding/json"
	"testing"
)

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
