package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestInstallAndUninstallManagedPluginAtomically(t *testing.T) {
	base := t.TempDir()
	app := NewApp()
	if _, err := app.SetDirectoryBase(base); err != nil {
		t.Fatal(err)
	}
	manifest := `{"id":"demo","name":"Demo","version":"1.0.0"}`
	install, _ := json.Marshal(map[string]any{"id": "demo", "repo": "owner/repo", "version": "1.0.0"})
	if err := app.InstallPluginFiles("demo", map[string]string{"manifest.json": manifest, "main.js": "module.exports = class {}"}, string(install)); err != nil {
		t.Fatal(err)
	}
	mainPath := filepath.Join(base, ".llm-hub", "plugins", "demo", "main.js")
	if content, err := os.ReadFile(mainPath); err != nil || string(content) != "module.exports = class {}" {
		t.Fatalf("unexpected installed plugin: %q, %v", content, err)
	}
	if err := app.InstallPluginFiles("demo", map[string]string{"manifest.json": manifest, "main.js": "updated"}, string(install)); err != nil {
		t.Fatal(err)
	}
	if content, _ := os.ReadFile(mainPath); string(content) != "updated" {
		t.Fatalf("plugin was not replaced: %q", content)
	}
	if err := app.UninstallPlugin("demo"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Dir(mainPath)); !os.IsNotExist(err) {
		t.Fatalf("plugin directory still exists: %v", err)
	}
}

func TestManagedPluginPathsAndManualPluginsAreProtected(t *testing.T) {
	base := t.TempDir()
	app := NewApp()
	if _, err := app.SetDirectoryBase(base); err != nil {
		t.Fatal(err)
	}
	if err := app.InstallPluginFiles("demo", map[string]string{"manifest.json": `{"id":"demo","version":"1.0.0"}`, "main.js": "x", "../escape": "bad"}, `{"id":"demo"}`); err == nil {
		t.Fatal("unsafe install path was accepted")
	}
	manual := filepath.Join(base, ".llm-hub", "plugins", "manual")
	if err := os.MkdirAll(manual, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := app.UninstallPlugin("manual"); err == nil {
		t.Fatal("manual plugin was uninstalled")
	}
}
