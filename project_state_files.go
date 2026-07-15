package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sync"
)

var projectStateFileName = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]*$`)
var projectStateFileMu sync.Mutex

func (a *App) projectStateFilePath(name string) (string, error) {
	if !projectStateFileName.MatchString(name) {
		return "", fmt.Errorf("invalid project state file name")
	}
	base := a.GetActiveProjectPath()
	if base == "" {
		if name != "chat-history" {
			return "", fmt.Errorf("project is required for %s", name)
		}
		config, err := a.projectsConfigDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(config, "Session")
	}
	return filepath.Join(base, ".llm-hub", "state", name+".data"), nil
}

// ReadProjectStateFile reads hidden application state owned by the active
// Project. Chat history falls back to the persistent project-less Session.
// An absent state file is represented by an empty string.
func (a *App) ReadProjectStateFile(name string) (string, error) {
	path, err := a.projectStateFilePath(name)
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

// WriteProjectStateFile atomically stores hidden application state instead of
// browser localStorage. Only Chat history is valid without an active Project.
func (a *App) WriteProjectStateFile(name, content string) error {
	path, err := a.projectStateFilePath(name)
	if err != nil {
		return err
	}
	projectStateFileMu.Lock()
	defer projectStateFileMu.Unlock()
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
