package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestProjectStateFilesStayInActiveProject(t *testing.T) {
	app := NewApp()
	app.projectConfigDir = t.TempDir()
	if err := app.initializeProjects(); err != nil {
		t.Fatal(err)
	}
	project := app.GetActiveProjectPath()
	if value, err := app.ReadProjectStateFile("chat-history"); err != nil || value != "" {
		t.Fatalf("unexpected initial state: %q, %v", value, err)
	}
	if err := app.WriteProjectStateFile("chat-history", "first"); err != nil {
		t.Fatal(err)
	}
	if err := app.WriteProjectStateFile("chat-history", "second"); err != nil {
		t.Fatal(err)
	}
	if value, err := app.ReadProjectStateFile("chat-history"); err != nil || value != "second" {
		t.Fatalf("unexpected stored state: %q, %v", value, err)
	}
	info, err := os.Stat(filepath.Join(project, ".llm-hub", "state", "chat-history.data"))
	if err != nil || info.IsDir() {
		t.Fatalf("project state file was not created: %v", err)
	}
	if err := app.WriteProjectStateFile("../escape", "bad"); err == nil {
		t.Fatal("expected unsafe state name to be rejected")
	}
}
