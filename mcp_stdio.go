package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type MCPStdioStartRequest struct {
	Name       string            `json:"name"`
	Command    string            `json:"command"`
	Args       []string          `json:"args"`
	Env        map[string]string `json:"env"`
	CWD        string            `json:"cwd"`
	PluginRoot string            `json:"pluginRoot"`
	PluginData string            `json:"pluginData"`
	Framing    string            `json:"framing"`
}

type mcpStdioSession struct {
	mu      sync.Mutex
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	stdout  *bufio.Reader
	stderr  bytes.Buffer
	framing string
	nextID  int64
}

func (a *App) MCPStdioStart(request MCPStdioStartRequest) (string, error) {
	command := strings.TrimSpace(request.Command)
	if command == "" {
		return "", fmt.Errorf("MCP stdio command is required")
	}
	pluginRoot, pluginData := "", ""
	var err error
	if request.PluginRoot != "" {
		if request.PluginData == "" {
			return "", fmt.Errorf("Agent Plugin data path is required")
		}
		pluginRoot, err = a.workspacePath(request.PluginRoot, false)
		if err != nil {
			return "", fmt.Errorf("invalid Agent Plugin root: %w", err)
		}
		pluginData, err = a.workspacePath(request.PluginData, true)
		if err != nil {
			return "", fmt.Errorf("invalid Agent Plugin data path: %w", err)
		}
		if err := os.MkdirAll(pluginData, 0o755); err != nil {
			return "", err
		}
	}
	resolved := ""
	if filepath.IsAbs(command) {
		resolved, err = filepath.EvalSymlinks(command)
		if err == nil && pluginRoot != "" {
			err = requirePathInside(pluginRoot, resolved)
		}
	} else {
		resolved, err = exec.LookPath(command)
	}
	if err != nil {
		return "", fmt.Errorf("MCP stdio command is invalid or not found: %s", command)
	}
	cmd := exec.Command(resolved, request.Args...)
	cmd.Dir = a.GetDirectoryBase()
	if request.CWD != "" {
		resolvedCWD, resolveErr := filepath.Abs(request.CWD)
		if resolveErr != nil {
			return "", resolveErr
		}
		if pluginRoot != "" {
			insideRoot := requirePathInside(pluginRoot, resolvedCWD) == nil
			insideData := requirePathInside(pluginData, resolvedCWD) == nil
			if !insideRoot && !insideData {
				return "", fmt.Errorf("Agent Plugin cwd is outside PLUGIN_ROOT and PLUGIN_DATA")
			}
			if insideData {
				if err := os.MkdirAll(resolvedCWD, 0o755); err != nil {
					return "", err
				}
			}
		}
		cmd.Dir = resolvedCWD
	}
	cmd.Env = os.Environ()
	for key, value := range request.Env {
		if strings.ContainsAny(key, "=\x00") {
			return "", fmt.Errorf("invalid MCP environment variable name: %s", key)
		}
		if pluginRoot != "" && (strings.EqualFold(key, "PLUGIN_ROOT") || strings.EqualFold(key, "PLUGIN_DATA")) {
			return "", fmt.Errorf("reserved Agent Plugin environment variable: %s", key)
		}
		cmd.Env = append(cmd.Env, key+"="+value)
	}
	if pluginRoot != "" {
		cmd.Env = append(cmd.Env, "PLUGIN_ROOT="+pluginRoot, "PLUGIN_DATA="+pluginData)
	}
	configureCLIProcess(cmd)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	session := &mcpStdioSession{cmd: cmd, stdin: stdin, stdout: bufio.NewReaderSize(stdout, 64*1024), framing: request.Framing, nextID: 1}
	cmd.Stderr = &limitedWriter{writer: &session.stderr, remaining: 4 * 1024 * 1024}
	if session.framing != "newline" {
		session.framing = "content-length"
	}
	if err := cmd.Start(); err != nil {
		return "", err
	}
	sessionID := fmt.Sprintf("mcp-stdio-%d", time.Now().UnixNano())
	a.mcpStdioMu.Lock()
	a.mcpStdio[sessionID] = session
	a.mcpStdioMu.Unlock()
	return sessionID, nil
}

func (a *App) MCPStdioRequest(sessionID, method, paramsJSON string) (string, error) {
	a.mcpStdioMu.Lock()
	session := a.mcpStdio[sessionID]
	a.mcpStdioMu.Unlock()
	if session == nil {
		return "", fmt.Errorf("MCP stdio session not found")
	}
	type result struct {
		value string
		err   error
	}
	done := make(chan result, 1)
	go func() {
		value, err := session.request(method, paramsJSON)
		done <- result{value: value, err: err}
	}()
	select {
	case response := <-done:
		return response.value, response.err
	case <-time.After(2 * time.Minute):
		a.MCPStdioClose(sessionID)
		return "", fmt.Errorf("MCP stdio request timed out: %s", method)
	}
}

func (session *mcpStdioSession) request(method, paramsJSON string) (string, error) {
	session.mu.Lock()
	defer session.mu.Unlock()
	params := map[string]any{}
	if strings.TrimSpace(paramsJSON) != "" {
		if err := json.Unmarshal([]byte(paramsJSON), &params); err != nil {
			return "", fmt.Errorf("invalid MCP params: %w", err)
		}
	}
	notification := strings.HasPrefix(method, "notifications/")
	payload := map[string]any{"jsonrpc": "2.0", "method": method, "params": params}
	requestID := session.nextID
	if !notification {
		payload["id"] = requestID
		session.nextID++
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	if err := session.writeFrame(encoded); err != nil {
		return "", err
	}
	if notification {
		return `{}`, nil
	}
	for {
		frame, err := session.readFrame()
		if err != nil {
			stderr := strings.TrimSpace(session.stderr.String())
			if stderr != "" {
				return "", fmt.Errorf("%w: %s", err, stderr)
			}
			return "", err
		}
		var response map[string]any
		if json.Unmarshal(frame, &response) != nil {
			continue
		}
		id, exists := response["id"]
		if !exists || int64(numberValue(id)) != requestID {
			continue
		}
		return string(frame), nil
	}
}

func numberValue(value any) float64 {
	switch typed := value.(type) {
	case float64:
		return typed
	case json.Number:
		result, _ := typed.Float64()
		return result
	default:
		return -1
	}
}

func (session *mcpStdioSession) writeFrame(payload []byte) error {
	if session.framing == "newline" {
		_, err := session.stdin.Write(append(payload, '\n'))
		return err
	}
	_, err := fmt.Fprintf(session.stdin, "Content-Length: %d\r\n\r\n", len(payload))
	if err == nil {
		_, err = session.stdin.Write(payload)
	}
	return err
}

func (session *mcpStdioSession) readFrame() ([]byte, error) {
	if session.framing == "newline" {
		for {
			line, err := session.stdout.ReadBytes('\n')
			if err != nil {
				return nil, err
			}
			line = bytes.TrimSpace(line)
			if len(line) > 0 {
				return line, nil
			}
		}
	}
	length := -1
	for {
		line, err := session.stdout.ReadString('\n')
		if err != nil {
			return nil, err
		}
		line = strings.TrimSpace(line)
		if line == "" {
			break
		}
		if key, value, ok := strings.Cut(line, ":"); ok && strings.EqualFold(strings.TrimSpace(key), "Content-Length") {
			length, err = strconv.Atoi(strings.TrimSpace(value))
			if err != nil || length < 0 || length > 16*1024*1024 {
				return nil, fmt.Errorf("invalid MCP Content-Length")
			}
		}
	}
	if length < 0 {
		return nil, fmt.Errorf("MCP response is missing Content-Length")
	}
	payload := make([]byte, length)
	_, err := io.ReadFull(session.stdout, payload)
	return payload, err
}

func (a *App) MCPStdioClose(sessionID string) bool {
	a.mcpStdioMu.Lock()
	session := a.mcpStdio[sessionID]
	delete(a.mcpStdio, sessionID)
	a.mcpStdioMu.Unlock()
	if session == nil {
		return false
	}
	_ = session.stdin.Close()
	if session.cmd.Process != nil {
		_ = session.cmd.Process.Kill()
	}
	_, _ = session.cmd.Process.Wait()
	return true
}

func (a *App) closeAllMCPStdio() {
	a.mcpStdioMu.Lock()
	ids := make([]string, 0, len(a.mcpStdio))
	for id := range a.mcpStdio {
		ids = append(ids, id)
	}
	a.mcpStdioMu.Unlock()
	for _, id := range ids {
		a.MCPStdioClose(id)
	}
}
