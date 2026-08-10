package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const maxAgentPluginInstallBytes = 50 * 1024 * 1024

var agentPluginReadableFilePattern = regexp.MustCompile(`^skills/[^/]+/(?:SKILL\.md|references/.+)$`)

type AgentPluginInstall struct {
	Name        string   `json:"name"`
	Repo        string   `json:"repo"`
	Version     string   `json:"version"`
	SourceType  string   `json:"sourceType"`
	SourceRef   string   `json:"sourceRef"`
	CommitSHA   string   `json:"commitSha"`
	Enabled     bool     `json:"enabled"`
	SkillNames  []string `json:"skillNames"`
	Executables []string `json:"executables,omitempty"`
}

type AgentPluginFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func safeAgentPluginName(name string) bool {
	if len(name) < 1 || len(name) > 64 || !managedPluginIDPattern.MatchString(name) || strings.ToLower(name) != name || strings.Contains(name, "--") || strings.Contains(name, "..") {
		return false
	}
	return name[0] != '-' && name[0] != '.' && name[len(name)-1] != '-' && name[len(name)-1] != '.'
}

// InstallAgentPlugin atomically installs an already previewed, commit-pinned package.
// File contents are base64 so binary skill assets are preserved exactly.
func (a *App) InstallAgentPlugin(name string, files map[string]string, installJSON string) error {
	a.pluginMu.Lock()
	defer a.pluginMu.Unlock()
	if !safeAgentPluginName(name) || len(files) == 0 || len(files) > 1000 {
		return fmt.Errorf("invalid Agent Plugin package")
	}
	if _, ok := files["plugin.json"]; !ok {
		return fmt.Errorf("plugin.json is required")
	}
	var install AgentPluginInstall
	if err := json.Unmarshal([]byte(installJSON), &install); err != nil || install.Name != name || install.Repo == "" || len(install.CommitSHA) != 40 {
		return fmt.Errorf("invalid Agent Plugin install metadata")
	}
	decoded := make(map[string][]byte, len(files))
	executables := make(map[string]bool, len(install.Executables))
	for _, path := range install.Executables {
		if !safePluginRelativePath(path) {
			return fmt.Errorf("unsafe executable path: %s", path)
		}
		executables[path] = true
	}
	total := len(installJSON)
	for path, encoded := range files {
		if !safePluginRelativePath(path) || path == "install.json" {
			return fmt.Errorf("unsafe Agent Plugin path: %s", path)
		}
		content, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return fmt.Errorf("invalid file encoding: %s", path)
		}
		total += len(content)
		if len(content) > 10*1024*1024 || total > maxAgentPluginInstallBytes {
			return fmt.Errorf("Agent Plugin package exceeds size limit")
		}
		decoded[path] = content
	}
	root, err := a.directoryPath(".llm-hub/agent-plugins", true)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return err
	}
	stage, err := os.MkdirTemp(root, "."+name+"-stage-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	for path, content := range decoded {
		target := filepath.Join(stage, filepath.FromSlash(path))
		if err := requirePathInside(stage, target); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		mode := os.FileMode(0o644)
		if executables[path] {
			mode = 0o755
		}
		if err := os.WriteFile(target, content, mode); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(stage, "install.json"), []byte(installJSON), 0o644); err != nil {
		return err
	}
	target, backup := filepath.Join(root, name), filepath.Join(root, "."+name+"-backup")
	_ = os.RemoveAll(backup)
	hadTarget := false
	if _, err := os.Lstat(target); err == nil {
		hadTarget = true
		previousBytes, readErr := os.ReadFile(filepath.Join(target, "install.json"))
		var previous AgentPluginInstall
		if readErr != nil || json.Unmarshal(previousBytes, &previous) != nil || previous.Name != name || previous.Repo != install.Repo {
			return fmt.Errorf("installed Agent Plugin repository does not match")
		}
		if err := os.Rename(target, backup); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(stage, target); err != nil {
		if hadTarget {
			_ = os.Rename(backup, target)
		}
		return err
	}
	if hadTarget {
		_ = os.RemoveAll(backup)
	}
	if data, dataErr := a.directoryPath(".llm-hub/agent-plugin-data/"+name, true); dataErr == nil {
		_ = os.MkdirAll(data, 0o755)
	}
	return nil
}

func (a *App) ListAgentPlugins() ([]AgentPluginInstall, error) {
	a.pluginMu.Lock()
	defer a.pluginMu.Unlock()
	root, err := a.directoryPath(".llm-hub/agent-plugins", true)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return []AgentPluginInstall{}, nil
	}
	if err != nil {
		return nil, err
	}
	result := []AgentPluginInstall{}
	for _, entry := range entries {
		if !entry.IsDir() || !safeAgentPluginName(entry.Name()) {
			continue
		}
		content, readErr := os.ReadFile(filepath.Join(root, entry.Name(), "install.json"))
		var install AgentPluginInstall
		if readErr == nil && json.Unmarshal(content, &install) == nil && install.Name == entry.Name() {
			result = append(result, install)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result, nil
}

func (a *App) ReadAgentPluginFiles(name string) ([]AgentPluginFile, error) {
	a.pluginMu.Lock()
	defer a.pluginMu.Unlock()
	if !safeAgentPluginName(name) {
		return nil, fmt.Errorf("invalid Agent Plugin name")
	}
	root, err := a.directoryPath(".llm-hub/agent-plugins/"+name, true)
	if err != nil {
		return nil, err
	}
	result := []AgentPluginFile{}
	if _, statErr := os.Stat(root); os.IsNotExist(statErr) {
		return result, nil
	} else if statErr != nil {
		return nil, statErr
	}
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || entry.Name() == "install.json" {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("Agent Plugin symlinks are not allowed")
		}
		relative, relErr := filepath.Rel(root, path)
		if relErr != nil {
			return relErr
		}
		relative = filepath.ToSlash(relative)
		if relative != "plugin.json" && relative != "mcp.json" && !agentPluginReadableFilePattern.MatchString(relative) {
			return nil
		}
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		result = append(result, AgentPluginFile{Path: relative, Content: base64.StdEncoding.EncodeToString(content)})
		return nil
	})
	return result, err
}

func (a *App) SetAgentPluginEnabled(name string, enabled bool) error {
	a.pluginMu.Lock()
	defer a.pluginMu.Unlock()
	if !safeAgentPluginName(name) {
		return fmt.Errorf("invalid Agent Plugin name")
	}
	path, err := a.directoryPath(".llm-hub/agent-plugins/"+name+"/install.json", false)
	if err != nil {
		return err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var install AgentPluginInstall
	if json.Unmarshal(content, &install) != nil || install.Name != name {
		return fmt.Errorf("invalid install metadata")
	}
	install.Enabled = enabled
	next, _ := json.MarshalIndent(install, "", "  ")
	return os.WriteFile(path, next, 0o644)
}

func (a *App) UninstallAgentPlugin(name string) error {
	a.pluginMu.Lock()
	defer a.pluginMu.Unlock()
	if !safeAgentPluginName(name) {
		return fmt.Errorf("invalid Agent Plugin name")
	}
	target, err := a.directoryPath(".llm-hub/agent-plugins/"+name, false)
	if err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(target, "install.json")); err != nil {
		return fmt.Errorf("unmanaged Agent Plugin cannot be uninstalled")
	}
	return os.RemoveAll(target)
}
