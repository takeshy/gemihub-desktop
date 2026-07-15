package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestProjectsInitializeAndSwitch(t *testing.T) {
	config := t.TempDir()
	app := NewApp()
	app.projectConfigDir = config
	if err := app.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	state := app.ListProjects()
	if len(state.Projects) != 1 || state.Projects[0].Name != "Default" {
		t.Fatalf("unexpected defaults: %#v", state)
	}
	if app.GetDirectoryBase() != "" {
		t.Fatalf("project initialization changed the independent directory base")
	}
	for _, dir := range []string{"Dashboards", "Secrets", "skills", "workflows"} {
		if info, err := os.Stat(filepath.Join(state.Projects[0].Path, dir)); err != nil || !info.IsDir() {
			t.Fatalf("missing project directory %s", dir)
		}
	}
	if _, err := os.Stat(filepath.Join(state.Projects[0].Path, "Memos")); !os.IsNotExist(err) {
		t.Fatalf("project layout unexpectedly manages the memo directory: %v", err)
	}

	secondPath := filepath.Join(config, "custom")
	state, err := app.CreateProject("Client A", secondPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Projects) != 2 {
		t.Fatalf("expected 2 projects")
	}
	second := state.Projects[1]
	state, err = app.SetActiveProject(second.ID)
	if err != nil {
		t.Fatal(err)
	}
	if state.ActiveProjectID != second.ID || app.GetActiveProjectPath() != second.Path || app.GetDirectoryBase() != "" {
		t.Fatalf("project switch did not remain independent from directory base")
	}

	reloaded := NewApp()
	reloaded.projectConfigDir = config
	if err := reloaded.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	if reloaded.ListProjects().ActiveProjectID != second.ID {
		t.Fatalf("active project was not persisted")
	}
}

func TestProjectResourcesAreIndependentFromDirectoryBase(t *testing.T) {
	config := t.TempDir()
	workspace := t.TempDir()
	app := NewApp()
	app.projectConfigDir = config
	if err := app.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetDirectoryBase(workspace); err != nil {
		t.Fatal(err)
	}
	project := app.ListProjects().Projects[0]

	if err := app.WriteFile("Dashboards/home.dashboard", "project dashboard"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(project.Path, "Dashboards", "home.dashboard")); err != nil {
		t.Fatalf("dashboard was not written to project: %v", err)
	}
	if _, err := os.Stat(filepath.Join(workspace, "Dashboards", "home.dashboard")); !os.IsNotExist(err) {
		t.Fatalf("dashboard leaked into working directory")
	}

	if err := app.WriteFile("workspace://Dashboards/work-note.md", "workspace file"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(workspace, "Dashboards", "work-note.md")); err != nil {
		t.Fatalf("explicit workspace file was not written to workspace: %v", err)
	}
	projectFile, err := app.ReadFile("Dashboards/home.dashboard")
	if err != nil || projectFile.Path != "Dashboards/home.dashboard" || projectFile.Content != "project dashboard" {
		t.Fatalf("project file did not retain its logical path: %#v, %v", projectFile, err)
	}
	workspaceFile, err := app.ReadFile("workspace://Dashboards/work-note.md")
	if err != nil || workspaceFile.Path != "workspace://Dashboards/work-note.md" || workspaceFile.Content != "workspace file" {
		t.Fatalf("workspace file did not retain its scoped path: %#v, %v", workspaceFile, err)
	}
	if err := app.RenameFile("Dashboards", "DashboardArchive"); err == nil {
		t.Fatalf("project resource root was renamed")
	}
	secondWorkspace := t.TempDir()
	if err := os.MkdirAll(filepath.Join(secondWorkspace, "Dashboards"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(secondWorkspace, "Dashboards", "work-note.md"), []byte("other worktree"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetDirectoryBase(secondWorkspace); err != nil {
		t.Fatal(err)
	}
	workspaceFile, err = app.ReadFile("workspace://Dashboards/work-note.md")
	if err != nil || workspaceFile.Content != "other worktree" {
		t.Fatalf("workspace-scoped path did not follow the changed working directory: %#v, %v", workspaceFile, err)
	}
	projectFile, err = app.ReadFile("Dashboards/home.dashboard")
	if err != nil || projectFile.Content != "project dashboard" {
		t.Fatalf("project file changed with the working directory: %#v, %v", projectFile, err)
	}
	if _, err := app.SetDirectoryBase(workspace); err != nil {
		t.Fatal(err)
	}
	if got := app.GetDirectoryBase(); got != workspace {
		t.Fatalf("project resource write changed directory base: %s", got)
	}
	if err := os.MkdirAll(filepath.Join(workspace, "skills", "workspace-only"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workspace, "skills", "workspace-only", "SKILL.md"), []byte("workspace skill"), 0o600); err != nil {
		t.Fatal(err)
	}
	inventory, err := app.FileInventory()
	if err != nil {
		t.Fatal(err)
	}
	seenProjectDashboard, seenWorkspaceSkill := false, false
	for _, item := range inventory {
		if item.Path == "Dashboards/home.dashboard" {
			seenProjectDashboard = true
		}
		if item.Path == "skills/workspace-only/SKILL.md" {
			seenWorkspaceSkill = true
		}
	}
	if !seenProjectDashboard || seenWorkspaceSkill {
		t.Fatalf("project inventory was not isolated from managed workspace folders: %#v", inventory)
	}

	projectTree, err := app.ListProjectTree()
	if err != nil {
		t.Fatal(err)
	}
	if len(projectTree) != len(projectResourceDirectories) {
		t.Fatalf("unexpected project tree roots: %#v", projectTree)
	}
	workspaceTree, err := app.ListFileTree()
	if err != nil {
		t.Fatal(err)
	}
	if len(workspaceTree) != 2 || workspaceTree[0].Name != "Dashboards" || workspaceTree[1].Name != "skills" {
		t.Fatalf("workspace tree did not remain independent: %#v", workspaceTree)
	}

	state, err := app.CreateProject("Second", "")
	if err != nil {
		t.Fatal(err)
	}
	second := state.Projects[1]
	if _, err := app.SetActiveProject(second.ID); err != nil {
		t.Fatal(err)
	}
	if app.GetDirectoryBase() != workspace {
		t.Fatalf("switching projects changed the open working directory")
	}
	if err := app.WriteFile("Dashboards/home.dashboard", "second dashboard"); err != nil {
		t.Fatal(err)
	}
	firstBytes, _ := os.ReadFile(filepath.Join(project.Path, "Dashboards", "home.dashboard"))
	secondBytes, _ := os.ReadFile(filepath.Join(second.Path, "Dashboards", "home.dashboard"))
	if string(firstBytes) != "project dashboard" || string(secondBytes) != "second dashboard" {
		t.Fatalf("project dashboards were not isolated")
	}
}

func TestDeleteProjectDoesNotDeleteDirectory(t *testing.T) {
	config := t.TempDir()
	app := NewApp()
	app.projectConfigDir = config
	if err := app.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	projectPath := filepath.Join(config, "external")
	state, err := app.CreateProject("External", projectPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.DeleteProject(state.Projects[1].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(projectPath); err != nil {
		t.Fatalf("removing project registration deleted its directory: %v", err)
	}
}

func TestFileLaunchUsesSessionProjectOnlyWhenDashboardsExists(t *testing.T) {
	config := t.TempDir()
	workspace := t.TempDir()
	app := NewApp()
	app.projectConfigDir = config
	if err := app.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetDirectoryBase(workspace); err != nil {
		t.Fatal(err)
	}

	app.configureFileLaunchProject(workspace)
	if state := app.ListProjects(); state.ActiveProjectID != "" {
		t.Fatalf("expected session Default without an active project: %#v", state)
	}
	if err := app.WriteFile("Dashboards/home.dashboard", "no project"); err == nil {
		t.Fatal("project resource write succeeded without a project")
	}
	if err := app.WriteFile("workspace://note.md", "workspace"); err != nil {
		t.Fatalf("ordinary workspace write was blocked: %v", err)
	}

	if err := os.Mkdir(filepath.Join(workspace, "Dashboards"), 0o755); err != nil {
		t.Fatal(err)
	}
	app.configureFileLaunchProject(workspace)
	state := app.ListProjects()
	if state.ActiveProjectID != "session-current" || app.GetActiveProjectPath() != workspace {
		t.Fatalf("current directory was not selected as the session project: %#v", state)
	}
	if err := app.WriteFile("Dashboards/home.dashboard", "session project"); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(filepath.Join(workspace, "Dashboards", "home.dashboard"))
	if err != nil || string(content) != "session project" {
		t.Fatalf("session project write went to the wrong directory: %q, %v", content, err)
	}
}
