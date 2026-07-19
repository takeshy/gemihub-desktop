package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSingleWorkspaceInitializeAndChangeDirectory(t *testing.T) {
	config := t.TempDir()
	app := NewApp()
	app.workspaceConfigDir = config
	if err := app.initializeWorkspaces(); err != nil {
		t.Fatal(err)
	}
	state := app.GetWorkspaceState()
	if len(state.Workspaces) != 1 || state.Workspaces[0].Name != "Workspace" || state.ActiveWorkspaceID != "workspace" {
		t.Fatalf("unexpected defaults: %#v", state)
	}
	if want := filepath.Join(config, "GemiHubWorkspace"); state.Workspaces[0].Path != want {
		t.Fatalf("default workspace path = %q, want %q", state.Workspaces[0].Path, want)
	}
	if app.GetDirectoryBase() != "" {
		t.Fatalf("workspace initialization changed the independent directory base")
	}
	for _, dir := range []string{"Dashboards", "Memos", "Secrets", "skills", "workflows"} {
		if info, err := os.Stat(filepath.Join(state.Workspaces[0].Path, dir)); err != nil || !info.IsDir() {
			t.Fatalf("missing Workspace directory %s", dir)
		}
	}
	if info, err := os.Stat(filepath.Join(state.Workspaces[0].Path, "Dashboards", "Timeline", "Timeline")); err != nil || !info.IsDir() {
		t.Fatalf("missing default Timeline directory")
	}
	workspacePath := filepath.Join(config, "custom")
	state, err := app.SetWorkspaceDirectory(workspacePath)
	if err != nil {
		t.Fatal(err)
	}
	if len(state.Workspaces) != 1 || app.GetWorkspacePath() != workspacePath || app.GetDirectoryBase() != "" {
		t.Fatalf("single Workspace directory was not applied: %#v", state)
	}

	reloaded := NewApp()
	reloaded.workspaceConfigDir = config
	if err := reloaded.initializeWorkspaces(); err != nil {
		t.Fatal(err)
	}
	if reloaded.GetWorkspacePath() != workspacePath || len(reloaded.GetWorkspaceState().Workspaces) != 1 {
		t.Fatalf("Workspace directory was not persisted")
	}
}

func TestWorkspaceResourcesAreIndependentFromDirectoryBase(t *testing.T) {
	config := t.TempDir()
	files := t.TempDir()
	app := NewApp()
	app.workspaceConfigDir = config
	if err := app.initializeWorkspaces(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetDirectoryBase(files); err != nil {
		t.Fatal(err)
	}
	workspace := app.GetWorkspaceState().Workspaces[0]

	if err := app.WriteFile("Dashboards/home.dashboard", "workspace dashboard"); err != nil {
		t.Fatal(err)
	}
	if err := app.WriteFile("workspace://readme.md", "ordinary Workspace file"); err != nil {
		t.Fatal(err)
	}
	projectReadme, err := app.ReadFile("workspace://readme.md")
	if err != nil || projectReadme.Content != "ordinary Workspace file" {
		t.Fatalf("Workspace-scoped ordinary file was not readable: %#v, %v", projectReadme, err)
	}
	if _, err := os.Stat(filepath.Join(workspace.Path, "Dashboards", "home.dashboard")); err != nil {
		t.Fatalf("dashboard was not written to Workspace: %v", err)
	}
	if _, err := os.Stat(filepath.Join(files, "Dashboards", "home.dashboard")); !os.IsNotExist(err) {
		t.Fatalf("dashboard leaked into working directory")
	}
	if err := app.WriteFile(".llm-hub/plugins/example/manifest.json", "{}"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(workspace.Path, ".llm-hub", "plugins", "example", "manifest.json")); err != nil {
		t.Fatalf("plugin was not written to workspace: %v", err)
	}
	if _, err := os.Stat(filepath.Join(files, ".llm-hub", "plugins", "example", "manifest.json")); !os.IsNotExist(err) {
		t.Fatalf("plugin leaked into files directory")
	}

	if err := app.WriteFile("files://Dashboards/work-note.md", "workspace file"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(files, "Dashboards", "work-note.md")); err != nil {
		t.Fatalf("explicit workspace file was not written to workspace: %v", err)
	}
	projectFile, err := app.ReadFile("Dashboards/home.dashboard")
	if err != nil || projectFile.Path != "Dashboards/home.dashboard" || projectFile.Content != "workspace dashboard" {
		t.Fatalf("Workspace file did not retain its logical path: %#v, %v", projectFile, err)
	}
	workspaceFile, err := app.ReadFile("files://Dashboards/work-note.md")
	if err != nil || workspaceFile.Path != "files://Dashboards/work-note.md" || workspaceFile.Content != "workspace file" {
		t.Fatalf("workspace file did not retain its scoped path: %#v, %v", workspaceFile, err)
	}
	if err := app.RenameFile("Dashboards", "DashboardArchive"); err == nil {
		t.Fatalf("Workspace resource root was renamed")
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
	workspaceFile, err = app.ReadFile("files://Dashboards/work-note.md")
	if err != nil || workspaceFile.Content != "other worktree" {
		t.Fatalf("workspace-scoped path did not follow the changed working directory: %#v, %v", workspaceFile, err)
	}
	projectFile, err = app.ReadFile("Dashboards/home.dashboard")
	if err != nil || projectFile.Content != "workspace dashboard" {
		t.Fatalf("Workspace file changed with the working directory: %#v, %v", projectFile, err)
	}
	if _, err := app.SetDirectoryBase(files); err != nil {
		t.Fatal(err)
	}
	if got := app.GetDirectoryBase(); got != files {
		t.Fatalf("Workspace resource write changed directory base: %s", got)
	}
	if err := os.MkdirAll(filepath.Join(files, "skills", "workspace-only"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(files, "skills", "workspace-only", "SKILL.md"), []byte("workspace skill"), 0o600); err != nil {
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
		t.Fatalf("Workspace inventory was not isolated from managed workspace folders: %#v", inventory)
	}

	projectTree, err := app.ListWorkspaceTree()
	if err != nil {
		t.Fatal(err)
	}
	if len(projectTree) != len(workspaceResourceDirectories)+1 || projectTree[len(projectTree)-1].Name != "readme.md" {
		t.Fatalf("unexpected Workspace tree roots: %#v", projectTree)
	}
	workspaceTree, err := app.ListFileTree()
	if err != nil {
		t.Fatal(err)
	}
	if len(workspaceTree) != 2 || workspaceTree[0].Name != "Dashboards" || workspaceTree[1].Name != "skills" {
		t.Fatalf("workspace tree did not remain independent: %#v", workspaceTree)
	}

}
