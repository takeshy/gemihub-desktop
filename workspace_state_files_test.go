package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWorkspaceStateFilesStayInActiveProject(t *testing.T) {
	app := NewApp()
	app.workspaceConfigDir = t.TempDir()
	if err := app.initializeWorkspaces(); err != nil {
		t.Fatal(err)
	}
	workspace := app.GetWorkspacePath()
	if value, err := app.ReadWorkspaceStateFile("chat-history"); err != nil || value != "" {
		t.Fatalf("unexpected initial state: %q, %v", value, err)
	}
	if err := app.WriteWorkspaceStateFile("chat-history", "first"); err != nil {
		t.Fatal(err)
	}
	if err := app.WriteWorkspaceStateFile("chat-history", "second"); err != nil {
		t.Fatal(err)
	}
	if value, err := app.ReadWorkspaceStateFile("chat-history"); err != nil || value != "second" {
		t.Fatalf("unexpected stored state: %q, %v", value, err)
	}
	info, err := os.Stat(filepath.Join(workspace, ".llm-hub", "state", "chat-history.data"))
	if err != nil || info.IsDir() {
		t.Fatalf("Workspace state file was not created: %v", err)
	}
	if err := app.WriteWorkspaceStateFile("../escape", "bad"); err == nil {
		t.Fatal("expected unsafe state name to be rejected")
	}
}
