package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Workspace struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
}

type WorkspaceState struct {
	ActiveWorkspaceID string      `json:"activeWorkspaceId"`
	Workspaces        []Workspace `json:"workspaces"`
}

func (a *App) workspaceConfigDirPath() (string, error) {
	if a.workspaceConfigDir != "" {
		return a.workspaceConfigDir, nil
	}
	config, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(config, appID), nil
}

func (a *App) defaultWorkspacePath(configDir string) (string, error) {
	// Tests and embedded callers can isolate all generated data by overriding
	// the config directory. Production workspaces belong somewhere users can
	// reach directly from Explorer or Finder.
	if a.workspaceConfigDir != "" {
		return filepath.Join(configDir, "GemiHub Workspace"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Documents", "GemiHub Workspace"), nil
}

var workspaceResourceDirectories = []string{"Dashboards", "Memos", "Secrets", "skills", "workflows"}

var workspaceDefaultDirectories = []string{
	filepath.Join("Dashboards", "Timeline", "Timeline"),
}

func ensureWorkspaceLayout(path string) error {
	for _, dir := range workspaceResourceDirectories {
		if err := os.MkdirAll(filepath.Join(path, dir), 0o755); err != nil {
			return err
		}
	}
	for _, dir := range workspaceDefaultDirectories {
		if err := os.MkdirAll(filepath.Join(path, dir), 0o755); err != nil {
			return err
		}
	}
	return nil
}

func normalizedWorkspacePath(path string) (string, error) {
	abs, err := filepath.Abs(strings.TrimSpace(path))
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", err
	}
	return filepath.Clean(real), nil
}

func (a *App) saveWorkspacesLocked() error {
	dir, err := a.workspaceConfigDirPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(a.workspaceState, "", "  ")
	if err != nil {
		return err
	}
	temp := filepath.Join(dir, "workspace.json.tmp")
	if err := os.WriteFile(temp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, filepath.Join(dir, "workspace.json"))
}

func (a *App) initializeWorkspaces() error {
	a.workspaceMu.Lock()
	defer a.workspaceMu.Unlock()
	dir, err := a.workspaceConfigDirPath()
	if err != nil {
		return err
	}
	configPath := filepath.Join(dir, "workspace.json")
	if data, readErr := os.ReadFile(configPath); readErr == nil {
		if err := json.Unmarshal(data, &a.workspaceState); err != nil {
			return fmt.Errorf("read workspace: %w", err)
		}
	} else if !os.IsNotExist(readErr) {
		return readErr
	}
	var selected *Workspace
	for index := range a.workspaceState.Workspaces {
		if a.workspaceState.Workspaces[index].ID == a.workspaceState.ActiveWorkspaceID {
			workspace := a.workspaceState.Workspaces[index]
			selected = &workspace
			break
		}
	}
	if selected == nil && len(a.workspaceState.Workspaces) > 0 {
		workspace := a.workspaceState.Workspaces[0]
		selected = &workspace
	}
	if selected == nil {
		defaultPath, err := a.defaultWorkspacePath(dir)
		if err != nil {
			return err
		}
		path, err := normalizedWorkspacePath(defaultPath)
		if err != nil {
			return err
		}
		selected = &Workspace{ID: "workspace", Name: "Workspace", Path: path, CreatedAt: time.Now().UnixMilli()}
	}
	path, err := normalizedWorkspacePath(selected.Path)
	if err != nil {
		return err
	}
	if err := ensureWorkspaceLayout(path); err != nil {
		return err
	}
	workspace := Workspace{ID: "workspace", Name: "Workspace", Path: path, CreatedAt: selected.CreatedAt}
	if workspace.CreatedAt == 0 {
		workspace.CreatedAt = time.Now().UnixMilli()
	}
	a.workspaceState = WorkspaceState{ActiveWorkspaceID: workspace.ID, Workspaces: []Workspace{workspace}}
	if err := a.saveWorkspacesLocked(); err != nil {
		return err
	}
	return nil
}

func (a *App) GetWorkspacePath() string {
	a.workspaceMu.Lock()
	defer a.workspaceMu.Unlock()
	for _, workspace := range a.workspaceState.Workspaces {
		if workspace.ID == a.workspaceState.ActiveWorkspaceID {
			return workspace.Path
		}
	}
	return ""
}

func (a *App) GetWorkspaceState() WorkspaceState {
	a.workspaceMu.Lock()
	defer a.workspaceMu.Unlock()
	return WorkspaceState{ActiveWorkspaceID: a.workspaceState.ActiveWorkspaceID, Workspaces: append([]Workspace(nil), a.workspaceState.Workspaces...)}
}

func (a *App) SetWorkspaceDirectory(path string) (WorkspaceState, error) {
	a.workspaceMu.Lock()
	defer a.workspaceMu.Unlock()
	normalized, err := normalizedWorkspacePath(path)
	if err != nil {
		return WorkspaceState{}, err
	}
	if err := ensureWorkspaceLayout(normalized); err != nil {
		return WorkspaceState{}, err
	}
	workspace := Workspace{ID: "workspace", Name: "Workspace", Path: normalized, CreatedAt: time.Now().UnixMilli()}
	a.workspaceState = WorkspaceState{ActiveWorkspaceID: workspace.ID, Workspaces: []Workspace{workspace}}
	if err := a.saveWorkspacesLocked(); err != nil {
		return WorkspaceState{}, err
	}
	return a.workspaceStateUnlocked(), nil
}

func (a *App) SelectWorkspaceDirectory() (string, error) {
	return wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: "Select Workspace Directory"})
}

func (a *App) workspaceStateUnlocked() WorkspaceState {
	return WorkspaceState{ActiveWorkspaceID: a.workspaceState.ActiveWorkspaceID, Workspaces: append([]Workspace(nil), a.workspaceState.Workspaces...)}
}
