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
	"time"
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

func TestLooksLikeStalledToolNarration(t *testing.T) {
	stalled := "I will call read_file. Let's call the tool. Let's do it. read_file now. Let's call read_file. Let's run the tool. Let's do it with read_file."
	if !looksLikeStalledToolNarration(stalled) {
		t.Fatal("repeated tool narration was not detected")
	}
	if looksLikeStalledToolNarration("I will read the file and summarize its contents.") {
		t.Fatal("ordinary tool preamble was incorrectly detected")
	}
}

func TestApplyPendingAppendCreatesMissingFile(t *testing.T) {
	base := t.TempDir()
	app := NewApp()
	app.directoryBase = base
	if err := app.ApplyPendingFileAction(PendingFileAction{Kind: "write", Mode: "append", Path: "new.md", Content: "hello"}); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(base, "new.md"))
	if err != nil || string(content) != "hello" {
		t.Fatalf("unexpected content: %q, %v", content, err)
	}
}

func TestGeminiAPIKeyUsesHeader(t *testing.T) {
	previousClient := chatHTTPClient
	defer func() { chatHTTPClient = previousClient }()
	chatHTTPClient = &http.Client{Transport: chatRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		if strings.Contains(request.URL.RawQuery, "key=") {
			t.Errorf("API key leaked into URL: %s", request.URL.String())
		}
		if request.Header.Get("x-goog-api-key") != "secret" {
			t.Errorf("missing API key header")
		}
		body := "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"ok\"}]}}]}\n"
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"text/event-stream"}}, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	app := NewApp()
	result, err := app.chatGemini(ChatRequest{Endpoint: "https://gemini.test/v1beta", APIKey: "secret", Model: "gemini-test", Messages: []ChatMessage{{Role: "user", Content: "hi"}}})
	if err != nil || result.Content != "ok" {
		t.Fatalf("unexpected result: %#v, %v", result, err)
	}
}

func TestCancelChatCancelsProviderRequest(t *testing.T) {
	previousClient := chatHTTPClient
	defer func() { chatHTTPClient = previousClient }()
	started := make(chan struct{})
	chatHTTPClient = &http.Client{Transport: chatRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		close(started)
		<-request.Context().Done()
		return nil, request.Context().Err()
	})}
	app := NewApp()
	done := make(chan error, 1)
	go func() {
		_, err := app.Chat(ChatRequest{Provider: "openai", Endpoint: "https://openai.test", Model: "test", StreamID: "stream-1", Messages: []ChatMessage{{Role: "user", Content: "hi"}}})
		done <- err
	}()
	<-started
	if !app.CancelChat("stream-1") {
		t.Fatal("active chat was not cancelled")
	}
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancelled chat unexpectedly succeeded")
		}
	case <-time.After(time.Second):
		t.Fatal("cancelled chat did not return")
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
	app := &App{directoryBase: t.TempDir(), workspaceState: WorkspaceState{ActiveWorkspaceID: "workspace", Workspaces: []Workspace{{ID: "workspace", Path: base}}}}
	value, pending, err := app.executeFileTool("read_note", `{"path":"skills/review/SKILL.md"}`)
	if err != nil || pending != nil || value.(*LocalFileResult).Content != "instructions" {
		t.Fatalf("read_note failed: value=%#v pending=%#v error=%v", value, pending, err)
	}
	_, pending, err = app.executeFileTool("create_note", `{"name":"index.md","folder":"Knowledge/demo","content":"# Demo"}`)
	if err != nil || pending == nil || pending.Path != "workspace://Knowledge/demo/index.md" || pending.Content != "# Demo" {
		t.Fatalf("create_note failed: pending=%#v error=%v", pending, err)
	}
	if _, _, err = app.executeFileTool("create_note", `{"name":"escape.md","folder":"../outside","content":"no"}`); err == nil {
		t.Fatal("create_note accepted a folder outside Workspace")
	}
}

func TestAIFileToolsAreLimitedToWorkspace(t *testing.T) {
	workspace := t.TempDir()
	external := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspace, "inside.md"), []byte("workspace needle"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(external, "outside.md"), []byte("external needle"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := &App{directoryBase: external, workspaceState: WorkspaceState{ActiveWorkspaceID: "workspace", Workspaces: []Workspace{{ID: "workspace", Path: workspace}}}}

	value, _, err := app.executeFileTool("read_file", `{"path":"inside.md"}`)
	if err != nil || value.(*LocalFileResult).Content != "workspace needle" {
		t.Fatalf("Workspace read failed: %#v, %v", value, err)
	}
	if _, _, err := app.executeFileTool("read_file", `{"path":"files://outside.md"}`); err == nil {
		t.Fatal("AI read_file accessed external Files")
	}
	for _, path := range []string{"/etc/passwd", `C:\\Users\\outside.md`, `\\\\server\\share\\outside.md`} {
		if _, _, err := app.executeFileTool("read_file", fmt.Sprintf(`{"path":%q}`, path)); err == nil {
			t.Fatalf("AI read_file accepted absolute path %q", path)
		}
	}
	value, _, err = app.executeFileTool("search_files", `{"query":"needle"}`)
	if err != nil {
		t.Fatal(err)
	}
	results := value.([]FileSearchResult)
	if len(results) != 1 || results[0].Path != "inside.md" {
		t.Fatalf("AI search escaped Workspace: %#v", results)
	}
	value, _, err = app.executeFileTool("list_files", `{}`)
	if err != nil {
		t.Fatal(err)
	}
	items := value.([]DirectoryFileEntry)
	if len(items) != 1 || items[0].Path != "inside.md" {
		t.Fatalf("AI list escaped Workspace: %#v", items)
	}
	_, pending, err := app.executeFileTool("propose_file_edit", `{"path":"draft.md","content":"draft"}`)
	if err != nil || pending == nil || pending.Path != "workspace://draft.md" {
		t.Fatalf("AI edit was not Workspace-scoped: %#v, %v", pending, err)
	}
}

func TestGeminiFunctionDeclarationsNoSearch(t *testing.T) {
	declarations := geminiFunctionDeclarations("noSearch")
	if len(declarations) != 7 {
		t.Fatalf("noSearch mode returned %d Gemini declarations, want 7", len(declarations))
	}
	for _, declaration := range declarations {
		if _, wrapped := declaration["function"]; wrapped {
			t.Fatal("Gemini declaration retained the OpenAI function wrapper")
		}
	}
}

func TestAppendTimelineToolWritesSystemTimeline(t *testing.T) {
	workspace := t.TempDir()
	app := &App{
		workspaceState: WorkspaceState{
			ActiveWorkspaceID: "workspace",
			Workspaces:        []Workspace{{ID: "workspace", Path: workspace}},
		},
	}
	value, pending, err := app.executeChatTool(ChatRequest{}, "append_timeline", `{"content":"回答の要点\n\n- 保存する"}`)
	if err != nil || pending != nil {
		t.Fatalf("append_timeline failed: value=%#v pending=%#v error=%v", value, pending, err)
	}
	result := value.(*timelineAppendResult)
	if !strings.HasPrefix(result.Path, "Dashboards/Timeline/Timeline/") {
		t.Fatalf("unexpected Timeline path: %q", result.Path)
	}
	content, err := os.ReadFile(filepath.Join(workspace, filepath.FromSlash(result.Path)))
	if err != nil {
		t.Fatal(err)
	}
	text := string(content)
	if !strings.Contains(text, "source: timeline:Timeline") ||
		!strings.Contains(text, "id: "+result.ID) ||
		!strings.Contains(text, "回答の要点") {
		t.Fatalf("unexpected Timeline content: %q", text)
	}
}

func TestTimelineToolRemainsAvailableWithoutGeneralFileTools(t *testing.T) {
	definitions := chatToolDefinitions(ChatRequest{FileToolMode: "none"})
	if len(definitions) != 2 {
		t.Fatalf("got %d tools, want Timeline read and append", len(definitions))
	}
	function := definitions[0]["function"].(map[string]any)
	if function["name"] != "read_timeline" {
		t.Fatalf("unexpected tool: %#v", function["name"])
	}
}

func TestReadTimelineToolReadsRequestedDay(t *testing.T) {
	workspace := t.TempDir()
	path := filepath.Join(workspace, "Dashboards", "Timeline", "Timeline", "2026-07-20.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("worked on launcher"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := &App{workspaceState: WorkspaceState{ActiveWorkspaceID: "workspace", Workspaces: []Workspace{{ID: "workspace", Path: workspace}}}}
	value, pending, err := app.executeChatTool(ChatRequest{}, "read_timeline", `{"date":"2026-07-20"}`)
	if err != nil || pending != nil {
		t.Fatalf("read_timeline failed: value=%#v pending=%#v error=%v", value, pending, err)
	}
	result := value.(*timelineReadResult)
	if result.Date != "2026-07-20" || result.Content != "worked on launcher" {
		t.Fatalf("unexpected Timeline result: %#v", result)
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
	app.workspaceConfigDir = t.TempDir()
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

func TestNativeWebSearchEndpointResolution(t *testing.T) {
	if got := providerEndpointHost("https://api.openai.com/v1/chat/completions"); got != "api.openai.com" {
		t.Fatalf("unexpected OpenAI host: %q", got)
	}
	if got := providerEndpointHost("https://api.x.ai/v1"); got != "api.x.ai" {
		t.Fatalf("unexpected xAI host: %q", got)
	}
	if got := responsesEndpoint("https://api.openai.com/v1/chat/completions"); got != "https://api.openai.com/v1/responses" {
		t.Fatalf("unexpected Responses endpoint: %q", got)
	}
}

func TestChatToolDefinitionsIncludeRegisteredFrontendTool(t *testing.T) {
	definitions := chatToolDefinitions(ChatRequest{FileToolMode: "none", CustomTools: []ChatToolDefinition{{
		Name: "run_skill_workflow", Description: "Run an active skill workflow", Parameters: map[string]any{"type": "object"},
	}}})
	if len(definitions) != 3 {
		t.Fatalf("expected Timeline tools and one custom definition, got %#v", definitions)
	}
	function, _ := definitions[2]["function"].(map[string]any)
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
