package main

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestMoveDirectoryDoesNotCopyWhenRenameFails(t *testing.T) {
	root := t.TempDir()
	source := filepath.Join(root, "source")
	destination := filepath.Join(root, "destination")
	if err := os.Mkdir(source, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "important.md"), []byte("keep me"), 0o600); err != nil {
		t.Fatal(err)
	}

	err := moveDirectoryWith(source, destination,
		func(string, string) error { return errors.New("directory is locked") },
	)
	if err == nil {
		t.Fatal("expected source cleanup error")
	}
	if _, statErr := os.Stat(destination); !os.IsNotExist(statErr) {
		t.Fatalf("destination was created after rename failure: %v", statErr)
	}
	content, readErr := os.ReadFile(filepath.Join(source, "important.md"))
	if readErr != nil || string(content) != "keep me" {
		t.Fatalf("source changed after rename failure: %q, %v", content, readErr)
	}
}

func TestMoveDirectoryRetriesRenameWithoutCopying(t *testing.T) {
	attempts := 0
	waits := 0
	err := moveDirectoryWithRetry("source", "destination", func(source, destination string) error {
		attempts++
		if attempts < 3 {
			return errors.New("temporarily locked")
		}
		if source != "source" || destination != "destination" {
			t.Fatalf("unexpected rename paths: %q -> %q", source, destination)
		}
		return nil
	}, func(time.Duration) { waits++ })
	if err != nil {
		t.Fatal(err)
	}
	if attempts != 3 || waits != 2 {
		t.Fatalf("attempts = %d, waits = %d", attempts, waits)
	}
}

func workspaceMoveTestApp(t *testing.T) (*App, string, string) {
	t.Helper()
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
	return app, files, app.GetWorkspacePath()
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
	result, err := app.MoveDirectoryIntoWorkspace("files://Research", "Research", false)
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
	result, err := app.MoveDirectoryIntoWorkspace("files://Notes", "Notes", true)
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
	result, err := app.MovePathIntoWorkspace("files://outside.md", "Imported", "renamed.md", false)
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
	if _, err := app.MovePathIntoWorkspace("files://outside.md", "../outside", "outside.md", false); err == nil {
		t.Fatal("Workspace destination traversal was accepted")
	}
	if _, err := app.MovePathIntoWorkspace("files://outside.md", "", "outside.md", true); err == nil {
		t.Fatal("leaving a link for a regular file was accepted")
	}
}

func TestMoveLocalPathIntoWorkspaceRemovesOriginal(t *testing.T) {
	app, _, workspace := workspaceMoveTestApp(t)
	sourceDir := t.TempDir()
	source := filepath.Join(sourceDir, "dropped.md")
	if err := os.WriteFile(source, []byte("copied"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(workspace, "Notes"), 0o755); err != nil {
		t.Fatal(err)
	}

	result, err := app.MoveLocalPathIntoWorkspace(source, "Notes", "dropped.md", false)
	if err != nil {
		t.Fatal(err)
	}
	if result.WorkspacePath != "Notes/dropped.md" {
		t.Fatalf("unexpected workspace path: %q", result.WorkspacePath)
	}
	if content, err := os.ReadFile(filepath.Join(workspace, "Notes", "dropped.md")); err != nil || string(content) != "copied" {
		t.Fatalf("unexpected moved file: %q, %v", content, err)
	}
	if _, err := os.Stat(source); !os.IsNotExist(err) {
		t.Fatalf("source should be removed: %v", err)
	}
	if _, err := app.MoveLocalPathIntoWorkspace("relative.md", "Notes", "relative.md", false); err == nil {
		t.Fatal("expected a relative dropped path to be rejected")
	}
}

func TestMoveDirectoryIntoWorkspaceRejectsReservedName(t *testing.T) {
	app, files, _ := workspaceMoveTestApp(t)
	if err := os.MkdirAll(filepath.Join(files, "Source"), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := app.MoveDirectoryIntoWorkspace("files://Source", "Dashboards", false); err == nil {
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
