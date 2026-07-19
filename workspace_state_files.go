package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"
)

var workspaceStateFileName = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
var workspaceStateFileMu sync.Mutex

func (a *App) workspaceStateFilePath(name string) (string, error) {
	if !workspaceStateFileName.MatchString(name) {
		return "", fmt.Errorf("invalid Workspace state file name")
	}
	base := a.GetWorkspacePath()
	if base == "" {
		return "", fmt.Errorf("Workspace is required for %s", name)
	}
	return filepath.Join(base, ".llm-hub", "state", name+".data"), nil
}

// ReadWorkspaceStateFile reads hidden application state owned by the active
// Workspace.
// An absent state file is represented by an empty string.
func (a *App) ReadWorkspaceStateFile(name string) (string, error) {
	path, err := a.workspaceStateFilePath(name)
	if err != nil {
		return "", err
	}
	content, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// WriteWorkspaceStateFile atomically stores hidden application state instead of
// browser localStorage.
func (a *App) WriteWorkspaceStateFile(name, content string) error {
	path, err := a.workspaceStateFilePath(name)
	if err != nil {
		return err
	}
	workspaceStateFileMu.Lock()
	defer workspaceStateFileMu.Unlock()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".state-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.WriteString(content); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return replaceRAGFile(temporaryPath, path)
}
