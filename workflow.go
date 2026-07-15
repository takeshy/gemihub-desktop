package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

type WorkflowShellRequest struct {
	Command   string            `json:"command"`
	Args      []string          `json:"args"`
	Cwd       string            `json:"cwd"`
	Env       map[string]string `json:"env"`
	TimeoutMS int               `json:"timeoutMs"`
}

type WorkflowShellResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
}

// ExecuteWorkflowShell runs an explicitly-authored workflow shell node. The
// working directory remains confined to DirectoryBase, including symlink
// resolution performed by directoryPath.
func (a *App) ExecuteWorkflowShell(request WorkflowShellRequest) (*WorkflowShellResult, error) {
	command := strings.TrimSpace(request.Command)
	if command == "" {
		return nil, fmt.Errorf("shell command is required")
	}
	timeout := request.TimeoutMS
	if timeout <= 0 {
		timeout = 60_000
	}
	if timeout > 30*60_000 {
		timeout = 30 * 60_000
	}
	ctx, cancel := context.WithTimeout(a.ctx, time.Duration(timeout)*time.Millisecond)
	defer cancel()
	cmd := exec.CommandContext(ctx, command, request.Args...)
	cmd.Dir = a.GetDirectoryBase()
	if strings.TrimSpace(request.Cwd) != "" {
		cwd, err := a.directoryPath(request.Cwd, false)
		if err != nil {
			return nil, err
		}
		info, err := os.Stat(cwd)
		if err != nil || !info.IsDir() {
			return nil, fmt.Errorf("shell cwd is not a directory")
		}
		cmd.Dir = cwd
	}
	if cmd.Dir == "" {
		return nil, fmt.Errorf("directory base is not configured")
	}
	cmd.Env = os.Environ()
	for key, value := range request.Env {
		if strings.ContainsAny(key, "=\x00") || strings.ContainsRune(value, '\x00') {
			return nil, fmt.Errorf("invalid environment variable")
		}
		cmd.Env = append(cmd.Env, key+"="+value)
	}
	// Preserve the source workflow contract while naming the DirectoryBase
	// explicitly for new workflows.
	cmd.Env = append(cmd.Env, "VAULT_PATH="+cmd.Dir, "DIRECTORY_BASE="+cmd.Dir)
	var stdout, stderr strings.Builder
	cmd.Stdout = &limitedWriter{writer: &stdout, remaining: 4 * 1024 * 1024}
	cmd.Stderr = &limitedWriter{writer: &stderr, remaining: 4 * 1024 * 1024}
	err := cmd.Run()
	result := &WorkflowShellResult{Stdout: stdout.String(), Stderr: stderr.String()}
	if err == nil {
		return result, nil
	}
	if ctx.Err() == context.DeadlineExceeded {
		return result, fmt.Errorf("shell command timed out after %d ms", timeout)
	}
	if exitError, ok := err.(*exec.ExitError); ok {
		result.ExitCode = exitError.ExitCode()
		return result, nil
	}
	return result, err
}
