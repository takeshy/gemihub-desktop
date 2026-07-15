package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Project struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
	Session   bool   `json:"session,omitempty"`
}

type ProjectState struct {
	ActiveProjectID string    `json:"activeProjectId"`
	Projects        []Project `json:"projects"`
}

var invalidProjectName = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

func projectSlug(name string) string {
	value := strings.Trim(invalidProjectName.ReplaceAllString(strings.TrimSpace(name), "-"), "-._")
	if value == "" {
		return "Project"
	}
	return value
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

var projectResourceDirectories = []string{"Dashboards", "Secrets", "skills", "workflows"}

func ensureProjectLayout(path string) error {
	for _, dir := range projectResourceDirectories {
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
	if len(a.projectState.Projects) == 0 {
		path, err := normalizedProjectPath(filepath.Join(dir, "Projects", "Default"))
		if err != nil {
			return err
		}
		a.projectState = ProjectState{ActiveProjectID: "default", Projects: []Project{{ID: "default", Name: "Default", Path: path, CreatedAt: time.Now().UnixMilli()}}}
	}
	active := -1
	for index := range a.projectState.Projects {
		path, err := normalizedProjectPath(a.projectState.Projects[index].Path)
		if err != nil {
			continue
		}
		a.projectState.Projects[index].Path = path
		if err := ensureProjectLayout(path); err != nil {
			return err
		}
		if a.projectState.Projects[index].ID == a.projectState.ActiveProjectID {
			active = index
		}
	}
	if active < 0 && len(a.projectState.Projects) > 0 {
		active = 0
		a.projectState.ActiveProjectID = a.projectState.Projects[0].ID
	}
	if err := a.saveProjectsLocked(); err != nil {
		return err
	}
	return nil
}

func (a *App) GetActiveProjectPath() string {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	if a.sessionNoProject {
		return ""
	}
	if a.sessionProject != nil {
		return a.sessionProject.Path
	}
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
	state := ProjectState{ActiveProjectID: a.projectState.ActiveProjectID, Projects: append([]Project(nil), a.projectState.Projects...)}
	if a.sessionNoProject {
		state.ActiveProjectID = ""
	} else if a.sessionProject != nil {
		state.ActiveProjectID = a.sessionProject.ID
		found := false
		for _, project := range state.Projects {
			found = found || project.ID == a.sessionProject.ID
		}
		if !found {
			state.Projects = append([]Project{*a.sessionProject}, state.Projects...)
		}
	}
	return state
}

func (a *App) configureFileLaunchProject(path string) {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()

	normalized, err := filepath.EvalSymlinks(path)
	if err != nil {
		normalized = filepath.Clean(path)
	}
	info, err := os.Stat(filepath.Join(normalized, "Dashboards"))
	if err != nil || !info.IsDir() {
		a.sessionNoProject = true
		a.sessionProject = nil
		return
	}
	for index := range a.projectState.Projects {
		if a.projectState.Projects[index].Path == normalized {
			project := a.projectState.Projects[index]
			project.Session = true
			a.sessionProject = &project
			a.sessionNoProject = false
			return
		}
	}
	name := filepath.Base(normalized)
	if name == "." || name == string(filepath.Separator) || name == "" {
		name = "Current directory"
	}
	a.sessionProject = &Project{ID: "session-current", Name: name, Path: normalized, CreatedAt: time.Now().UnixMilli(), Session: true}
	a.sessionNoProject = false
}

func (a *App) SelectProjectDirectory() (string, error) {
	return wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: "Select Project Directory"})
}

func (a *App) CreateProject(name, path string) (ProjectState, error) {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	name = strings.TrimSpace(name)
	if name == "" {
		return ProjectState{}, fmt.Errorf("project name is required")
	}
	if strings.TrimSpace(path) == "" {
		dir, err := a.projectsConfigDir()
		if err != nil {
			return ProjectState{}, err
		}
		path = filepath.Join(dir, "Projects", projectSlug(name))
	}
	normalized, err := normalizedProjectPath(path)
	if err != nil {
		return ProjectState{}, err
	}
	for _, project := range a.projectState.Projects {
		if strings.EqualFold(project.Name, name) {
			return ProjectState{}, fmt.Errorf("a project named %q already exists", name)
		}
		if project.Path == normalized {
			return ProjectState{}, fmt.Errorf("that directory is already used by %q", project.Name)
		}
	}
	if err := ensureProjectLayout(normalized); err != nil {
		return ProjectState{}, err
	}
	id := fmt.Sprintf("%s-%d", strings.ToLower(projectSlug(name)), time.Now().UnixMilli())
	a.projectState.Projects = append(a.projectState.Projects, Project{ID: id, Name: name, Path: normalized, CreatedAt: time.Now().UnixMilli()})
	if err := a.saveProjectsLocked(); err != nil {
		return ProjectState{}, err
	}
	return a.ListProjectsUnlocked(), nil
}

func (a *App) ListProjectsUnlocked() ProjectState {
	return ProjectState{ActiveProjectID: a.projectState.ActiveProjectID, Projects: append([]Project(nil), a.projectState.Projects...)}
}

func (a *App) UpdateProject(id, name, path string) (ProjectState, error) {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	index := -1
	for i := range a.projectState.Projects {
		if a.projectState.Projects[i].ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return ProjectState{}, fmt.Errorf("project not found")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return ProjectState{}, fmt.Errorf("project name is required")
	}
	normalized, err := normalizedProjectPath(path)
	if err != nil {
		return ProjectState{}, err
	}
	for i, project := range a.projectState.Projects {
		if i != index && (strings.EqualFold(project.Name, name) || project.Path == normalized) {
			return ProjectState{}, fmt.Errorf("project name or directory is already in use")
		}
	}
	if err := ensureProjectLayout(normalized); err != nil {
		return ProjectState{}, err
	}
	a.projectState.Projects[index].Name = name
	a.projectState.Projects[index].Path = normalized
	if err := a.saveProjectsLocked(); err != nil {
		return ProjectState{}, err
	}
	return a.ListProjectsUnlocked(), nil
}

func (a *App) DeleteProject(id string) (ProjectState, error) {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	if len(a.projectState.Projects) <= 1 {
		return ProjectState{}, fmt.Errorf("at least one project is required")
	}
	index := -1
	for i := range a.projectState.Projects {
		if a.projectState.Projects[i].ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return ProjectState{}, fmt.Errorf("project not found")
	}
	if a.projectState.ActiveProjectID == id {
		return ProjectState{}, fmt.Errorf("switch to another project before removing the active project")
	}
	a.projectState.Projects = append(a.projectState.Projects[:index], a.projectState.Projects[index+1:]...)
	if err := a.saveProjectsLocked(); err != nil {
		return ProjectState{}, err
	}
	return a.ListProjectsUnlocked(), nil
}

func (a *App) SetActiveProject(id string) (ProjectState, error) {
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	for _, project := range a.projectState.Projects {
		if project.ID != id {
			continue
		}
		if err := ensureProjectLayout(project.Path); err != nil {
			return ProjectState{}, err
		}
		a.projectState.ActiveProjectID = id
		a.sessionProject = nil
		a.sessionNoProject = false
		if err := a.saveProjectsLocked(); err != nil {
			return ProjectState{}, err
		}
		return a.ListProjectsUnlocked(), nil
	}
	return ProjectState{}, fmt.Errorf("project not found")
}
