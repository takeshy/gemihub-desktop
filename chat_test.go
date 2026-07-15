package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type chatRoundTripFunc func(*http.Request) (*http.Response, error)

func (function chatRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestFileToolDefinitionsForMode(t *testing.T) {
	if got := len(fileToolDefinitionsForMode("all")); got != 7 {
		t.Fatalf("all mode returned %d tools, want 7", got)
	}
	tools := fileToolDefinitionsForMode("noSearch")
	if len(tools) != 5 {
		t.Fatalf("noSearch mode returned %d tools, want 5", len(tools))
	}
	for _, tool := range tools {
		function := tool["function"].(map[string]any)
		name := function["name"].(string)
		if name == "search_files" || name == "list_files" {
			t.Fatalf("noSearch mode included %q", name)
		}
	}
	if got := fileToolDefinitionsForMode("none"); got != nil {
		t.Fatalf("none mode returned tools: %#v", got)
	}
}

func TestAgentSkillFileToolAliases(t *testing.T) {
	base := t.TempDir()
	if err := os.MkdirAll(filepath.Join(base, "skills", "review"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(base, "skills", "review", "SKILL.md"), []byte("instructions"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := &App{directoryBase: base}
	value, pending, err := app.executeFileTool("read_note", `{"path":"skills/review/SKILL.md"}`)
	if err != nil || pending != nil || value.(*LocalFileResult).Content != "instructions" {
		t.Fatalf("read_note failed: value=%#v pending=%#v error=%v", value, pending, err)
	}
	_, pending, err = app.executeFileTool("create_note", `{"name":"index.md","folder":"Knowledge/demo","content":"# Demo"}`)
	if err != nil || pending == nil || pending.Path != "Knowledge/demo/index.md" || pending.Content != "# Demo" {
		t.Fatalf("create_note failed: pending=%#v error=%v", pending, err)
	}
	if _, _, err = app.executeFileTool("create_note", `{"name":"escape.md","folder":"../outside","content":"no"}`); err == nil {
		t.Fatal("create_note accepted a folder outside DirectoryBase")
	}
}

func TestGeminiFunctionDeclarationsNoSearch(t *testing.T) {
	declarations := geminiFunctionDeclarations("noSearch")
	if len(declarations) != 5 {
		t.Fatalf("noSearch mode returned %d Gemini declarations, want 5", len(declarations))
	}
	for _, declaration := range declarations {
		if _, wrapped := declaration["function"]; wrapped {
			t.Fatal("Gemini declaration retained the OpenAI function wrapper")
		}
	}
}

func TestVertexGenerateContentEndpointGlobal(t *testing.T) {
	got := vertexGenerateContentEndpoint("sample-project", "global", "gemini-2.5-flash")
	want := "https://aiplatform.googleapis.com/v1/projects/sample-project/locations/global/publishers/google/models/gemini-2.5-flash:generateContent"
	if got != want {
		t.Fatalf("vertexGenerateContentEndpoint() = %q, want %q", got, want)
	}
}

func TestVertexGenerateContentEndpointRegional(t *testing.T) {
	got := vertexGenerateContentEndpoint("sample-project", "asia-northeast1", "gemini-2.5-flash")
	want := "https://asia-northeast1-aiplatform.googleapis.com/v1/projects/sample-project/locations/asia-northeast1/publishers/google/models/gemini-2.5-flash:generateContent"
	if got != want {
		t.Fatalf("vertexGenerateContentEndpoint() = %q, want %q", got, want)
	}
}

func TestGeminiFunctionCallPreservesThoughtSignature(t *testing.T) {
	parts := []map[string]any{{"text": "Summary", "thought": true}, {"functionCall": map[string]any{"name": "list_files", "args": map[string]any{}}, "thoughtSignature": "signature-A"}}
	text, thinking, preserved, calls := parseGeminiResponseParts(parts)
	if text != "" || thinking != "Summary" || len(calls) != 1 || calls[0].Name != "list_files" {
		t.Fatalf("unexpected parse result: text=%q thinking=%q calls=%#v", text, thinking, calls)
	}
	if len(preserved) != 2 || preserved[1]["thoughtSignature"] != "signature-A" {
		t.Fatalf("thought signature was not preserved: %#v", preserved)
	}
}

func TestGeminiGeneratedImages(t *testing.T) {
	parts := []map[string]any{{"inlineData": map[string]any{"mimeType": "image/png", "data": "aGVsbG8="}}, {"text": "done"}}
	images := parseGeminiGeneratedImages(parts)
	if len(images) != 1 || images[0].MimeType != "image/png" || images[0].Data != "aGVsbG8=" {
		t.Fatalf("unexpected generated images: %#v", images)
	}
}

func TestOpenAIMultimodalMessageContent(t *testing.T) {
	content, ok := openAIMessageContent(ChatMessage{Role: "user", Content: "describe", Attachments: []ChatAttachment{{Name: "image.png", MimeType: "image/png", Data: "abc"}}}).([]map[string]any)
	if !ok || len(content) != 2 {
		t.Fatalf("unexpected multimodal content: %#v", content)
	}
	image, _ := content[1]["image_url"].(map[string]any)
	if image["url"] != "data:image/png;base64,abc" {
		t.Fatalf("unexpected image URL: %#v", image)
	}
}

func TestGeminiThinkingConfig(t *testing.T) {
	off := geminiThinkingConfig("gemini-3.5-flash", false)
	if off["thinkingBudget"] != 0 {
		t.Fatalf("unexpected Gemini 3.5 off config: %#v", off)
	}
	on := geminiThinkingConfig("gemini-3.5-flash", true)
	if on["includeThoughts"] != true {
		t.Fatalf("unexpected Gemini 3.5 on config: %#v", on)
	}
	if _, exists := on["thinkingLevel"]; exists {
		t.Fatalf("Gemini 3.5 should not use thinkingLevel: %#v", on)
	}
	legacyOff := geminiThinkingConfig("gemini-2.5-flash", false)
	if legacyOff["thinkingBudget"] != 0 {
		t.Fatalf("unexpected Gemini 2.5 off config: %#v", legacyOff)
	}
	liteOn := geminiThinkingConfig("gemini-3.1-flash-lite", true)
	if liteOn["thinkingLevel"] != "HIGH" || liteOn["includeThoughts"] != true {
		t.Fatalf("unexpected Gemini 3.1 Flash Lite config: %#v", liteOn)
	}
	if got := geminiThinkingConfig("gemini-3.1-pro-preview", false); got["includeThoughts"] != true {
		t.Fatalf("Gemini 3.1 Pro thinking must remain enabled: %#v", got)
	}
}

func TestAnthropicThinkingConfig(t *testing.T) {
	adaptive := anthropicThinkingConfig("claude-opus-4-8", true)
	if adaptive["type"] != "adaptive" || adaptive["display"] != "summarized" {
		t.Fatalf("unexpected Claude 4.8 thinking config: %#v", adaptive)
	}
	manual := anthropicThinkingConfig("claude-haiku-4-5", true)
	if manual["type"] != "enabled" || manual["budget_tokens"] != 4096 {
		t.Fatalf("unexpected Claude Haiku thinking config: %#v", manual)
	}
	if disabled := anthropicThinkingConfig("claude-opus-4-8", false); disabled != nil {
		t.Fatalf("Claude Opus thinking should be disabled: %#v", disabled)
	}
	if required := anthropicThinkingConfig("claude-fable-5", false); required["type"] != "adaptive" {
		t.Fatalf("Claude Fable adaptive thinking cannot be disabled: %#v", required)
	}
}

func TestAnthropicThinkingBlocksArePreservedAcrossToolCall(t *testing.T) {
	requests := 0
	previousClient := chatHTTPClient
	defer func() { chatHTTPClient = previousClient }()
	chatHTTPClient = &http.Client{Transport: chatRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		var payload map[string]any
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Errorf("decode request: %v", err)
			return &http.Response{StatusCode: http.StatusBadRequest, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("bad request"))}, nil
		}
		thinking, _ := payload["thinking"].(map[string]any)
		if thinking["type"] != "adaptive" || thinking["display"] != "summarized" {
			t.Errorf("missing adaptive thinking config: %#v", payload["thinking"])
		}
		var stream strings.Builder
		if requests == 1 {
			fmt.Fprintln(&stream, `data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}`)
			fmt.Fprintln(&stream, `data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}`)
			fmt.Fprintln(&stream, `data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"inspect"}}`)
			fmt.Fprintln(&stream, `data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"signed-thinking"}}`)
			fmt.Fprintln(&stream, `data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"read_file","input":{"path":"note.md"}}}`)
			fmt.Fprintln(&stream, `data: {"type":"message_delta","usage":{"output_tokens":7,"output_tokens_details":{"thinking_tokens":5}}}`)
			return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"text/event-stream"}}, Body: io.NopCloser(strings.NewReader(stream.String()))}, nil
		}
		messages, _ := payload["messages"].([]any)
		if len(messages) < 3 {
			t.Errorf("tool continuation messages missing: %#v", messages)
		} else {
			assistant, _ := messages[len(messages)-2].(map[string]any)
			content, _ := assistant["content"].([]any)
			if len(content) == 0 {
				t.Errorf("assistant thinking block missing: %#v", assistant)
			} else {
				block, _ := content[0].(map[string]any)
				if block["type"] != "thinking" || block["thinking"] != "inspect" || block["signature"] != "signed-thinking" {
					t.Errorf("thinking block was not preserved: %#v", block)
				}
			}
		}
		fmt.Fprintln(&stream, `data: {"type":"message_start","message":{"usage":{"input_tokens":12}}}`)
		fmt.Fprintln(&stream, `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"done"}}`)
		fmt.Fprintln(&stream, `data: {"type":"message_delta","usage":{"output_tokens":2}}`)
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"text/event-stream"}}, Body: io.NopCloser(strings.NewReader(stream.String()))}, nil
	})}

	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "note.md"), []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	app.projectConfigDir = t.TempDir()
	app.startup(context.Background())
	if _, err := app.SetDirectoryBase(directory); err != nil {
		t.Fatal(err)
	}
	result, err := app.chatAnthropic(ChatRequest{Endpoint: "https://anthropic.test", APIKey: "test", Model: "claude-opus-4-8", EnableThinking: true, EnableFileTools: true, FileToolMode: "noSearch", Messages: []ChatMessage{{Role: "user", Content: "read the note"}}})
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 || result.Content != "done" || result.Thinking != "inspect" || result.Usage.ThinkingTokens != 5 {
		t.Fatalf("unexpected result: requests=%d result=%#v", requests, result)
	}
}

func TestAddChatUsage(t *testing.T) {
	total := &ChatUsage{}
	addChatUsage(total, ChatUsage{InputTokens: 10, OutputTokens: 4, ThinkingTokens: 2, TotalTokens: 16})
	addChatUsage(total, ChatUsage{InputTokens: 7, OutputTokens: 3, TotalTokens: 10})
	if total.InputTokens != 17 || total.OutputTokens != 7 || total.ThinkingTokens != 2 || total.TotalTokens != 26 {
		t.Fatalf("unexpected accumulated usage: %#v", total)
	}
}

func TestChatToolDefinitionsIncludeRegisteredFrontendTool(t *testing.T) {
	definitions := chatToolDefinitions(ChatRequest{FileToolMode: "none", CustomTools: []ChatToolDefinition{{
		Name: "run_skill_workflow", Description: "Run an active skill workflow", Parameters: map[string]any{"type": "object"},
	}}})
	if len(definitions) != 1 {
		t.Fatalf("expected one custom definition, got %#v", definitions)
	}
	function, _ := definitions[0]["function"].(map[string]any)
	if function["name"] != "run_skill_workflow" {
		t.Fatalf("unexpected custom tool definition: %#v", function)
	}
}

func TestResolveChatToolOnlyCompletesRegisteredRequest(t *testing.T) {
	app := NewApp()
	response := make(chan chatToolResponse, 1)
	app.chatToolCalls["request-1"] = response
	if !app.ResolveChatTool("request-1", `{"success":true}`, "") {
		t.Fatal("registered request was not resolved")
	}
	result := <-response
	value, _ := result.Result.(map[string]any)
	if value["success"] != true || result.Error != "" {
		t.Fatalf("unexpected resolved value: %#v", result)
	}
	if app.ResolveChatTool("missing", `{}`, "") {
		t.Fatal("unknown request must not be accepted")
	}
}
