package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type ChatMessage struct {
	Role        string           `json:"role"`
	Content     string           `json:"content"`
	Attachments []ChatAttachment `json:"attachments,omitempty"`
}

type ChatAttachment struct {
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type ChatRequest struct {
	Provider        string               `json:"provider"`
	Endpoint        string               `json:"endpoint"`
	APIKey          string               `json:"apiKey"`
	LocalFramework  string               `json:"localFramework,omitempty"`
	LocalUsername   string               `json:"localUsername,omitempty"`
	LocalPassword   string               `json:"localPassword,omitempty"`
	Model           string               `json:"model"`
	VertexProjectID string               `json:"vertexProjectId"`
	VertexLocation  string               `json:"vertexLocation"`
	CLIType         string               `json:"cliType"`
	CLIPath         string               `json:"cliPath"`
	CLISessionID    string               `json:"cliSessionId"`
	SystemPrompt    string               `json:"systemPrompt"`
	Messages        []ChatMessage        `json:"messages"`
	EnableFileTools bool                 `json:"enableFileTools"`
	FileToolMode    string               `json:"fileToolMode"`
	StreamID        string               `json:"streamId,omitempty"`
	EnableThinking  bool                 `json:"enableThinking,omitempty"`
	EnableWebSearch bool                 `json:"enableWebSearch,omitempty"`
	CustomTools     []ChatToolDefinition `json:"customTools,omitempty"`
	WorkflowSpec    WorkflowSpecContext  `json:"workflowSpecContext,omitempty"`
	ctx             context.Context
}

type ChatToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type ChatToolRequest struct {
	RequestID string         `json:"requestId"`
	StreamID  string         `json:"streamId,omitempty"`
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

type ChatFunctionLimitRequest struct {
	RequestID       string `json:"requestId"`
	StreamID        string `json:"streamId"`
	Used            int    `json:"used"`
	CurrentLimit    int    `json:"currentLimit"`
	Remaining       int    `json:"remaining"`
	ExtensionAmount int    `json:"extensionAmount"`
}

type chatToolResponse struct {
	Result any
	Error  string
}

type ChatStreamEvent struct {
	StreamID string     `json:"streamId"`
	Type     string     `json:"type"`
	Delta    string     `json:"delta,omitempty"`
	Tool     string     `json:"tool,omitempty"`
	Usage    *ChatUsage `json:"usage,omitempty"`
}

var chatHTTPClient = &http.Client{Timeout: 10 * time.Minute}

func (a *App) emitChatStream(request ChatRequest, eventType, delta, tool string) {
	if request.StreamID == "" || a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, "chat:stream", ChatStreamEvent{StreamID: request.StreamID, Type: eventType, Delta: delta, Tool: tool})
}

func (a *App) emitChatUsage(request ChatRequest, usage ChatUsage) {
	if request.StreamID == "" || a.ctx == nil {
		return
	}
	copy := usage
	wailsruntime.EventsEmit(a.ctx, "chat:stream", ChatStreamEvent{StreamID: request.StreamID, Type: "usage", Usage: &copy})
}

type PendingFileAction struct {
	Kind    string `json:"kind"`
	Path    string `json:"path"`
	NewPath string `json:"newPath,omitempty"`
	Content string `json:"content,omitempty"`
	Mode    string `json:"mode,omitempty"`
}

type ChatResult struct {
	Content          string             `json:"content"`
	PendingAction    *PendingFileAction `json:"pendingAction,omitempty"`
	ToolsUsed        []string           `json:"toolsUsed,omitempty"`
	CLISessionID     string             `json:"cliSessionId,omitempty"`
	Provider         string             `json:"provider,omitempty"`
	Model            string             `json:"model,omitempty"`
	Thinking         string             `json:"thinking,omitempty"`
	Usage            *ChatUsage         `json:"usage,omitempty"`
	GeneratedImages  []GeneratedImage   `json:"generatedImages,omitempty"`
	WebSearchSources []WebSearchSource  `json:"webSearchSources,omitempty"`
}

type WebSearchSource struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

func webSearchSources(sourceTitles map[string]string) []WebSearchSource {
	urls := make([]string, 0, len(sourceTitles))
	for sourceURL := range sourceTitles {
		urls = append(urls, sourceURL)
	}
	sort.Strings(urls)
	result := make([]WebSearchSource, 0, len(urls))
	for _, sourceURL := range urls {
		parsed, err := url.Parse(sourceURL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			continue
		}
		title := sourceTitles[sourceURL]
		if title == "" {
			title = sourceURL
		}
		result = append(result, WebSearchSource{Title: title, URL: sourceURL})
	}
	return result
}

type GeneratedImage struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type ChatUsage struct {
	InputTokens    int `json:"inputTokens,omitempty"`
	OutputTokens   int `json:"outputTokens,omitempty"`
	ThinkingTokens int `json:"thinkingTokens,omitempty"`
	TotalTokens    int `json:"totalTokens,omitempty"`
	CachedTokens   int `json:"cachedTokens,omitempty"`
	ToolUseTokens  int `json:"toolUseTokens,omitempty"`
}

func addChatUsage(total *ChatUsage, next ChatUsage) {
	total.InputTokens += next.InputTokens
	total.OutputTokens += next.OutputTokens
	total.ThinkingTokens += next.ThinkingTokens
	total.TotalTokens += next.TotalTokens
	total.CachedTokens += next.CachedTokens
	total.ToolUseTokens += next.ToolUseTokens
}

func geminiThinkingConfig(model string, enabled bool) map[string]any {
	lower := strings.ToLower(model)
	if strings.Contains(lower, "gemma-4") {
		return nil
	}
	// Gemini 3.1 Flash Lite is the exception that uses thinkingLevel.
	if strings.Contains(lower, "gemini-3.1-flash-lite") {
		if !enabled {
			return nil
		}
		return map[string]any{"includeThoughts": true, "thinkingLevel": "HIGH"}
	}
	// Gemini 3/3.1 Pro cannot disable thinking. Other Gemini thinking models,
	// including Gemini 3.5 Flash, use a zero budget to explicitly turn it off.
	required := strings.Contains(lower, "gemini-3-pro") || strings.Contains(lower, "gemini-3.1-pro")
	if !enabled && !required {
		return map[string]any{"thinkingBudget": 0}
	}
	if lower == "gemini-2.5-flash-lite" {
		return map[string]any{"includeThoughts": true, "thinkingBudget": -1}
	}
	return map[string]any{"includeThoughts": true}
}

func anthropicThinkingConfig(model string, enabled bool) map[string]any {
	lower := strings.ToLower(model)
	alwaysAdaptive := strings.Contains(lower, "fable-5") || strings.Contains(lower, "mythos-5") || strings.Contains(lower, "mythos-preview")
	if !enabled && !alwaysAdaptive {
		return nil
	}
	adaptive := alwaysAdaptive || strings.Contains(lower, "opus-4-8") || strings.Contains(lower, "opus-4.8") || strings.Contains(lower, "opus-4-7") || strings.Contains(lower, "opus-4.7") || strings.Contains(lower, "opus-4-6") || strings.Contains(lower, "opus-4.6") || strings.Contains(lower, "sonnet-5") || strings.Contains(lower, "sonnet-4-6") || strings.Contains(lower, "sonnet-4.6")
	if adaptive {
		return map[string]any{"type": "adaptive", "display": "summarized"}
	}
	return map[string]any{"type": "enabled", "budget_tokens": 4096, "display": "summarized"}
}

type openAIMessage struct {
	Role             string           `json:"role"`
	Content          any              `json:"content,omitempty"`
	ToolCalls        []openAIToolCall `json:"tool_calls,omitempty"`
	ToolCallID       string           `json:"tool_call_id,omitempty"`
	ReasoningContent any              `json:"reasoning_content,omitempty"`
	Reasoning        any              `json:"reasoning,omitempty"`
}

type openAIToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

var fileToolDefinitions = []map[string]any{
	{"type": "function", "function": map[string]any{"name": "read_file", "description": "Read a file inside the active Workspace.", "parameters": map[string]any{"type": "object", "properties": map[string]any{"path": map[string]any{"type": "string"}}, "required": []string{"path"}}}},
	{"type": "function", "function": map[string]any{"name": "read_note", "description": "Agent Skills compatibility alias for reading a text file inside the active Workspace.", "parameters": map[string]any{"type": "object", "properties": map[string]any{"path": map[string]any{"type": "string"}}, "required": []string{"path"}}}},
	{"type": "function", "function": map[string]any{"name": "search_files", "description": "Search file names and text content inside the active Workspace.", "parameters": map[string]any{"type": "object", "properties": map[string]any{"query": map[string]any{"type": "string"}, "limit": map[string]any{"type": "integer"}}, "required": []string{"query"}}}},
	{"type": "function", "function": map[string]any{"name": "list_files", "description": "List files inside the active Workspace.", "parameters": map[string]any{"type": "object", "properties": map[string]any{}}}},
	{"type": "function", "function": map[string]any{"name": "propose_file_edit", "description": "Propose a Workspace file write. The user must explicitly apply it.", "parameters": map[string]any{"type": "object", "properties": map[string]any{"path": map[string]any{"type": "string"}, "content": map[string]any{"type": "string"}, "mode": map[string]any{"type": "string", "enum": []string{"replace", "append", "prepend"}}}, "required": []string{"path", "content"}}}},
	{"type": "function", "function": map[string]any{"name": "create_note", "description": "Agent Skills compatibility alias that proposes creating a Workspace file. The user must explicitly apply it.", "parameters": map[string]any{"type": "object", "properties": map[string]any{"name": map[string]any{"type": "string"}, "folder": map[string]any{"type": "string"}, "content": map[string]any{"type": "string"}}, "required": []string{"name", "content"}}}},
	{"type": "function", "function": map[string]any{"name": "propose_file_rename", "description": "Propose renaming a file. The user must explicitly apply it.", "parameters": map[string]any{"type": "object", "properties": map[string]any{"path": map[string]any{"type": "string"}, "newPath": map[string]any{"type": "string"}}, "required": []string{"path", "newPath"}}}},
}

var timelineToolDefinitions = []map[string]any{
	{
		"type": "function",
		"function": map[string]any{
			"name":        "read_timeline",
			"description": "Read the system Timeline for a local calendar date in the active Workspace. Use this before answering what the user did today, what happened on a date, or similar activity-history questions.",
			"parameters": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"date": map[string]any{"type": "string", "description": "Local date in YYYY-MM-DD format. Omit for today."},
				},
			},
		},
	},
	{
		"type": "function",
		"function": map[string]any{
			"name":        "append_timeline",
			"description": "Append a memo to the system Timeline in the active Workspace. Use this when the user explicitly asks to memo, save, remember, or record information. If the user asks to save your answer, put the useful answer itself in content, not merely the request.",
			"parameters": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{"type": "string", "description": "Markdown content to preserve in Timeline."},
				},
				"required": []string{"content"},
			},
		},
	},
}

func fileToolDefinitionsForMode(mode string) []map[string]any {
	if mode == "none" {
		return nil
	}
	if mode != "noSearch" {
		return fileToolDefinitions
	}
	filtered := make([]map[string]any, 0, len(fileToolDefinitions)-2)
	for _, definition := range fileToolDefinitions {
		function, _ := definition["function"].(map[string]any)
		name, _ := function["name"].(string)
		if name != "search_files" && name != "list_files" {
			filtered = append(filtered, definition)
		}
	}
	return filtered
}

func chatToolDefinitions(request ChatRequest) []map[string]any {
	if requestFileToolMode(request) == "none" {
		return nil
	}
	definitions := append([]map[string]any(nil), timelineToolDefinitions...)
	definitions = append(definitions, fileToolDefinitionsForMode(requestFileToolMode(request))...)
	for _, tool := range request.CustomTools {
		if strings.TrimSpace(tool.Name) == "" {
			continue
		}
		parameters := tool.Parameters
		if parameters == nil {
			parameters = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		definitions = append(definitions, map[string]any{"type": "function", "function": map[string]any{
			"name": tool.Name, "description": tool.Description, "parameters": parameters,
		}})
	}
	return definitions
}

func customToolRegistered(request ChatRequest, name string) bool {
	for _, tool := range request.CustomTools {
		if tool.Name == name {
			return true
		}
	}
	return false
}

var vertexResourceSegmentPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

func (a *App) Chat(request ChatRequest) (*ChatResult, error) {
	baseContext := a.ctx
	if baseContext == nil {
		baseContext = context.Background()
	}
	ctx, cancel := context.WithCancel(baseContext)
	request.ctx = ctx
	if requestFileToolMode(request) != "none" {
		timelineInstruction := "When the user asks what they did today, what happened on a date, or a similar activity-history question, call read_timeline for that local date before answering. When the user explicitly asks you to memo, save, remember, or record something, call append_timeline. If they ask to save your answer or findings, save the useful answer or a concise self-contained summary, then tell them it was recorded."
		if strings.TrimSpace(request.SystemPrompt) == "" {
			request.SystemPrompt = timelineInstruction
		} else if !strings.Contains(request.SystemPrompt, "append_timeline") {
			request.SystemPrompt = strings.TrimSpace(request.SystemPrompt) + "\n\n" + timelineInstruction
		}
	}
	if request.StreamID != "" {
		a.chatCancelMu.Lock()
		if a.chatCancels == nil {
			a.chatCancels = make(map[string]context.CancelFunc)
		}
		a.chatCancels[request.StreamID] = cancel
		a.chatCancelMu.Unlock()
	}
	defer func() {
		cancel()
		if request.StreamID != "" {
			a.chatCancelMu.Lock()
			delete(a.chatCancels, request.StreamID)
			a.chatCancelMu.Unlock()
		}
	}()
	if strings.ToLower(request.Provider) != "cli" && strings.TrimSpace(request.Model) == "" {
		return nil, fmt.Errorf("model is required")
	}
	var result *ChatResult
	var err error
	switch strings.ToLower(request.Provider) {
	case "cli":
		result, err = a.chatCLI(request)
	case "gemini":
		result, err = a.chatGemini(request)
	case "vertex":
		result, err = a.chatVertex(request)
	case "anthropic":
		result, err = a.chatAnthropic(request)
	default:
		if strings.EqualFold(request.LocalFramework, "opencode") {
			result, err = a.chatOpenCodeLocal(request)
		} else {
			result, err = a.chatOpenAI(request)
		}
	}
	if err != nil || result == nil {
		return result, err
	}
	result.Provider = strings.ToLower(request.Provider)
	if result.Model == "" {
		result.Model = request.Model
		if result.Model == "" && result.Provider == "cli" {
			result.Model = request.CLIType
		}
	}
	return result, nil
}

func openCodeHeaders(request ChatRequest) map[string]string {
	headers := map[string]string{}
	if request.APIKey != "" {
		headers["Authorization"] = "Bearer " + request.APIKey
	} else if request.LocalUsername != "" || request.LocalPassword != "" {
		username := request.LocalUsername
		if username == "" {
			username = "opencode"
		}
		token := base64.StdEncoding.EncodeToString([]byte(username + ":" + request.LocalPassword))
		headers["Authorization"] = "Basic " + token
	}
	return headers
}

func openCodePrompt(request ChatRequest) string {
	var prompt strings.Builder
	if request.SystemPrompt != "" {
		fmt.Fprintf(&prompt, "[system]\n%s\n\n", request.SystemPrompt)
	}
	for _, message := range request.Messages {
		role := "assistant"
		if message.Role == "user" {
			role = "user"
		}
		fmt.Fprintf(&prompt, "[%s]\n%s\n\n", role, message.Content)
	}
	return strings.TrimSpace(prompt.String())
}

func openCodeResponseText(value any) string {
	object, ok := value.(map[string]any)
	if !ok {
		return ""
	}
	for _, key := range []string{"parts", "content"} {
		if list, ok := object[key].([]any); ok {
			var text strings.Builder
			for _, raw := range list {
				part, _ := raw.(map[string]any)
				partType, _ := part["type"].(string)
				if partType != "" && partType != "text" {
					continue
				}
				if value, ok := part["text"].(string); ok {
					text.WriteString(value)
				} else if value, ok := part["content"].(string); ok {
					text.WriteString(value)
				}
			}
			if text.Len() > 0 {
				return text.String()
			}
		}
		if text, ok := object[key].(string); ok && text != "" {
			return text
		}
	}
	for _, key := range []string{"info", "message", "reply"} {
		if text := openCodeResponseText(object[key]); text != "" {
			return text
		}
	}
	for _, key := range []string{"output", "text"} {
		if text, ok := object[key].(string); ok && text != "" {
			return text
		}
	}
	return ""
}

func (a *App) chatOpenCodeLocal(request ChatRequest) (*ChatResult, error) {
	base := strings.TrimRight(request.Endpoint, "/")
	if base == "" {
		base = "http://127.0.0.1:4096"
	}
	slash := strings.Index(request.Model, "/")
	if slash <= 0 || slash == len(request.Model)-1 {
		return nil, fmt.Errorf("OpenCode model must be <providerID>/<modelID>")
	}
	headers := openCodeHeaders(request)
	var session struct {
		ID        string `json:"id"`
		SessionID string `json:"sessionID"`
		Session   struct {
			ID string `json:"id"`
		} `json:"session"`
	}
	if err := httpJSON(request.context(a.ctx), http.MethodPost, base+"/session", headers, map[string]any{}, &session); err != nil {
		return nil, fmt.Errorf("create OpenCode session: %w", err)
	}
	sessionID := session.ID
	if sessionID == "" {
		sessionID = session.SessionID
	}
	if sessionID == "" {
		sessionID = session.Session.ID
	}
	if sessionID == "" {
		return nil, fmt.Errorf("OpenCode server did not return a session id")
	}
	payload := map[string]any{
		"model": map[string]any{
			"providerID": request.Model[:slash],
			"modelID":    request.Model[slash+1:],
		},
		"parts": []map[string]any{{"type": "text", "text": openCodePrompt(request)}},
	}
	var response any
	endpoint := base + "/session/" + url.PathEscape(sessionID) + "/message"
	if err := httpJSON(request.context(a.ctx), http.MethodPost, endpoint, headers, payload, &response); err != nil {
		return nil, fmt.Errorf("send OpenCode message: %w", err)
	}
	content := openCodeResponseText(response)
	if content == "" {
		return nil, fmt.Errorf("OpenCode returned an empty assistant response")
	}
	a.emitChatStream(request, "text", content, "")
	return &ChatResult{Content: content}, nil
}

func (a *App) CancelChat(streamID string) bool {
	a.chatCancelMu.Lock()
	cancel := a.chatCancels[streamID]
	a.chatCancelMu.Unlock()
	if cancel == nil {
		return false
	}
	cancel()
	return true
}

func (request ChatRequest) context(fallback context.Context) context.Context {
	if request.ctx != nil {
		return request.ctx
	}
	if fallback != nil {
		return fallback
	}
	return context.Background()
}

func httpJSON(ctx context.Context, method, url string, headers map[string]string, input any, output any) error {
	body, err := json.Marshal(input)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	client := &http.Client{Timeout: 3 * time.Minute}
	response, err := client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 16*1024*1024))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("provider returned %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	return json.Unmarshal(responseBody, output)
}

func httpSSE(ctx context.Context, url string, headers map[string]string, input any, onData func([]byte) error) error {
	body, err := json.Marshal(input)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	response, err := chatHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024*1024))
		return fmt.Errorf("provider returned %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	sawData := false
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := bytes.TrimSpace([]byte(strings.TrimPrefix(line, "data:")))
		if len(data) == 0 || bytes.Equal(data, []byte("[DONE]")) {
			continue
		}
		sawData = true
		if err := onData(data); err != nil {
			return err
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	if !sawData {
		return fmt.Errorf("provider returned an empty event stream")
	}
	return nil
}

func (a *App) chatOpenAI(request ChatRequest) (*ChatResult, error) {
	endpoint := strings.TrimRight(request.Endpoint, "/")
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1"
	}
	if request.EnableWebSearch {
		lowerModel := strings.ToLower(request.Model)
		if strings.HasPrefix(lowerModel, "dall-e") || strings.HasPrefix(lowerModel, "gpt-image") || strings.HasPrefix(lowerModel, "grok-imagine-image") || strings.HasPrefix(lowerModel, "grok-imagine-video") {
			return nil, fmt.Errorf("native web search is unavailable for media-generation models")
		}
		if host := providerEndpointHost(endpoint); host == "api.openai.com" || host == "api.x.ai" {
			return a.chatOpenAIResponses(request, endpoint)
		}
		return nil, fmt.Errorf("native web search requires the official OpenAI or xAI endpoint")
	}
	if !strings.HasSuffix(endpoint, "/chat/completions") {
		endpoint += "/chat/completions"
	}
	messages := make([]openAIMessage, 0, len(request.Messages)+1)
	if request.SystemPrompt != "" {
		messages = append(messages, openAIMessage{Role: "system", Content: request.SystemPrompt})
	}
	for _, message := range request.Messages {
		messages = append(messages, openAIMessage{Role: message.Role, Content: openAIMessageContent(message)})
	}
	toolsUsed := []string{}
	thinkingUsed := []string{}
	usage := &ChatUsage{}

	for iteration := 0; iteration < 8; iteration++ {
		payload := map[string]any{"model": request.Model, "messages": messages, "stream": true, "stream_options": map[string]any{"include_usage": true}}
		tools := chatToolDefinitions(request)
		if len(tools) > 0 {
			payload["tools"] = tools
			payload["tool_choice"] = "auto"
		}
		headers := map[string]string{}
		if request.APIKey != "" {
			headers["Authorization"] = "Bearer " + request.APIKey
		}
		assistant := openAIMessage{Role: "assistant"}
		var content strings.Builder
		var reasoning strings.Builder
		if err := httpSSE(request.context(a.ctx), endpoint, headers, payload, func(data []byte) error {
			var chunk struct {
				Usage struct {
					PromptTokens     int `json:"prompt_tokens"`
					CompletionTokens int `json:"completion_tokens"`
					TotalTokens      int `json:"total_tokens"`
					PromptDetails    struct {
						CachedTokens int `json:"cached_tokens"`
					} `json:"prompt_tokens_details"`
					CompletionDetails struct {
						ReasoningTokens int `json:"reasoning_tokens"`
					} `json:"completion_tokens_details"`
				} `json:"usage"`
				Choices []struct {
					Delta struct {
						Content          string `json:"content"`
						ReasoningContent string `json:"reasoning_content"`
						Reasoning        string `json:"reasoning"`
						ToolCalls        []struct {
							Index    int    `json:"index"`
							ID       string `json:"id"`
							Type     string `json:"type"`
							Function struct {
								Name      string `json:"name"`
								Arguments string `json:"arguments"`
							} `json:"function"`
						} `json:"tool_calls"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal(data, &chunk); err != nil {
				return err
			}
			if chunk.Usage.TotalTokens > 0 {
				addChatUsage(usage, ChatUsage{InputTokens: chunk.Usage.PromptTokens, OutputTokens: chunk.Usage.CompletionTokens, TotalTokens: chunk.Usage.TotalTokens, CachedTokens: chunk.Usage.PromptDetails.CachedTokens, ThinkingTokens: chunk.Usage.CompletionDetails.ReasoningTokens})
				a.emitChatUsage(request, *usage)
			}
			if len(chunk.Choices) == 0 {
				return nil
			}
			delta := chunk.Choices[0].Delta
			if delta.Content != "" {
				content.WriteString(delta.Content)
				a.emitChatStream(request, "text", delta.Content, "")
			}
			thought := delta.ReasoningContent + delta.Reasoning
			if thought != "" {
				reasoning.WriteString(thought)
				a.emitChatStream(request, "thinking", thought, "")
			}
			for _, call := range delta.ToolCalls {
				for len(assistant.ToolCalls) <= call.Index {
					assistant.ToolCalls = append(assistant.ToolCalls, openAIToolCall{})
				}
				target := &assistant.ToolCalls[call.Index]
				if call.ID != "" {
					target.ID = call.ID
				}
				if call.Type != "" {
					target.Type = call.Type
				}
				target.Function.Name += call.Function.Name
				target.Function.Arguments += call.Function.Arguments
			}
			return nil
		}); err != nil {
			return nil, err
		}
		assistant.Content = content.String()
		assistant.ReasoningContent = reasoning.String()
		if thinking := strings.TrimSpace(strings.Join([]string{contentString(assistant.ReasoningContent), contentString(assistant.Reasoning)}, "\n")); thinking != "" {
			thinkingUsed = append(thinkingUsed, thinking)
		}
		if len(assistant.ToolCalls) == 0 {
			return &ChatResult{Content: contentString(assistant.Content), ToolsUsed: toolsUsed, Thinking: strings.Join(thinkingUsed, "\n\n"), Usage: usage}, nil
		}
		messages = append(messages, assistant)
		for _, call := range assistant.ToolCalls {
			toolsUsed = append(toolsUsed, call.Function.Name)
			a.emitChatStream(request, "tool", "", call.Function.Name)
			result, pending, err := a.executeChatTool(request, call.Function.Name, call.Function.Arguments)
			if err != nil {
				result = map[string]any{"success": false, "error": err.Error()}
			}
			if pending != nil {
				return &ChatResult{Content: contentString(assistant.Content), PendingAction: pending, ToolsUsed: toolsUsed, Thinking: strings.Join(thinkingUsed, "\n\n"), Usage: usage}, nil
			}
			encoded, _ := json.Marshal(result)
			messages = append(messages, openAIMessage{Role: "tool", Content: string(encoded), ToolCallID: call.ID})
		}
	}
	return nil, fmt.Errorf("tool iteration limit exceeded")
}

func providerEndpointHost(endpoint string) string {
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSuffix(parsed.Hostname(), "."))
}

func responsesEndpoint(endpoint string) string {
	endpoint = strings.TrimRight(endpoint, "/")
	endpoint = strings.TrimSuffix(endpoint, "/chat/completions")
	endpoint = strings.TrimSuffix(endpoint, "/responses")
	return endpoint + "/responses"
}

// chatOpenAIResponses uses the official Responses API for OpenAI and xAI
// because provider-native web search is not available through Chat Completions.
func (a *App) chatOpenAIResponses(request ChatRequest, endpoint string) (*ChatResult, error) {
	input := make([]any, 0, len(request.Messages)+16)
	for _, message := range request.Messages {
		content := any(message.Content)
		if len(message.Attachments) > 0 && message.Role == "user" {
			parts := []map[string]any{{"type": "input_text", "text": message.Content}}
			for _, attachment := range message.Attachments {
				dataURL := "data:" + attachment.MimeType + ";base64," + attachment.Data
				if strings.HasPrefix(attachment.MimeType, "image/") {
					parts = append(parts, map[string]any{"type": "input_image", "image_url": dataURL, "detail": "auto"})
				} else if attachment.MimeType == "application/pdf" {
					parts = append(parts, map[string]any{"type": "input_file", "filename": attachment.Name, "file_data": dataURL})
				}
			}
			content = parts
		}
		input = append(input, map[string]any{"role": message.Role, "content": content})
	}
	tools := []map[string]any{{"type": "web_search"}}
	for _, definition := range chatToolDefinitions(request) {
		function, _ := definition["function"].(map[string]any)
		if function == nil {
			continue
		}
		tools = append(tools, map[string]any{
			"type": "function", "name": function["name"],
			"description": function["description"], "parameters": function["parameters"],
		})
	}
	headers := map[string]string{"Authorization": "Bearer " + request.APIKey}
	toolsUsed := []string{"web_search"}
	usage := &ChatUsage{}
	for iteration := 0; iteration < 20; iteration++ {
		payload := map[string]any{
			"model": request.Model, "input": input, "tools": tools,
			"tool_choice": "auto", "include": []string{"reasoning.encrypted_content"},
		}
		if request.SystemPrompt != "" {
			payload["instructions"] = request.SystemPrompt
		}
		if request.EnableThinking {
			payload["reasoning"] = map[string]any{"effort": "high", "summary": "detailed"}
		}
		var response struct {
			Output []json.RawMessage `json:"output"`
			Usage  struct {
				InputTokens  int `json:"input_tokens"`
				OutputTokens int `json:"output_tokens"`
				TotalTokens  int `json:"total_tokens"`
				InputDetails struct {
					CachedTokens int `json:"cached_tokens"`
				} `json:"input_tokens_details"`
				OutputDetails struct {
					ReasoningTokens int `json:"reasoning_tokens"`
				} `json:"output_tokens_details"`
			} `json:"usage"`
		}
		if err := httpJSON(request.context(a.ctx), http.MethodPost, responsesEndpoint(endpoint), headers, payload, &response); err != nil {
			return nil, err
		}
		addChatUsage(usage, ChatUsage{InputTokens: response.Usage.InputTokens, OutputTokens: response.Usage.OutputTokens, TotalTokens: response.Usage.TotalTokens, CachedTokens: response.Usage.InputDetails.CachedTokens, ThinkingTokens: response.Usage.OutputDetails.ReasoningTokens})
		a.emitChatUsage(request, *usage)
		var text strings.Builder
		var thinking strings.Builder
		calls := []struct{ CallID, Name, Arguments string }{}
		sources := map[string]string{}
		for _, raw := range response.Output {
			var item struct {
				Type      string `json:"type"`
				CallID    string `json:"call_id"`
				Name      string `json:"name"`
				Arguments string `json:"arguments"`
				Summary   []struct {
					Text string `json:"text"`
				} `json:"summary"`
				Content []struct {
					Type        string                              `json:"type"`
					Text        string                              `json:"text"`
					Annotations []struct{ Type, URL, Title string } `json:"annotations"`
				} `json:"content"`
			}
			if err := json.Unmarshal(raw, &item); err != nil {
				continue
			}
			if item.Type == "function_call" {
				calls = append(calls, struct{ CallID, Name, Arguments string }{item.CallID, item.Name, item.Arguments})
			}
			if item.Type == "reasoning" {
				for _, summary := range item.Summary {
					thinking.WriteString(summary.Text)
				}
			}
			for _, part := range item.Content {
				if part.Type == "output_text" {
					text.WriteString(part.Text)
				}
				for _, annotation := range part.Annotations {
					if annotation.URL != "" {
						sources[annotation.URL] = annotation.Title
					}
				}
			}
			var replay any
			if json.Unmarshal(raw, &replay) == nil {
				input = append(input, replay)
			}
		}
		if calls == nil || len(calls) == 0 {
			content := text.String()
			a.emitChatStream(request, "text", content, "")
			if thinking.Len() > 0 {
				a.emitChatStream(request, "thinking", thinking.String(), "")
			}
			return &ChatResult{Content: content, Thinking: thinking.String(), ToolsUsed: toolsUsed, Usage: usage, WebSearchSources: webSearchSources(sources)}, nil
		}
		for _, call := range calls {
			arguments := map[string]any{}
			if err := json.Unmarshal([]byte(call.Arguments), &arguments); err != nil {
				arguments = map[string]any{"_raw": call.Arguments}
			}
			result, pending, err := a.executeChatTool(request, call.Name, call.Arguments)
			toolsUsed = append(toolsUsed, call.Name)
			a.emitChatStream(request, "tool", "", call.Name)
			if pending != nil {
				return &ChatResult{Content: text.String(), PendingAction: pending, ToolsUsed: toolsUsed, Usage: usage}, nil
			}
			if err != nil {
				result = map[string]any{"success": false, "error": err.Error()}
			}
			encoded, _ := json.Marshal(result)
			input = append(input, map[string]any{"type": "function_call_output", "call_id": call.CallID, "output": string(encoded)})
			_ = arguments
		}
	}
	return nil, fmt.Errorf("Responses tool iteration limit exceeded")
}

func openAIMessageContent(message ChatMessage) any {
	if len(message.Attachments) == 0 {
		return message.Content
	}
	parts := []map[string]any{{"type": "text", "text": message.Content}}
	for _, attachment := range message.Attachments {
		if strings.HasPrefix(attachment.MimeType, "image/") && attachment.Data != "" {
			parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]any{"url": "data:" + attachment.MimeType + ";base64," + attachment.Data}})
		} else {
			parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("[Binary attachment: %s (%s)]", attachment.Name, attachment.MimeType)})
		}
	}
	return parts
}

func contentString(content any) string {
	switch value := content.(type) {
	case string:
		return value
	case nil:
		return ""
	default:
		bytes, _ := json.Marshal(value)
		return string(bytes)
	}
}

func (a *App) executeFileTool(name, arguments string) (any, *PendingFileAction, error) {
	args := map[string]any{}
	if arguments != "" {
		if err := json.Unmarshal([]byte(arguments), &args); err != nil {
			return nil, nil, err
		}
	}
	stringArg := func(key string) string { value, _ := args[key].(string); return value }
	switch name {
	case "read_file", "read_note":
		path, err := aiWorkspacePath(stringArg("path"))
		if err != nil {
			return nil, nil, err
		}
		result, err := a.ReadWorkspaceFile(path)
		if err != nil {
			return nil, nil, err
		}
		if result == nil {
			return nil, nil, fmt.Errorf("Workspace file not found: %s", path)
		}
		if len(result.Content) > 200000 {
			result.Content = result.Content[:200000] + "\n[truncated]"
		}
		return result, nil, nil
	case "search_files":
		limit := 30
		if number, ok := args["limit"].(float64); ok {
			limit = int(number)
		}
		result, err := a.SearchWorkspaceFiles(stringArg("query"), limit)
		return result, nil, err
	case "list_files":
		inventory, err := a.ListWorkspaceFiles()
		if len(inventory) > 1000 {
			inventory = inventory[:1000]
		}
		return inventory, nil, err
	case "propose_file_edit":
		path, err := aiWorkspacePath(stringArg("path"))
		if err != nil {
			return nil, nil, err
		}
		if _, err := a.workspacePath(path, true); err != nil {
			return nil, nil, err
		}
		return nil, &PendingFileAction{Kind: "write", Path: "workspace://" + filepath.ToSlash(path), Content: stringArg("content"), Mode: stringArg("mode")}, nil
	case "create_note":
		name := strings.TrimSpace(strings.ReplaceAll(stringArg("name"), "\\", "/"))
		folder := strings.Trim(strings.TrimSpace(strings.ReplaceAll(stringArg("folder"), "\\", "/")), "/")
		if name == "" || strings.Contains(name, "/") {
			return nil, nil, fmt.Errorf("create_note requires a file name without path separators")
		}
		path := name
		if folder != "" {
			path = folder + "/" + name
		}
		if _, err := a.workspacePath(path, true); err != nil {
			return nil, nil, err
		}
		return nil, &PendingFileAction{Kind: "write", Path: "workspace://" + path, Content: stringArg("content"), Mode: "replace"}, nil
	case "propose_file_rename":
		path, err := aiWorkspacePath(stringArg("path"))
		if err != nil {
			return nil, nil, err
		}
		newPath, err := aiWorkspacePath(stringArg("newPath"))
		if err != nil {
			return nil, nil, err
		}
		if _, err := a.workspacePath(path, false); err != nil {
			return nil, nil, err
		}
		if _, err := a.workspacePath(newPath, true); err != nil {
			return nil, nil, err
		}
		return nil, &PendingFileAction{Kind: "rename", Path: "workspace://" + filepath.ToSlash(path), NewPath: "workspace://" + filepath.ToSlash(newPath)}, nil
	default:
		return nil, nil, fmt.Errorf("unknown file tool: %s", name)
	}
}

func aiWorkspacePath(path string) (string, error) {
	path = strings.TrimSpace(strings.ReplaceAll(path, "\\", "/"))
	if strings.HasPrefix(strings.ToLower(path), "files://") {
		return "", fmt.Errorf("AI file tools cannot access Files outside the active Workspace")
	}
	if strings.HasPrefix(strings.ToLower(path), "workspace://") {
		path = path[len("workspace://"):]
	}
	if strings.HasPrefix(path, "/") {
		return "", fmt.Errorf("AI file tools require a Workspace-relative path")
	}
	path = strings.TrimLeft(path, "/")
	windowsAbsolute := len(path) >= 3 && ((path[0] >= 'A' && path[0] <= 'Z') || (path[0] >= 'a' && path[0] <= 'z')) && path[1] == ':' && path[2] == '/'
	if path == "" || windowsAbsolute || filepath.IsAbs(filepath.FromSlash(path)) {
		return "", fmt.Errorf("AI file tools require a Workspace-relative path")
	}
	return filepath.ToSlash(filepath.Clean(filepath.FromSlash(path))), nil
}

func (a *App) executeChatTool(request ChatRequest, name, arguments string) (any, *PendingFileAction, error) {
	if name == "get_workflow_spec" {
		args := map[string]any{}
		if strings.TrimSpace(arguments) != "" {
			if err := json.Unmarshal([]byte(arguments), &args); err != nil {
				return nil, nil, err
			}
		}
		return workflowSpecToolResult(args, request.WorkflowSpec), nil, nil
	}
	if name == "append_timeline" {
		args := map[string]any{}
		if strings.TrimSpace(arguments) != "" {
			if err := json.Unmarshal([]byte(arguments), &args); err != nil {
				return nil, nil, err
			}
		}
		content, _ := args["content"].(string)
		result, err := a.appendSystemTimeline(content)
		return result, nil, err
	}
	if name == "read_timeline" {
		args := map[string]any{}
		if strings.TrimSpace(arguments) != "" {
			if err := json.Unmarshal([]byte(arguments), &args); err != nil {
				return nil, nil, err
			}
		}
		date, _ := args["date"].(string)
		result, err := a.readSystemTimeline(date)
		return result, nil, err
	}
	if !customToolRegistered(request, name) {
		return a.executeFileTool(name, arguments)
	}
	args := map[string]any{}
	if strings.TrimSpace(arguments) != "" {
		if err := json.Unmarshal([]byte(arguments), &args); err != nil {
			return nil, nil, err
		}
	}
	requestID := fmt.Sprintf("chat-tool-%d", time.Now().UnixNano())
	response := make(chan chatToolResponse, 1)
	a.chatToolMu.Lock()
	a.chatToolCalls[requestID] = response
	a.chatToolMu.Unlock()
	defer func() {
		a.chatToolMu.Lock()
		delete(a.chatToolCalls, requestID)
		a.chatToolMu.Unlock()
	}()
	wailsruntime.EventsEmit(a.ctx, "chat:tool-request", ChatToolRequest{RequestID: requestID, StreamID: request.StreamID, Name: name, Arguments: args})
	select {
	case value := <-response:
		if value.Error != "" {
			return nil, nil, fmt.Errorf("%s", value.Error)
		}
		return value.Result, nil, nil
	case <-time.After(10 * time.Minute):
		return nil, nil, fmt.Errorf("custom tool %s timed out", name)
	case <-request.context(a.ctx).Done():
		return nil, nil, request.context(a.ctx).Err()
	}
}

// ResolveChatTool completes a tool request emitted to the frontend. Only
// requests registered by the active Chat call are accepted.
func (a *App) ResolveChatTool(requestID, resultJSON, errorMessage string) bool {
	a.chatToolMu.Lock()
	response := a.chatToolCalls[requestID]
	a.chatToolMu.Unlock()
	if response == nil {
		return false
	}
	var result any
	if strings.TrimSpace(resultJSON) != "" {
		if err := json.Unmarshal([]byte(resultJSON), &result); err != nil {
			errorMessage = "invalid custom tool result: " + err.Error()
		}
	}
	select {
	case response <- chatToolResponse{Result: result, Error: errorMessage}:
		return true
	default:
		return false
	}
}

func (a *App) requestChatFunctionLimitExtension(request ChatRequest, used, currentLimit int) int {
	requestID := fmt.Sprintf("chat-limit-%d", time.Now().UnixNano())
	response := make(chan int, 1)
	a.chatLimitMu.Lock()
	a.chatLimitCalls[requestID] = response
	a.chatLimitMu.Unlock()
	defer func() {
		a.chatLimitMu.Lock()
		delete(a.chatLimitCalls, requestID)
		a.chatLimitMu.Unlock()
	}()
	wailsruntime.EventsEmit(a.ctx, "chat:function-limit-request", ChatFunctionLimitRequest{RequestID: requestID, StreamID: request.StreamID, Used: used, CurrentLimit: currentLimit, Remaining: currentLimit - used, ExtensionAmount: 50})
	select {
	case extension := <-response:
		if extension > 0 {
			return extension
		}
	case <-time.After(5 * time.Minute):
	}
	return 0
}

func (a *App) ResolveChatFunctionLimit(requestID string, extension int) bool {
	a.chatLimitMu.Lock()
	response := a.chatLimitCalls[requestID]
	a.chatLimitMu.Unlock()
	if response == nil {
		return false
	}
	select {
	case response <- extension:
		return true
	default:
		return false
	}
}

// joinFileContent concatenates two file fragments with exactly one newline
// separator, but only when both sides have content and the boundary is not
// already a newline. This keeps append/prepend from inserting blank lines or a
// stray leading/trailing newline.
func joinFileContent(left, right string) string {
	if left == "" {
		return right
	}
	if right == "" {
		return left
	}
	if strings.HasSuffix(left, "\n") || strings.HasPrefix(right, "\n") {
		return left + right
	}
	return left + "\n" + right
}

func (a *App) ApplyPendingFileAction(action PendingFileAction) error {
	switch action.Kind {
	case "rename":
		return a.RenameFile(action.Path, action.NewPath)
	case "write":
		content := action.Content
		if action.Mode == "append" || action.Mode == "prepend" {
			existing, err := a.ReadFile(action.Path)
			if err != nil {
				return err
			}
			existingContent := ""
			if existing != nil {
				existingContent = existing.Content
			}
			if action.Mode == "append" {
				content = joinFileContent(existingContent, content)
			} else {
				content = joinFileContent(content, existingContent)
			}
		}
		return a.WriteFile(action.Path, content)
	default:
		return fmt.Errorf("unknown pending action")
	}
}

func (a *App) chatGemini(request ChatRequest) (*ChatResult, error) {
	endpoint := strings.TrimRight(request.Endpoint, "/")
	if endpoint == "" {
		endpoint = "https://generativelanguage.googleapis.com/v1beta"
	}
	url := fmt.Sprintf("%s/models/%s:generateContent", endpoint, request.Model)
	headers := map[string]string{}
	if request.APIKey != "" {
		headers["x-goog-api-key"] = request.APIKey
	}
	return a.chatGeminiCompatible(request, url, headers, "Gemini")
}

func requestFileToolMode(request ChatRequest) string {
	if request.FileToolMode != "" {
		return request.FileToolMode
	}
	if request.EnableFileTools {
		return "all"
	}
	return "none"
}

func geminiFunctionDeclarationsForRequest(request ChatRequest) []map[string]any {
	tools := chatToolDefinitions(request)
	declarations := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		if function, ok := tool["function"].(map[string]any); ok {
			declarations = append(declarations, function)
		}
	}
	return declarations
}

func geminiFunctionDeclarations(mode string) []map[string]any {
	return geminiFunctionDeclarationsForRequest(ChatRequest{FileToolMode: mode})
}

type geminiFunctionCall struct {
	Name string
	Args any
}

func parseGeminiResponseParts(parts []map[string]any) (string, string, []map[string]any, []geminiFunctionCall) {
	var text strings.Builder
	var thinking strings.Builder
	modelParts := append([]map[string]any(nil), parts...)
	calls := []geminiFunctionCall{}
	for _, part := range parts {
		if partText, _ := part["text"].(string); partText != "" {
			if thought, _ := part["thought"].(bool); thought {
				thinking.WriteString(partText)
			} else {
				text.WriteString(partText)
			}
		}
		functionCall, ok := part["functionCall"].(map[string]any)
		if !ok {
			continue
		}
		name, _ := functionCall["name"].(string)
		calls = append(calls, geminiFunctionCall{Name: name, Args: functionCall["args"]})
	}
	return text.String(), thinking.String(), modelParts, calls
}

func parseGeminiGeneratedImages(parts []map[string]any) []GeneratedImage {
	images := []GeneratedImage{}
	for _, part := range parts {
		inline, _ := part["inlineData"].(map[string]any)
		mimeType, _ := inline["mimeType"].(string)
		data, _ := inline["data"].(string)
		if mimeType != "" && data != "" {
			images = append(images, GeneratedImage{MimeType: mimeType, Data: data})
		}
	}
	return images
}

func looksLikeStalledToolNarration(text string) bool {
	normalized := strings.ToLower(text)
	toolMentions := strings.Count(normalized, "tool") + strings.Count(normalized, "read_file") + strings.Count(normalized, "list_files")
	actionPromises := strings.Count(normalized, "let's call") + strings.Count(normalized, "i will call") + strings.Count(normalized, "let's do") + strings.Count(normalized, "let's run")
	return toolMentions >= 6 && actionPromises >= 4
}

func (a *App) chatGeminiCompatible(request ChatRequest, endpoint string, headers map[string]string, providerName string) (*ChatResult, error) {
	contents := make([]map[string]any, 0, len(request.Messages))
	for _, message := range request.Messages {
		role := message.Role
		if role == "assistant" {
			role = "model"
		}
		messageParts := []map[string]any{{"text": message.Content}}
		for _, attachment := range message.Attachments {
			if attachment.MimeType != "" && attachment.Data != "" {
				messageParts = append(messageParts, map[string]any{"inlineData": map[string]any{"mimeType": attachment.MimeType, "data": attachment.Data}})
			}
		}
		contents = append(contents, map[string]any{"role": role, "parts": messageParts})
	}
	toolsUsed := []string{}
	thinkingUsed := []string{}
	usage := &ChatUsage{}
	generatedImages := []GeneratedImage{}
	webSources := map[string]string{}
	toolCallSignatures := map[string]bool{}
	forceAnswer := false
	functionCallCount := 0
	functionCallLimit := 50
	lastLimitPrompt := 0
	stalledToolRecoveryUsed := false
	for iteration := 0; iteration < 256; iteration++ {
		payload := map[string]any{"contents": contents}
		if config := geminiThinkingConfig(request.Model, request.EnableThinking); config != nil {
			payload["generationConfig"] = map[string]any{"thinkingConfig": config}
		}
		if request.SystemPrompt != "" {
			payload["systemInstruction"] = map[string]any{"parts": []map[string]any{{"text": request.SystemPrompt}}}
		}
		declarations := geminiFunctionDeclarationsForRequest(request)
		if forceAnswer {
			declarations = nil
		}
		geminiTools := []map[string]any{}
		if len(declarations) > 0 {
			geminiTools = append(geminiTools, map[string]any{"functionDeclarations": declarations})
		}
		if request.EnableWebSearch {
			geminiTools = append(geminiTools, map[string]any{"googleSearch": map[string]any{}})
		}
		if len(geminiTools) > 0 {
			payload["tools"] = geminiTools
		}
		streamEndpoint := strings.Replace(endpoint, ":generateContent", ":streamGenerateContent", 1)
		if strings.Contains(streamEndpoint, "?") {
			streamEndpoint += "&alt=sse"
		} else {
			streamEndpoint += "?alt=sse"
		}
		parts := []map[string]any{}
		var roundUsage *ChatUsage
		if err := httpSSE(request.context(a.ctx), streamEndpoint, headers, payload, func(data []byte) error {
			var chunk struct {
				Usage struct {
					PromptTokenCount        int `json:"promptTokenCount"`
					CandidatesTokenCount    int `json:"candidatesTokenCount"`
					ThoughtsTokenCount      int `json:"thoughtsTokenCount"`
					TotalTokenCount         int `json:"totalTokenCount"`
					CachedContentTokenCount int `json:"cachedContentTokenCount"`
					ToolUsePromptTokenCount int `json:"toolUsePromptTokenCount"`
				} `json:"usageMetadata"`
				Candidates []struct {
					Content struct {
						Parts []map[string]any `json:"parts"`
					} `json:"content"`
					GroundingMetadata struct {
						GroundingChunks []struct {
							Web struct {
								URI   string `json:"uri"`
								Title string `json:"title"`
							} `json:"web"`
						} `json:"groundingChunks"`
					} `json:"groundingMetadata"`
				} `json:"candidates"`
			}
			if err := json.Unmarshal(data, &chunk); err != nil {
				return err
			}
			if chunk.Usage.TotalTokenCount > 0 {
				latest := ChatUsage{InputTokens: chunk.Usage.PromptTokenCount, OutputTokens: chunk.Usage.CandidatesTokenCount, ThinkingTokens: chunk.Usage.ThoughtsTokenCount, TotalTokens: chunk.Usage.TotalTokenCount, CachedTokens: chunk.Usage.CachedContentTokenCount, ToolUseTokens: chunk.Usage.ToolUsePromptTokenCount}
				roundUsage = &latest
			}
			if len(chunk.Candidates) == 0 {
				return nil
			}
			for _, groundingChunk := range chunk.Candidates[0].GroundingMetadata.GroundingChunks {
				if groundingChunk.Web.URI != "" {
					webSources[groundingChunk.Web.URI] = groundingChunk.Web.Title
				}
			}
			for _, part := range chunk.Candidates[0].Content.Parts {
				parts = append(parts, part)
				if value, _ := part["text"].(string); value != "" {
					if thought, _ := part["thought"].(bool); thought {
						a.emitChatStream(request, "thinking", value, "")
					} else {
						a.emitChatStream(request, "text", value, "")
					}
				}
			}
			return nil
		}); err != nil {
			return nil, fmt.Errorf("%s chat error: %w", providerName, err)
		}
		if roundUsage != nil {
			addChatUsage(usage, *roundUsage)
			a.emitChatUsage(request, *usage)
		}
		if len(parts) == 0 {
			return nil, fmt.Errorf("%s returned no candidates", providerName)
		}
		text, thinking, modelParts, calls := parseGeminiResponseParts(parts)
		generatedImages = append(generatedImages, parseGeminiGeneratedImages(parts)...)
		if strings.TrimSpace(thinking) != "" {
			thinkingUsed = append(thinkingUsed, thinking)
		}
		if len(calls) == 0 && len(declarations) > 0 && !stalledToolRecoveryUsed && looksLikeStalledToolNarration(text) {
			stalledToolRecoveryUsed = true
			contents = append(contents, map[string]any{"role": "model", "parts": modelParts})
			contents = append(contents, map[string]any{"role": "user", "parts": []map[string]any{{"text": "You described calling a tool repeatedly but did not emit a function call. Stop narrating tool usage. Emit the required functionCall now, or provide the final answer if no tool is needed."}}})
			continue
		}
		functionResponses := []map[string]any{}
		remaining := functionCallLimit - functionCallCount
		if remaining <= 10 && lastLimitPrompt != functionCallLimit {
			lastLimitPrompt = functionCallLimit
			if extension := a.requestChatFunctionLimitExtension(request, functionCallCount, functionCallLimit); extension > 0 {
				functionCallLimit += extension
				remaining = functionCallLimit - functionCallCount
			}
		}
		callsToProcess := calls
		if len(callsToProcess) > remaining {
			callsToProcess = callsToProcess[:max(0, remaining)]
		}
		if len(callsToProcess) == 0 && len(calls) > 0 {
			forceAnswer = true
			functionResponses = append(functionResponses, map[string]any{"text": "The function call limit has been reached. Do not emit another function call. Provide a final natural-language answer using the information gathered so far."})
		}
		for _, call := range callsToProcess {
			arguments, _ := json.Marshal(call.Args)
			signature := call.Name + "\x00" + string(arguments)
			var result any
			var pending *PendingFileAction
			var err error
			if toolCallSignatures[signature] {
				result = map[string]any{"success": false, "error": "This exact tool call was already completed. Use its previous result to answer the user without calling it again."}
				forceAnswer = true
			} else {
				toolCallSignatures[signature] = true
				result, pending, err = a.executeChatTool(request, call.Name, string(arguments))
			}
			toolsUsed = append(toolsUsed, call.Name)
			a.emitChatStream(request, "tool", "", call.Name)
			if err != nil {
				result = map[string]any{"success": false, "error": err.Error(), "instruction": "Do not call another tool to work around this failure. Report the error and required corrective action to the user."}
				forceAnswer = true
			}
			if pending != nil {
				return &ChatResult{Content: text, PendingAction: pending, ToolsUsed: toolsUsed, Thinking: strings.Join(thinkingUsed, "\n\n"), Usage: usage, GeneratedImages: generatedImages}, nil
			}
			functionResponses = append(functionResponses, map[string]any{"functionResponse": map[string]any{"name": call.Name, "response": map[string]any{"result": result}}})
		}
		functionCallCount += len(callsToProcess)
		if len(functionResponses) == 0 {
			return &ChatResult{Content: text, ToolsUsed: toolsUsed, Thinking: strings.Join(thinkingUsed, "\n\n"), Usage: usage, GeneratedImages: generatedImages, WebSearchSources: webSearchSources(webSources)}, nil
		}
		if functionCallCount >= functionCallLimit || len(callsToProcess) < len(calls) {
			forceAnswer = true
			functionResponses = append(functionResponses, map[string]any{"text": "The tool phase is complete. Do not emit or describe another function call. Answer the user's original request now in natural language using only the tool results already returned. If the results are empty or insufficient, say so clearly."})
		}
		contents = append(contents, map[string]any{"role": "model", "parts": modelParts})
		contents = append(contents, map[string]any{"role": "user", "parts": functionResponses})
	}
	return nil, fmt.Errorf("%s tool iteration limit exceeded", providerName)
}

func (a *App) chatVertex(request ChatRequest) (*ChatResult, error) {
	projectID := strings.TrimSpace(request.VertexProjectID)
	if projectID == "" {
		return nil, fmt.Errorf("Vertex AI project ID is required")
	}
	location := strings.TrimSpace(request.VertexLocation)
	if location == "" {
		location = "global"
	}
	if !vertexResourceSegmentPattern.MatchString(projectID) {
		return nil, fmt.Errorf("Vertex AI project ID contains invalid characters")
	}
	if !vertexResourceSegmentPattern.MatchString(location) {
		return nil, fmt.Errorf("Vertex AI location contains invalid characters")
	}
	if !vertexResourceSegmentPattern.MatchString(request.Model) {
		return nil, fmt.Errorf("Vertex AI model contains invalid characters")
	}
	token, err := a.vertexOAuthAccessToken()
	if err != nil {
		return nil, err
	}
	endpoint := vertexGenerateContentEndpoint(projectID, location, request.Model)
	headers := map[string]string{"Authorization": "Bearer " + token}
	return a.chatGeminiCompatible(request, endpoint, headers, "Vertex AI")
}

func vertexGenerateContentEndpoint(projectID, location, model string) string {
	host := location + "-aiplatform.googleapis.com"
	if location == "global" {
		host = "aiplatform.googleapis.com"
	}
	return fmt.Sprintf("https://%s/v1/projects/%s/locations/%s/publishers/google/models/%s:generateContent", host, projectID, location, model)
}

func (a *App) chatAnthropic(request ChatRequest) (*ChatResult, error) {
	endpoint := strings.TrimRight(request.Endpoint, "/")
	if endpoint == "" {
		endpoint = "https://api.anthropic.com/v1/messages"
	} else if !strings.HasSuffix(endpoint, "/messages") {
		endpoint += "/messages"
	}
	if request.EnableWebSearch && providerEndpointHost(endpoint) != "api.anthropic.com" {
		return nil, fmt.Errorf("native web search requires the official Anthropic endpoint")
	}
	headers := map[string]string{"anthropic-version": "2023-06-01", "x-api-key": request.APIKey}
	thinkingConfig := anthropicThinkingConfig(request.Model, request.EnableThinking)
	messages := make([]any, 0, len(request.Messages)+8)
	for _, message := range request.Messages {
		messages = append(messages, map[string]any{"role": message.Role, "content": anthropicMessageContent(message)})
	}
	tools := []map[string]any{}
	for _, definition := range chatToolDefinitions(request) {
		function, _ := definition["function"].(map[string]any)
		if function == nil {
			continue
		}
		tools = append(tools, map[string]any{"name": function["name"], "description": function["description"], "input_schema": function["parameters"]})
	}
	if request.EnableWebSearch {
		tools = append(tools, map[string]any{"type": "web_search_20250305", "name": "web_search"})
	}
	toolsUsed := []string{}
	if request.EnableWebSearch {
		toolsUsed = append(toolsUsed, "web_search")
	}
	thinkingUsed := []string{}
	usage := &ChatUsage{}
	webSources := map[string]string{}
	for iteration := 0; iteration < 8; iteration++ {
		maxTokens := 4096
		if thinkingConfig != nil {
			maxTokens = 16384
		}
		payload := map[string]any{"model": request.Model, "messages": messages, "max_tokens": maxTokens, "stream": true}
		if thinkingConfig != nil {
			payload["thinking"] = thinkingConfig
			if thinkingConfig["type"] == "adaptive" {
				payload["output_config"] = map[string]any{"effort": "high"}
			} else if len(tools) > 0 {
				headers["anthropic-beta"] = "interleaved-thinking-2025-05-14"
			}
		}
		if request.SystemPrompt != "" {
			payload["system"] = request.SystemPrompt
		}
		if len(tools) > 0 {
			payload["tools"] = tools
		}
		type toolUse struct {
			Index int
			ID    string
			Name  string
			Input strings.Builder
		}
		type thoughtBlock struct {
			Index     int
			Type      string
			Thinking  strings.Builder
			Signature strings.Builder
			Data      string
		}
		calls := map[int]*toolUse{}
		thoughtBlocks := map[int]*thoughtBlock{}
		var text, thinking strings.Builder
		if err := httpSSE(request.context(a.ctx), endpoint, headers, payload, func(data []byte) error {
			var event struct {
				Type         string `json:"type"`
				Index        int    `json:"index"`
				ContentBlock struct {
					Type      string         `json:"type"`
					ID        string         `json:"id"`
					Name      string         `json:"name"`
					Text      string         `json:"text"`
					Thinking  string         `json:"thinking"`
					Signature string         `json:"signature"`
					Data      string         `json:"data"`
					Input     map[string]any `json:"input"`
				} `json:"content_block"`
				Delta struct {
					Type        string `json:"type"`
					Text        string `json:"text"`
					Thinking    string `json:"thinking"`
					PartialJSON string `json:"partial_json"`
					Signature   string `json:"signature"`
					Citation    struct {
						URL   string `json:"url"`
						Title string `json:"title"`
					} `json:"citation"`
				} `json:"delta"`
				Error struct {
					Message string `json:"message"`
				} `json:"error"`
				Message struct {
					Usage struct {
						InputTokens          int `json:"input_tokens"`
						CacheReadInputTokens int `json:"cache_read_input_tokens"`
					} `json:"usage"`
				} `json:"message"`
				Usage struct {
					OutputTokens       int `json:"output_tokens"`
					OutputTokenDetails struct {
						ThinkingTokens int `json:"thinking_tokens"`
					} `json:"output_tokens_details"`
				} `json:"usage"`
			}
			if err := json.Unmarshal(data, &event); err != nil {
				return err
			}
			if event.Type == "error" {
				return fmt.Errorf("Anthropic stream error: %s", event.Error.Message)
			}
			if event.Type == "message_start" {
				usage.InputTokens += event.Message.Usage.InputTokens
				usage.CachedTokens += event.Message.Usage.CacheReadInputTokens
				usage.TotalTokens = usage.InputTokens + usage.OutputTokens
				a.emitChatUsage(request, *usage)
			}
			if event.Type == "message_delta" {
				usage.OutputTokens += event.Usage.OutputTokens
				usage.ThinkingTokens += event.Usage.OutputTokenDetails.ThinkingTokens
				usage.TotalTokens = usage.InputTokens + usage.OutputTokens
				a.emitChatUsage(request, *usage)
			}
			if event.Type == "content_block_start" {
				if event.ContentBlock.Type == "thinking" || event.ContentBlock.Type == "redacted_thinking" {
					block := &thoughtBlock{Index: event.Index, Type: event.ContentBlock.Type, Data: event.ContentBlock.Data}
					block.Thinking.WriteString(event.ContentBlock.Thinking)
					block.Signature.WriteString(event.ContentBlock.Signature)
					thoughtBlocks[event.Index] = block
				}
				if event.ContentBlock.Type == "tool_use" {
					call := &toolUse{Index: event.Index, ID: event.ContentBlock.ID, Name: event.ContentBlock.Name}
					if len(event.ContentBlock.Input) > 0 {
						encoded, _ := json.Marshal(event.ContentBlock.Input)
						call.Input.Write(encoded)
					}
					calls[event.Index] = call
				}
				if event.ContentBlock.Text != "" {
					text.WriteString(event.ContentBlock.Text)
					a.emitChatStream(request, "text", event.ContentBlock.Text, "")
				}
			}
			if event.Delta.Type == "input_json_delta" && event.Delta.PartialJSON != "" {
				if call := calls[event.Index]; call != nil {
					if call.Input.Len() == 2 && call.Input.String() == "{}" {
						call.Input.Reset()
					}
					call.Input.WriteString(event.Delta.PartialJSON)
				}
			}
			if event.Delta.Type == "text_delta" && event.Delta.Text != "" {
				text.WriteString(event.Delta.Text)
				a.emitChatStream(request, "text", event.Delta.Text, "")
			}
			if event.Delta.Type == "thinking_delta" && event.Delta.Thinking != "" {
				thinking.WriteString(event.Delta.Thinking)
				if block := thoughtBlocks[event.Index]; block != nil {
					block.Thinking.WriteString(event.Delta.Thinking)
				}
				a.emitChatStream(request, "thinking", event.Delta.Thinking, "")
			}
			if event.Delta.Type == "citations_delta" && event.Delta.Citation.URL != "" {
				webSources[event.Delta.Citation.URL] = event.Delta.Citation.Title
			}
			if event.Delta.Type == "signature_delta" && event.Delta.Signature != "" {
				if block := thoughtBlocks[event.Index]; block != nil {
					block.Signature.WriteString(event.Delta.Signature)
				}
			}
			return nil
		}); err != nil {
			return nil, err
		}
		if thinking.Len() > 0 {
			thinkingUsed = append(thinkingUsed, thinking.String())
		}
		if len(calls) == 0 {
			usage.TotalTokens = usage.InputTokens + usage.OutputTokens
			content := text.String()
			return &ChatResult{Content: content, Thinking: strings.Join(thinkingUsed, "\n\n"), ToolsUsed: toolsUsed, Usage: usage, WebSearchSources: webSearchSources(webSources)}, nil
		}
		assistantContent := []map[string]any{}
		thoughtIndexes := make([]int, 0, len(thoughtBlocks))
		for index := range thoughtBlocks {
			thoughtIndexes = append(thoughtIndexes, index)
		}
		sort.Ints(thoughtIndexes)
		for _, index := range thoughtIndexes {
			block := thoughtBlocks[index]
			if block.Type == "redacted_thinking" {
				assistantContent = append(assistantContent, map[string]any{"type": block.Type, "data": block.Data})
			} else {
				assistantContent = append(assistantContent, map[string]any{"type": "thinking", "thinking": block.Thinking.String(), "signature": block.Signature.String()})
			}
		}
		if text.Len() > 0 {
			assistantContent = append(assistantContent, map[string]any{"type": "text", "text": text.String()})
		}
		ordered := make([]*toolUse, 0, len(calls))
		maxIndex := 0
		for index := range calls {
			if index > maxIndex {
				maxIndex = index
			}
		}
		for index := 0; index <= maxIndex; index++ {
			if call := calls[index]; call != nil {
				ordered = append(ordered, call)
			}
		}
		toolResults := []map[string]any{}
		for _, call := range ordered {
			input := map[string]any{}
			if call.Input.Len() > 0 {
				if err := json.Unmarshal([]byte(call.Input.String()), &input); err != nil {
					input = map[string]any{"_raw": call.Input.String()}
				}
			}
			assistantContent = append(assistantContent, map[string]any{"type": "tool_use", "id": call.ID, "name": call.Name, "input": input})
			arguments, _ := json.Marshal(input)
			result, pending, err := a.executeChatTool(request, call.Name, string(arguments))
			toolsUsed = append(toolsUsed, call.Name)
			a.emitChatStream(request, "tool", "", call.Name)
			isError := err != nil
			if err != nil {
				result = map[string]any{"success": false, "error": err.Error()}
			}
			if pending != nil {
				return &ChatResult{Content: text.String(), PendingAction: pending, Thinking: strings.Join(thinkingUsed, "\n\n"), ToolsUsed: toolsUsed, Usage: usage}, nil
			}
			encoded, _ := json.Marshal(result)
			toolResults = append(toolResults, map[string]any{"type": "tool_result", "tool_use_id": call.ID, "content": string(encoded), "is_error": isError})
		}
		messages = append(messages, map[string]any{"role": "assistant", "content": assistantContent})
		messages = append(messages, map[string]any{"role": "user", "content": toolResults})
	}
	return nil, fmt.Errorf("Anthropic tool iteration limit exceeded")
}

func anthropicMessageContent(message ChatMessage) any {
	if len(message.Attachments) == 0 {
		return message.Content
	}
	parts := []map[string]any{{"type": "text", "text": message.Content}}
	for _, attachment := range message.Attachments {
		if strings.HasPrefix(attachment.MimeType, "image/") {
			parts = append(parts, map[string]any{"type": "image", "source": map[string]any{"type": "base64", "media_type": attachment.MimeType, "data": attachment.Data}})
		} else if attachment.MimeType == "application/pdf" {
			parts = append(parts, map[string]any{"type": "document", "source": map[string]any{"type": "base64", "media_type": attachment.MimeType, "data": attachment.Data}})
		} else {
			parts = append(parts, map[string]any{"type": "text", "text": fmt.Sprintf("[Binary attachment: %s (%s)]", attachment.Name, attachment.MimeType)})
		}
	}
	return parts
}
