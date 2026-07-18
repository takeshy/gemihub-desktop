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

type Project struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
}

type ProjectState struct {
	ActiveProjectID string    `json:"activeProjectId"`
	Projects        []Project `json:"projects"`
}

func (a *App) projectsConfigDir() (string, error) {
	if a.projectConfigDir != "" {
		return a.projectConfigDir, nil
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
	if a.projectConfigDir != "" {
		return filepath.Join(configDir, "GemiHub Workspace"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Documents", "GemiHub Workspace"), nil
}

var projectResourceDirectories = []string{"Dashboards", "Memos", "Secrets", "skills", "workflows"}

var projectDefaultDirectories = []string{
	filepath.Join("Dashboards", "Timeline", "Timeline"),
}

func ensureProjectLayout(path string) error {
	for _, dir := range projectResourceDirectories {
		if err := os.MkdirAll(filepath.Join(path, dir), 0o755); err != nil {
			return err
		}
	}
	for _, dir := range projectDefaultDirectories {
		if err := os.MkdirAll(filepath.Join(path, dir), 0o755); err != nil {
			return err
		}
	}
	return nil
}

func normalizedProjectPath(path string) (string, error) {
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

func (a *App) saveProjectsLocked() error {
	dir, err := a.projectsConfigDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(a.projectState, "", "  ")
	if err != nil {
		return err
	}
	temp := filepath.Join(dir, "projects.json.tmp")
	if err := os.WriteFile(temp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temp, filepath.Join(dir, "projects.json"))
}

func (a *App) initializeProjects() error {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	dir, err := a.projectsConfigDir()
	if err != nil {
		return err
	}
	configPath := filepath.Join(dir, "projects.json")
	if data, readErr := os.ReadFile(configPath); readErr == nil {
		if err := json.Unmarshal(data, &a.projectState); err != nil {
			return fmt.Errorf("read projects: %w", err)
		}
	} else if !os.IsNotExist(readErr) {
		return readErr
	}
	var selected *Project
	for index := range a.projectState.Projects {
		if a.projectState.Projects[index].ID == a.projectState.ActiveProjectID {
			project := a.projectState.Projects[index]
			selected = &project
			break
		}
	}
	if selected == nil && len(a.projectState.Projects) > 0 {
		project := a.projectState.Projects[0]
		selected = &project
	}
	if selected == nil {
		defaultPath, err := a.defaultWorkspacePath(dir)
		if err != nil {
			return err
		}
		path, err := normalizedProjectPath(defaultPath)
		if err != nil {
			return err
		}
		selected = &Project{ID: "project", Name: "Workspace", Path: path, CreatedAt: time.Now().UnixMilli()}
	}
	path, err := normalizedProjectPath(selected.Path)
	if err != nil {
		return err
	}
	if err := ensureProjectLayout(path); err != nil {
		return err
	}
	project := Project{ID: "project", Name: "Workspace", Path: path, CreatedAt: selected.CreatedAt}
	if project.CreatedAt == 0 {
		project.CreatedAt = time.Now().UnixMilli()
	}
	a.projectState = ProjectState{ActiveProjectID: project.ID, Projects: []Project{project}}
	if err := a.saveProjectsLocked(); err != nil {
		return err
	}
	return nil
}

func (a *App) GetActiveProjectPath() string {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	for _, project := range a.projectState.Projects {
		if project.ID == a.projectState.ActiveProjectID {
			return project.Path
		}
	}
	return ""
}

func (a *App) ListProjects() ProjectState {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	return ProjectState{ActiveProjectID: a.projectState.ActiveProjectID, Projects: append([]Project(nil), a.projectState.Projects...)}
}

func (a *App) SetProjectDirectory(path string) (ProjectState, error) {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	normalized, err := normalizedProjectPath(path)
	if err != nil {
		return ProjectState{}, err
	}
	if err := ensureProjectLayout(normalized); err != nil {
		return ProjectState{}, err
	}
	project := Project{ID: "project", Name: "Workspace", Path: normalized, CreatedAt: time.Now().UnixMilli()}
	a.projectState = ProjectState{ActiveProjectID: project.ID, Projects: []Project{project}}
	if err := a.saveProjectsLocked(); err != nil {
		return ProjectState{}, err
	}
	return a.ListProjectsUnlocked(), nil
}

func (a *App) SelectProjectDirectory() (string, error) {
	return wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: "Select Workspace Directory"})
}

func (a *App) ListProjectsUnlocked() ProjectState {
	return ProjectState{ActiveProjectID: a.projectState.ActiveProjectID, Projects: append([]Project(nil), a.projectState.Projects...)}
}
