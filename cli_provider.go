package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type CLIVerifyResult struct {
	Success bool   `json:"success"`
	Path    string `json:"path,omitempty"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

type cliInvocation struct {
	Command string
	Args    []string
}

func (a *App) SelectCLIPath() (string, error) {
	return wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select CLI executable",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "CLI programs", Pattern: "*.exe;*.js;*.cmd;*.bat;*"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	})
}

func (a *App) VerifyCLI(kind, customPath string) (*CLIVerifyResult, error) {
	invocation, err := resolveCLI(kind, customPath, []string{"--version"})
	if err != nil {
		return &CLIVerifyResult{Success: false, Error: err.Error()}, nil
	}
	ctx, cancel := context.WithTimeout(a.ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, invocation.Command, invocation.Args...)
	configureCLIProcess(cmd)
	output, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return &CLIVerifyResult{Success: false, Path: invocation.Command, Error: "CLI version check timed out"}, nil
	}
	if err != nil {
		return &CLIVerifyResult{Success: false, Path: invocation.Command, Error: cliError(kind, err, string(output))}, nil
	}
	if kind == "codex" {
		appServer, resolveErr := resolveCLI(kind, customPath, []string{"app-server", "--help"})
		if resolveErr != nil {
			return &CLIVerifyResult{Success: false, Path: invocation.Command, Error: resolveErr.Error()}, nil
		}
		appServerCmd := exec.CommandContext(ctx, appServer.Command, appServer.Args...)
		configureCLIProcess(appServerCmd)
		if appServerOutput, appServerErr := appServerCmd.CombinedOutput(); appServerErr != nil {
			return &CLIVerifyResult{Success: false, Path: invocation.Command, Error: "Codex App Server is unavailable: " + cliError(kind, appServerErr, string(appServerOutput))}, nil
		}
	}
	return &CLIVerifyResult{Success: true, Path: invocation.Command, Version: strings.TrimSpace(string(output))}, nil
}

func (a *App) chatCLI(request ChatRequest) (*ChatResult, error) {
	if request.CLIType == "codex" {
		return a.chatCodexAppServer(request)
	}
	prompt := formatCLIHistory(request.Messages, request.SystemPrompt)
	latestPrompt := latestUserMessage(request.Messages)
	var args []string
	switch request.CLIType {
	case "claude":
		if request.CLISessionID != "" {
			args = []string{"--resume", request.CLISessionID, "-p", latestPrompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages"}
		} else {
			args = []string{"-p", prompt, "--output-format", "stream-json", "--verbose", "--include-partial-messages"}
		}
	case "antigravity":
		args = []string{"--print", prompt}
	default:
		return nil, fmt.Errorf("unknown CLI provider: %s", request.CLIType)
	}
	invocation, err := resolveCLI(request.CLIType, request.CLIPath, args)
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
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	var stdoutPipe io.ReadCloser
	if request.CLIType == "claude" && request.StreamID != "" {
		stdoutPipe, err = cmd.StdoutPipe()
		if err != nil {
			return nil, err
		}
	} else {
		cmd.Stdout = &limitedWriter{writer: &stdout, remaining: 16 * 1024 * 1024}
	}
	cmd.Stderr = &limitedWriter{writer: &stderr, remaining: 4 * 1024 * 1024}

	a.cliMu.Lock()
	if a.cliCmd != nil {
		a.cliMu.Unlock()
		return nil, fmt.Errorf("another CLI request is already running")
	}
	a.cliCmd = cmd
	a.cliMu.Unlock()

	if stdoutPipe != nil {
		err = cmd.Start()
		if err == nil {
			waited := false
			scanner := bufio.NewScanner(stdoutPipe)
			scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
			for scanner.Scan() {
				line := append([]byte(nil), scanner.Bytes()...)
				_, _ = stdout.Write(line)
				_ = stdout.WriteByte('\n')
				var event struct {
					Type  string `json:"type"`
					Event struct {
						Type  string `json:"type"`
						Delta struct {
							Type     string `json:"type"`
							Text     string `json:"text"`
							Thinking string `json:"thinking"`
						} `json:"delta"`
					} `json:"event"`
				}
				if json.Unmarshal(line, &event) == nil && event.Type == "stream_event" && event.Event.Type == "content_block_delta" {
					if event.Event.Delta.Type == "text_delta" {
						a.emitChatStream(request, "text", event.Event.Delta.Text, "")
					}
					if event.Event.Delta.Type == "thinking_delta" {
						a.emitChatStream(request, "thinking", event.Event.Delta.Thinking, "")
					}
				}
			}
			if scanErr := scanner.Err(); scanErr != nil {
				err = scanErr
				if cmd.Process != nil {
					_ = cmd.Process.Kill()
				}
			} else {
				err = cmd.Wait()
				waited = true
			}
			if !waited {
				_ = cmd.Wait()
			}
		}
	} else {
		err = cmd.Run()
	}
	a.cliMu.Lock()
	if a.cliCmd == cmd {
		a.cliCmd = nil
	}
	a.cliMu.Unlock()
	if err != nil {
		return nil, fmt.Errorf("%s", cliError(request.CLIType, err, stderr.String()))
	}
	content, sessionID, toolsUsed, thinking := parseCLIResponseDetailed(request.CLIType, stdout.String())
	if strings.TrimSpace(content) == "" {
		if diagnostic := strings.TrimSpace(stderr.String()); diagnostic != "" {
			return nil, fmt.Errorf("CLI returned no response: %s", diagnostic)
		}
		return nil, fmt.Errorf("CLI returned no response")
	}
	if sessionID == "" {
		sessionID = request.CLISessionID
	}
	return &ChatResult{Content: content, CLISessionID: sessionID, ToolsUsed: toolsUsed, Thinking: thinking}, nil
}

func (a *App) shutdown(_ context.Context) {
	a.StopDiscordBot()
	a.StopCLI()
	a.closeAllMCPStdio()
}

func (a *App) StopCLI() bool {
	a.cliMu.Lock()
	defer a.cliMu.Unlock()
	if a.cliCmd == nil || a.cliCmd.Process == nil {
		return false
	}
	_ = a.cliCmd.Process.Kill()
	return true
}

type limitedWriter struct {
	writer    io.Writer
	remaining int64
}

func (w *limitedWriter) Write(data []byte) (int, error) {
	original := len(data)
	if w.remaining <= 0 {
		return original, nil
	}
	if int64(len(data)) > w.remaining {
		data = data[:w.remaining]
	}
	_, err := w.writer.Write(data)
	w.remaining -= int64(len(data))
	return original, err
}

func formatCLIHistory(messages []ChatMessage, systemPrompt string) string {
	parts := make([]string, 0, len(messages)+1)
	if strings.TrimSpace(systemPrompt) != "" {
		parts = append(parts, "System: "+systemPrompt)
	}
	for _, message := range messages {
		role := "Assistant"
		if message.Role == "user" {
			role = "User"
		}
		parts = append(parts, role+": "+message.Content)
	}
	return strings.Join(parts, "\n\n")
}

func latestUserMessage(messages []ChatMessage) string {
	for index := len(messages) - 1; index >= 0; index-- {
		if messages[index].Role == "user" {
			return messages[index].Content
		}
	}
	return ""
}

func resolveCLI(kind, customPath string, args []string) (*cliInvocation, error) {
	if customPath != "" {
		absolute, err := filepath.Abs(customPath)
		if err != nil {
			return nil, err
		}
		info, err := os.Stat(absolute)
		if err != nil || info.IsDir() {
			return nil, fmt.Errorf("CLI path is not a file: %s", absolute)
		}
		extension := strings.ToLower(filepath.Ext(absolute))
		if extension == ".js" {
			node, err := findNodeBinary()
			if err != nil {
				return nil, err
			}
			return &cliInvocation{Command: node, Args: append([]string{absolute}, args...)}, nil
		}
		if runtime.GOOS == "windows" && (extension == ".cmd" || extension == ".bat") {
			return nil, fmt.Errorf("select the package's .js entry point or standalone .exe instead of a .cmd/.bat wrapper")
		}
		return &cliInvocation{Command: absolute, Args: args}, nil
	}

	if runtime.GOOS == "windows" {
		if script := windowsNPMCLIScript(kind); script != "" {
			node, err := findNodeBinary()
			if err == nil {
				return &cliInvocation{Command: node, Args: append([]string{script}, args...)}, nil
			}
		}
		if kind == "claude" {
			if local := os.Getenv("LOCALAPPDATA"); local != "" {
				candidate := filepath.Join(local, "Programs", "claude", "claude.exe")
				if fileExists(candidate) {
					return &cliInvocation{Command: candidate, Args: args}, nil
				}
			}
		}
		if kind == "antigravity" {
			if local := os.Getenv("LOCALAPPDATA"); local != "" {
				candidate := filepath.Join(local, "agy", "bin", "agy.exe")
				if fileExists(candidate) {
					return &cliInvocation{Command: candidate, Args: args}, nil
				}
			}
		}
	}
	commandName := map[string]string{"antigravity": "agy", "claude": "claude", "codex": "codex"}[kind]
	if commandName == "" {
		return nil, fmt.Errorf("unknown CLI provider: %s", kind)
	}
	command, err := exec.LookPath(commandName)
	if err != nil {
		return nil, fmt.Errorf("%s CLI not found in PATH", commandName)
	}
	if runtime.GOOS == "windows" {
		extension := strings.ToLower(filepath.Ext(command))
		if extension == ".cmd" || extension == ".bat" {
			return nil, fmt.Errorf("%s resolved to a shell wrapper; configure its .js entry point or standalone .exe", commandName)
		}
	}
	return &cliInvocation{Command: command, Args: args}, nil
}

func windowsNPMCLIScript(kind string) string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return ""
	}
	relative := map[string]string{
		"claude": filepath.Join("@anthropic-ai", "claude-code", "cli.js"),
		"codex":  filepath.Join("@openai", "codex", "bin", "codex.js"),
	}[kind]
	if relative == "" {
		return ""
	}
	candidate := filepath.Join(appData, "npm", "node_modules", relative)
	if fileExists(candidate) {
		return candidate
	}
	return ""
}

func findNodeBinary() (string, error) {
	if node, err := exec.LookPath("node"); err == nil {
		return node, nil
	}
	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, ".local", "share", "mise", "shims", "node"),
		filepath.Join(home, ".volta", "bin", "node"),
		filepath.Join(home, ".nodenv", "shims", "node"),
		"/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node",
	}
	if runtime.GOOS == "windows" {
		candidates = append([]string{filepath.Join(os.Getenv("ProgramFiles"), "nodejs", "node.exe")}, candidates...)
	}
	for _, candidate := range candidates {
		if fileExists(candidate) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("node executable not found")
}

func buildCLIEnvironment() []string {
	environment := make([]string, 0, len(os.Environ())+1)
	for _, item := range os.Environ() {
		if !strings.EqualFold(strings.SplitN(item, "=", 2)[0], "PATH") {
			environment = append(environment, item)
		}
	}
	home, _ := os.UserHomeDir()
	extra := []string{
		filepath.Join(home, ".local", "bin"), filepath.Join(home, ".bun", "bin"),
		filepath.Join(home, ".volta", "bin"), filepath.Join(home, ".nodenv", "shims"),
		filepath.Join(home, ".local", "share", "mise", "shims"),
	}
	pathValue := os.Getenv("PATH")
	return append(environment, "PATH="+strings.Join(append(extra, pathValue), string(os.PathListSeparator)))
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func parseCLIResponse(kind, output string) (string, string) {
	content, sessionID, _, _ := parseCLIResponseDetailed(kind, output)
	return content, sessionID
}

func parseCLIResponseDetailed(kind, output string) (string, string, []string, string) {
	if kind == "antigravity" {
		return strings.TrimSpace(output), "", nil, ""
	}
	var result strings.Builder
	var sessionID string
	toolsUsed := []string{}
	toolSet := map[string]bool{}
	var thinking strings.Builder
	scanner := bufio.NewScanner(strings.NewReader(output))
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		var event map[string]any
		if json.Unmarshal(scanner.Bytes(), &event) != nil {
			continue
		}
		if kind == "claude" {
			if value, ok := event["session_id"].(string); ok {
				sessionID = value
			}
			if data, ok := event["data"].(map[string]any); ok {
				if value, ok := data["session_id"].(string); ok {
					sessionID = value
				}
			}
			if event["type"] == "assistant" {
				if message, ok := event["message"].(map[string]any); ok {
					if blocks, ok := message["content"].([]any); ok {
						for _, raw := range blocks {
							if block, ok := raw.(map[string]any); ok {
								if block["type"] == "text" {
									if text, ok := block["text"].(string); ok {
										result.WriteString(text)
									}
								}
								if block["type"] == "tool_use" {
									if name, ok := block["name"].(string); ok && name != "" && !toolSet[name] {
										toolSet[name] = true
										toolsUsed = append(toolsUsed, name)
									}
								}
								if block["type"] == "thinking" {
									if value, ok := block["thinking"].(string); ok {
										thinking.WriteString(value)
									}
								}
							}
						}
					}
				}
			}
		}
	}
	return strings.TrimSpace(result.String()), sessionID, toolsUsed, strings.TrimSpace(thinking.String())
}

func cliError(kind string, runErr error, diagnostic string) string {
	diagnostic = strings.TrimSpace(diagnostic)
	if diagnostic != "" {
		return diagnostic
	}
	return fmt.Sprintf("%s CLI failed: %v", kind, runErr)
}
