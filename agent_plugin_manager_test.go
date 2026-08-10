package main

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestAgentPluginInstallToggleAndUninstall(t *testing.T) {
	base := t.TempDir()
	app := NewApp()
	if _, err := app.SetDirectoryBase(base); err != nil {
		t.Fatal(err)
	}
	metadata, _ := json.Marshal(AgentPluginInstall{Name: "demo-plugin", Repo: "owner/repo", Version: "1.0.0", SourceType: "branch", SourceRef: "main", CommitSHA: "0123456789012345678901234567890123456789", Enabled: true, SkillNames: []string{"review"}})
	files := map[string]string{
		"plugin.json":            base64.StdEncoding.EncodeToString([]byte(`{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"demo-plugin"}`)),
		"skills/review/SKILL.md": base64.StdEncoding.EncodeToString([]byte("---\nname: review\ndescription: Review files.\n---\nDo it.")),
	}
	if err := app.InstallAgentPlugin("demo-plugin", files, string(metadata)); err != nil {
		t.Fatal(err)
	}
	plugins, err := app.ListAgentPlugins()
	if err != nil || len(plugins) != 1 || !plugins[0].Enabled {
		t.Fatalf("unexpected plugins: %#v %v", plugins, err)
	}
	if err := app.SetAgentPluginEnabled("demo-plugin", false); err != nil {
		t.Fatal(err)
	}
	plugins, _ = app.ListAgentPlugins()
	if plugins[0].Enabled {
		t.Fatal("plugin remained enabled")
	}
	read, err := app.ReadAgentPluginFiles("demo-plugin")
	if err != nil || len(read) != 2 {
		t.Fatalf("unexpected files: %#v %v", read, err)
	}
	if err := app.UninstallAgentPlugin("demo-plugin"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(base, ".llm-hub", "agent-plugins", "demo-plugin")); !os.IsNotExist(err) {
		t.Fatal("plugin remains")
	}
}

func TestAgentPluginRejectsUnsafePackage(t *testing.T) {
	app := NewApp()
	if _, err := app.SetDirectoryBase(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	metadata := `{"name":"demo","repo":"owner/repo","commitSha":"0123456789012345678901234567890123456789"}`
	if err := app.InstallAgentPlugin("demo", map[string]string{"plugin.json": "e30=", "../escape": "eA=="}, metadata); err == nil {
		t.Fatal("unsafe path accepted")
	}
}

func TestListAgentPluginsBeforeManagerDirectoryExists(t *testing.T) {
	app := NewApp()
	if _, err := app.SetDirectoryBase(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	plugins, err := app.ListAgentPlugins()
	if err != nil || len(plugins) != 0 {
		t.Fatalf("expected empty list, got %#v, %v", plugins, err)
	}
	files, err := app.ReadAgentPluginFiles("missing")
	if err != nil || len(files) != 0 {
		t.Fatalf("expected empty files, got %#v, %v", files, err)
	}
}
