package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSaveHTMLExportUsesSourceDirectoryAsBase(t *testing.T) {
	root := t.TempDir()
	notes := filepath.Join(root, "notes")
	if err := os.MkdirAll(notes, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(notes, "report.md"), []byte("# Report"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	if _, err := app.SetDirectoryBase(root); err != nil {
		t.Fatal(err)
	}
	output, err := app.SaveHTMLExport("files://notes/report.md", `<base href="__LLM_HUB_SOURCE_BASE__"><img src="chart.png">`)
	if err != nil {
		t.Fatal(err)
	}
	if output != "files://temporaries/report.html" {
		t.Fatalf("unexpected output: %s", output)
	}
	content, err := os.ReadFile(filepath.Join(root, "temporaries", "report.html"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(content), "file://") || strings.Contains(string(content), htmlExportBaseMarker) {
		t.Fatalf("source base was not injected: %s", content)
	}
}

func TestOpenHTMLInBrowserRejectsOtherExtensions(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "note.md"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	if _, err := app.SetDirectoryBase(root); err != nil {
		t.Fatal(err)
	}
	if err := app.OpenHTMLInBrowser("files://note.md"); err == nil {
		t.Fatal("expected non-HTML file to be rejected")
	}
}
