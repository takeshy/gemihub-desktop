package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func workspaceMoveTestApp(t *testing.T) (*App, string, string) {
	t.Helper()
	config := t.TempDir()
	files := t.TempDir()
	app := NewApp()
	app.projectConfigDir = config
	if err := app.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetDirectoryBase(files); err != nil {
		t.Fatal(err)
	}
	return app, files, app.GetActiveProjectPath()
}

func TestMoveDirectoryIntoWorkspace(t *testing.T) {
	app, files, workspace := workspaceMoveTestApp(t)
	source := filepath.Join(files, "Research")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "paper.md"), []byte("paper"), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := app.MoveDirectoryIntoWorkspace("workspace://Research", "Research", false)
	if err != nil {
		t.Fatal(err)
	}
	if result.WorkspacePath != "Research" || result.LinkCreated {
		t.Fatalf("unexpected result: %#v", result)
	}
	if content, err := os.ReadFile(filepath.Join(workspace, "Research", "paper.md")); err != nil || string(content) != "paper" {
		t.Fatalf("moved file = %q, %v", content, err)
	}
	if _, err := os.Lstat(source); !os.IsNotExist(err) {
		t.Fatalf("source still exists: %v", err)
	}
}

func TestMoveDirectoryIntoWorkspaceLeavesLink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows junction creation requires PowerShell")
	}
	app, files, workspace := workspaceMoveTestApp(t)
	source := filepath.Join(files, "Notes")
	if err := os.MkdirAll(source, 0o755); err != nil {
		t.Fatal(err)
	}
	result, err := app.MoveDirectoryIntoWorkspace("workspace://Notes", "Notes", true)
	if err != nil {
		t.Fatal(err)
	}
	if !result.LinkCreated {
		t.Fatal("expected original-location link")
	}
	if target, err := filepath.EvalSymlinks(source); err != nil || target != filepath.Join(workspace, "Notes") {
		t.Fatalf("link target = %q, %v", target, err)
	}
}

func TestMoveFileIntoWorkspaceDirectory(t *testing.T) {
	app, files, workspace := workspaceMoveTestApp(t)
	if err := os.WriteFile(filepath.Join(files, "outside.md"), []byte("external"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(workspace, "Imported"), 0o755); err != nil {
		t.Fatal(err)
	}
	result, err := app.MovePathIntoWorkspace("workspace://outside.md", "Imported", "renamed.md", false)
	if err != nil {
		t.Fatal(err)
	}
	if result.WorkspacePath != "Imported/renamed.md" {
		t.Fatalf("WorkspacePath = %q", result.WorkspacePath)
	}
	content, err := os.ReadFile(filepath.Join(workspace, "Imported", "renamed.md"))
	if err != nil || string(content) != "external" {
		t.Fatalf("moved content = %q, %v", content, err)
	}
	if _, err := os.Stat(filepath.Join(files, "outside.md")); !os.IsNotExist(err) {
		t.Fatalf("external source remains: %v", err)
	}
}

func TestMovePathIntoWorkspaceRejectsTraversalAndFileLink(t *testing.T) {
	app, files, _ := workspaceMoveTestApp(t)
	if err := os.WriteFile(filepath.Join(files, "outside.md"), []byte("external"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := app.MovePathIntoWorkspace("workspace://outside.md", "../outside", "outside.md", false); err == nil {
		t.Fatal("Workspace destination traversal was accepted")
	}
	if _, err := app.MovePathIntoWorkspace("workspace://outside.md", "", "outside.md", true); err == nil {
		t.Fatal("leaving a link for a regular file was accepted")
	}
}

func TestMoveDirectoryIntoWorkspaceRejectsReservedName(t *testing.T) {
	app, files, _ := workspaceMoveTestApp(t)
	if err := os.MkdirAll(filepath.Join(files, "Source"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := app.MoveDirectoryIntoWorkspace("workspace://Source", "Dashboards", false); err == nil {
		t.Fatal("reserved Workspace directory was accepted")
	}
}

func TestWorkspaceDirectoryNamesStayPortable(t *testing.T) {
	for _, name := range []string{"Dashboards", "CON", "LPT1.txt", "bad:name", "trailing."} {
		if _, err := validateWorkspaceDirectoryName(name); err == nil {
			t.Errorf("non-portable name %q was accepted", name)
		}
	}
	if got, err := validateWorkspaceDirectoryName("Research Notes"); err != nil || got != "Research Notes" {
		t.Fatalf("portable name rejected: %q, %v", got, err)
	}
}
