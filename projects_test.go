package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSingleProjectInitializeAndChangeDirectory(t *testing.T) {
	config := t.TempDir()
	app := NewApp()
	app.projectConfigDir = config
	if err := app.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	state := app.ListProjects()
	if len(state.Projects) != 1 || state.Projects[0].Name != "Workspace" || state.ActiveProjectID != "project" {
		t.Fatalf("unexpected defaults: %#v", state)
	}
	if want := filepath.Join(config, "GemiHub Workspace"); state.Projects[0].Path != want {
		t.Fatalf("default workspace path = %q, want %q", state.Projects[0].Path, want)
	}
	if app.GetDirectoryBase() != "" {
		t.Fatalf("project initialization changed the independent directory base")
	}
	for _, dir := range []string{"Dashboards", "Memos", "Secrets", "skills", "workflows"} {
		if info, err := os.Stat(filepath.Join(state.Projects[0].Path, dir)); err != nil || !info.IsDir() {
			t.Fatalf("missing project directory %s", dir)
		}
	}
	projectPath := filepath.Join(config, "custom")
	state, err := app.SetProjectDirectory(projectPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Projects) != 1 || app.GetActiveProjectPath() != projectPath || app.GetDirectoryBase() != "" {
		t.Fatalf("single project directory was not applied: %#v", state)
	}

	reloaded := NewApp()
	reloaded.projectConfigDir = config
	if err := reloaded.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	if reloaded.GetActiveProjectPath() != projectPath || len(reloaded.ListProjects().Projects) != 1 {
		t.Fatalf("project directory was not persisted")
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
	if err := app.WriteFile(".llm-hub/plugins/example/manifest.json", "{}"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(project.Path, ".llm-hub", "plugins", "example", "manifest.json")); err != nil {
		t.Fatalf("plugin was not written to workspace: %v", err)
	}
	if _, err := os.Stat(filepath.Join(workspace, ".llm-hub", "plugins", "example", "manifest.json")); !os.IsNotExist(err) {
		t.Fatalf("plugin leaked into files directory")
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

}
