package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strings"
)

type codexRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type codexRPCMessage struct {
	ID     json.RawMessage `json:"id,omitempty"`
	Method string          `json:"method,omitempty"`
	Params json.RawMessage `json:"params,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *codexRPCError  `json:"error,omitempty"`
}

type codexTurnOutput struct {
	finalMessages []string
	messages      []string
	deltas        map[string]*strings.Builder
	deltaOrder    []string
	completedIDs  map[string]bool
	toolsUsed     []string
	toolSet       map[string]bool
	thinking      []string
	usage         ChatUsage
	onDelta       func(string, string)
	onTool        func(string)
}

func newCodexTurnOutput() *codexTurnOutput {
	return &codexTurnOutput{deltas: map[string]*strings.Builder{}, completedIDs: map[string]bool{}, toolSet: map[string]bool{}}
}

func (output *codexTurnOutput) addTool(name string) {
	name = strings.TrimSpace(name)
	if name == "" || output.toolSet[name] {
		return
	}
	output.toolSet[name] = true
	output.toolsUsed = append(output.toolsUsed, name)
	if output.onTool != nil {
		output.onTool(name)
	}
}

func (output *codexTurnOutput) addDelta(params json.RawMessage) {
	var value struct {
		ItemID string `json:"itemId"`
		Delta  string `json:"delta"`
	}
	if json.Unmarshal(params, &value) != nil || value.Delta == "" {
		return
	}
	builder := output.deltas[value.ItemID]
	if builder == nil {
		builder = &strings.Builder{}
		output.deltas[value.ItemID] = builder
		output.deltaOrder = append(output.deltaOrder, value.ItemID)
	}
	builder.WriteString(value.Delta)
	if output.onDelta != nil {
		output.onDelta("text", value.Delta)
	}
}

func (output *codexTurnOutput) addCompletedItem(params json.RawMessage) {
	var value struct {
		Item map[string]any `json:"item"`
	}
	if json.Unmarshal(params, &value) != nil {
		return
	}
	id, _ := value.Item["id"].(string)
	if id != "" && output.completedIDs[id] {
		return
	}
	if id != "" {
		output.completedIDs[id] = true
	}
	itemType, _ := value.Item["type"].(string)
	switch itemType {
	case "reasoning":
		if summary, ok := value.Item["summary"].([]any); ok {
			for _, raw := range summary {
				if entry, ok := raw.(string); ok && strings.TrimSpace(entry) != "" {
					output.thinking = append(output.thinking, entry)
				}
			}
		}
		return
	case "commandExecution":
		output.addTool("shell")
		return
	case "fileChange":
		output.addTool("file_change")
		return
	case "webSearch":
		output.addTool("web_search")
		return
	case "imageView":
		output.addTool("image_view")
		return
	case "mcpToolCall":
		server, _ := value.Item["server"].(string)
		tool, _ := value.Item["tool"].(string)
		output.addTool(strings.Trim(strings.Join([]string{server, tool}, ":"), ":"))
		return
	case "dynamicToolCall", "collabToolCall":
		tool, _ := value.Item["tool"].(string)
		output.addTool(tool)
		return
	case "agentMessage":
	default:
		return
	}
	text, _ := value.Item["text"].(string)
	if strings.TrimSpace(text) == "" {
		return
	}
	phase, _ := value.Item["phase"].(string)
	if phase == "final_answer" {
		output.finalMessages = append(output.finalMessages, text)
	} else {
		output.messages = append(output.messages, text)
	}
}

func (output *codexTurnOutput) addTurnItems(params json.RawMessage) (string, error) {
	var value struct {
		Turn struct {
			Status string           `json:"status"`
			Error  map[string]any   `json:"error"`
			Items  []map[string]any `json:"items"`
		} `json:"turn"`
	}
	if err := json.Unmarshal(params, &value); err != nil {
		return "", err
	}
	for _, item := range value.Turn.Items {
		encoded, _ := json.Marshal(map[string]any{"item": item})
		output.addCompletedItem(encoded)
	}
	if value.Turn.Status == "failed" {
		message, _ := value.Turn.Error["message"].(string)
		if message == "" {
			message = "Codex turn failed"
		}
		return value.Turn.Status, fmt.Errorf("%s", message)
	}
	if value.Turn.Status == "interrupted" {
		return value.Turn.Status, fmt.Errorf("Codex turn was interrupted")
	}
	return value.Turn.Status, nil
}

func (output *codexTurnOutput) text() string {
	if len(output.finalMessages) > 0 {
		return strings.TrimSpace(strings.Join(output.finalMessages, "\n\n"))
	}
	if len(output.messages) > 0 {
		return strings.TrimSpace(strings.Join(output.messages, "\n\n"))
	}
	var fallback strings.Builder
	for _, id := range output.deltaOrder {
		fallback.WriteString(output.deltas[id].String())
	}
	return strings.TrimSpace(fallback.String())
}

func (output *codexTurnOutput) thinkingText() string {
	return strings.TrimSpace(strings.Join(output.thinking, "\n\n"))
}

func writeCodexRPC(encoder *json.Encoder, message any) error {
	return encoder.Encode(message)
}

func respondToCodexServerRequest(encoder *json.Encoder, message codexRPCMessage) error {
	var result any
	switch message.Method {
	case "item/commandExecution/requestApproval", "item/fileChange/requestApproval":
		result = map[string]any{"decision": "decline"}
	case "item/permissions/requestApproval":
		result = map[string]any{"permissions": map[string]any{}}
	case "item/tool/requestUserInput":
		result = map[string]any{"answers": map[string]any{}}
	case "mcpServer/elicitation/request":
		result = map[string]any{"action": "cancel", "content": nil}
	default:
		return writeCodexRPC(encoder, map[string]any{"id": json.RawMessage(message.ID), "error": map[string]any{"code": -32601, "message": "Unsupported server request"}})
	}
	return writeCodexRPC(encoder, map[string]any{"id": json.RawMessage(message.ID), "result": result})
}

func readCodexMessage(scanner *bufio.Scanner) (codexRPCMessage, error) {
	for scanner.Scan() {
		var message codexRPCMessage
		if json.Unmarshal(scanner.Bytes(), &message) == nil {
			return message, nil
		}
	}
	if err := scanner.Err(); err != nil {
		return codexRPCMessage{}, err
	}
	return codexRPCMessage{}, io.EOF
}

func callCodexRPC(scanner *bufio.Scanner, encoder *json.Encoder, id int, method string, params any, output *codexTurnOutput) (json.RawMessage, error) {
	if err := writeCodexRPC(encoder, map[string]any{"method": method, "id": id, "params": params}); err != nil {
		return nil, err
	}
	expectedID := fmt.Sprintf("%d", id)
	for {
		message, err := readCodexMessage(scanner)
		if err != nil {
			return nil, err
		}
		if message.Method != "" && len(message.ID) > 0 {
			if err := respondToCodexServerRequest(encoder, message); err != nil {
				return nil, err
			}
			continue
		}
		if message.Method != "" {
			observeCodexNotification(output, message)
			continue
		}
		if strings.TrimSpace(string(message.ID)) != expectedID {
			continue
		}
		if message.Error != nil {
			return nil, fmt.Errorf("Codex app-server %s error %d: %s", method, message.Error.Code, message.Error.Message)
		}
		return message.Result, nil
	}
}

func observeCodexNotification(output *codexTurnOutput, message codexRPCMessage) {
	if output == nil {
		return
	}
	switch message.Method {
	case "thread/tokenUsage/updated":
		var value struct {
			TokenUsage struct {
				Last struct {
					TotalTokens           int `json:"totalTokens"`
					InputTokens           int `json:"inputTokens"`
					CachedInputTokens     int `json:"cachedInputTokens"`
					OutputTokens          int `json:"outputTokens"`
					ReasoningOutputTokens int `json:"reasoningOutputTokens"`
				} `json:"last"`
			} `json:"tokenUsage"`
		}
		if json.Unmarshal(message.Params, &value) == nil {
			last := value.TokenUsage.Last
			output.usage = ChatUsage{InputTokens: last.InputTokens, OutputTokens: last.OutputTokens, ThinkingTokens: last.ReasoningOutputTokens, TotalTokens: last.TotalTokens, CachedTokens: last.CachedInputTokens}
		}
	case "item/agentMessage/delta":
		output.addDelta(message.Params)
	case "item/reasoning/summaryTextDelta":
		var value struct {
			Delta string `json:"delta"`
		}
		if json.Unmarshal(message.Params, &value) == nil && value.Delta != "" && output.onDelta != nil {
			output.onDelta("thinking", value.Delta)
		}
	case "item/completed":
		output.addCompletedItem(message.Params)
	}
}

func codexThreadInfo(result json.RawMessage) (string, string) {
	var value struct {
		Thread struct {
			ID string `json:"id"`
		} `json:"thread"`
		Model string `json:"model"`
	}
	_ = json.Unmarshal(result, &value)
	return value.Thread.ID, value.Model
}

func (a *App) chatCodexAppServer(request ChatRequest) (*ChatResult, error) {
	invocation, err := resolveCLI("codex", request.CLIPath, []string{"app-server"})
	if err != nil {
		return nil, err
	}
	workingDirectory := a.GetWorkspacePath()
	if workingDirectory == "" {
		return nil, fmt.Errorf("active Workspace is not configured")
	}
	cmd := exec.Command(invocation.Command, invocation.Args...)
	cmd.Dir = workingDirectory
	cmd.Env = buildCLIEnvironment()
	configureCLIProcess(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	var stderr strings.Builder
	cmd.Stderr = &limitedWriter{writer: &stderr, remaining: 4 * 1024 * 1024}

	a.cliMu.Lock()
	if a.cliCmd != nil {
		a.cliMu.Unlock()
		return nil, fmt.Errorf("another CLI request is already running")
	}
	a.cliCmd = cmd
	a.cliMu.Unlock()
	if err := cmd.Start(); err != nil {
		a.cliMu.Lock()
		if a.cliCmd == cmd {
			a.cliCmd = nil
		}
		a.cliMu.Unlock()
		return nil, err
	}
	defer func() {
		_ = stdin.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
		a.cliMu.Lock()
		if a.cliCmd == cmd {
			a.cliCmd = nil
		}
		a.cliMu.Unlock()
	}()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)
	encoder := json.NewEncoder(stdin)
	if _, err := callCodexRPC(scanner, encoder, 1, "initialize", map[string]any{"clientInfo": map[string]any{"name": "gemihub_desktop", "title": appName, "version": "1.0.0"}}, nil); err != nil {
		return nil, codexAppServerError(err, stderr.String())
	}
	if err := writeCodexRPC(encoder, map[string]any{"method": "initialized", "params": map[string]any{}}); err != nil {
		return nil, err
	}

	threadParams := map[string]any{
		"cwd":                   workingDirectory,
		"approvalPolicy":        "never",
		"sandbox":               "workspace-write",
		"developerInstructions": request.SystemPrompt,
	}
	if request.Model != "" {
		threadParams["model"] = request.Model
	}
	threadMethod := "thread/start"
	if request.CLISessionID != "" {
		threadMethod = "thread/resume"
		threadParams["threadId"] = request.CLISessionID
	}
	threadResult, err := callCodexRPC(scanner, encoder, 2, threadMethod, threadParams, nil)
	if err != nil {
		return nil, codexAppServerError(err, stderr.String())
	}
	threadID, activeModel := codexThreadInfo(threadResult)
	if threadID == "" {
		threadID = request.CLISessionID
	}
	if threadID == "" {
		return nil, fmt.Errorf("Codex app-server returned no thread ID")
	}

	prompt := latestUserMessage(request.Messages)
	if request.CLISessionID == "" && len(request.Messages) > 1 {
		prompt = formatCLIHistory(request.Messages, "")
	}
	if strings.TrimSpace(prompt) == "" {
		return nil, fmt.Errorf("Codex app-server requires a user message")
	}
	turnParams := map[string]any{
		"threadId":       threadID,
		"input":          []map[string]any{{"type": "text", "text": prompt}},
		"cwd":            workingDirectory,
		"approvalPolicy": "never",
		"sandboxPolicy":  map[string]any{"type": "workspaceWrite", "writableRoots": []string{}, "networkAccess": false},
		"summary":        "auto",
	}
	if request.Model != "" {
		turnParams["model"] = request.Model
	}
	output := newCodexTurnOutput()
	output.onDelta = func(eventType, delta string) { a.emitChatStream(request, eventType, delta, "") }
	output.onTool = func(tool string) { a.emitChatStream(request, "tool", "", tool) }
	if _, err := callCodexRPC(scanner, encoder, 3, "turn/start", turnParams, output); err != nil {
		return nil, codexAppServerError(err, stderr.String())
	}
	for {
		message, err := readCodexMessage(scanner)
		if err != nil {
			return nil, codexAppServerError(err, stderr.String())
		}
		if message.Method != "" && len(message.ID) > 0 {
			if err := respondToCodexServerRequest(encoder, message); err != nil {
				return nil, err
			}
			continue
		}
		observeCodexNotification(output, message)
		if message.Method != "turn/completed" {
			continue
		}
		if _, err := output.addTurnItems(message.Params); err != nil {
			return nil, err
		}
		content := output.text()
		if content == "" {
			return nil, fmt.Errorf("Codex app-server returned no response")
		}
		return &ChatResult{Content: content, CLISessionID: threadID, Model: activeModel, ToolsUsed: output.toolsUsed, Thinking: output.thinkingText(), Usage: &output.usage}, nil
	}
}

func codexAppServerError(err error, stderr string) error {
	if diagnostic := strings.TrimSpace(stderr); diagnostic != "" {
		return fmt.Errorf("%v: %s", err, diagnostic)
	}
	return err
}
