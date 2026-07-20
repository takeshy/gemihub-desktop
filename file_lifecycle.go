package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type FileHistoryEntry struct {
	ID        string `json:"id"`
	Path      string `json:"path"`
	Timestamp int64  `json:"timestamp"`
	Size      int    `json:"size"`
	Binary    bool   `json:"binary"`
}
type storedFileHistory struct {
	FileHistoryEntry
	Content string `json:"content"`
}
type TrashEntry struct {
	ID           string `json:"id"`
	OriginalPath string `json:"originalPath"`
	Name         string `json:"name"`
	DeletedAt    int64  `json:"deletedAt"`
	Scope        string `json:"scope"`
}

func pathInside(base, target string) bool {
	rel, err := filepath.Rel(base, target)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}
func (a *App) lifecycleBase(target string) (string, string) {
	if workspace := a.GetWorkspacePath(); workspace != "" && pathInside(workspace, target) {
		return workspace, "workspace"
	}
	return a.GetDirectoryBase(), "files"
}
func historyPathKey(path string) string {
	sum := sha256.Sum256([]byte(filepath.ToSlash(path)))
	return hex.EncodeToString(sum[:])
}
func (a *App) recordFileVersion(path, target string) error {
	if info, statErr := os.Stat(target); statErr == nil && info.Size() > 64*1024*1024 {
		// History is best-effort and must never load multi-gigabyte documents into memory.
		return nil
	}
	data, err := os.ReadFile(target)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	base, _ := a.lifecycleBase(target)
	if base == "" {
		return nil
	}
	now := time.Now()
	id := fmt.Sprintf("%d", now.UnixNano())
	binary := isBinaryFileName(filepath.Base(target)) || strings.IndexByte(string(data), 0) >= 0
	entry := storedFileHistory{FileHistoryEntry: FileHistoryEntry{ID: id, Path: filepath.ToSlash(path), Timestamp: now.UnixMilli(), Size: len(data), Binary: binary}, Content: base64.StdEncoding.EncodeToString(data)}
	dir := filepath.Join(base, ".llm-hub", "history", historyPathKey(path))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	payload, _ := json.Marshal(entry)
	if err := os.WriteFile(filepath.Join(dir, id+".json"), payload, 0o600); err != nil {
		return err
	}
	files, _ := os.ReadDir(dir)
	if len(files) > 50 {
		sort.Slice(files, func(i, j int) bool { return files[i].Name() > files[j].Name() })
		for _, file := range files[50:] {
			_ = os.Remove(filepath.Join(dir, file.Name()))
		}
	}
	return nil
}
func (a *App) ListFileHistory(path string) ([]FileHistoryEntry, error) {
	target, err := a.directoryPath(path, true)
	if err != nil {
		return nil, err
	}
	base, _ := a.lifecycleBase(target)
	dir := filepath.Join(base, ".llm-hub", "history", historyPathKey(path))
	files, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return []FileHistoryEntry{}, nil
	}
	if err != nil {
		return nil, err
	}
	result := []FileHistoryEntry{}
	for _, file := range files {
		data, e := os.ReadFile(filepath.Join(dir, file.Name()))
		if e != nil {
			continue
		}
		var stored storedFileHistory
		if json.Unmarshal(data, &stored) == nil {
			result = append(result, stored.FileHistoryEntry)
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Timestamp > result[j].Timestamp })
	return result, nil
}
func (a *App) RestoreFileHistory(path, id string) error {
	target, err := a.directoryPath(path, true)
	if err != nil {
		return err
	}
	base, _ := a.lifecycleBase(target)
	data, err := os.ReadFile(filepath.Join(base, ".llm-hub", "history", historyPathKey(path), filepath.Base(id)+".json"))
	if err != nil {
		return err
	}
	var stored storedFileHistory
	if err = json.Unmarshal(data, &stored); err != nil {
		return err
	}
	content, err := base64.StdEncoding.DecodeString(stored.Content)
	if err != nil {
		return err
	}
	current, err := os.ReadFile(target)
	if err == nil && bytes.Equal(current, content) {
		return nil
	}
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	_ = a.recordFileVersion(path, target)
	if err = os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, content, 0o644)
}
func copyRegularFile(source, destination string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	return os.WriteFile(destination, data, 0o644)
}
func (a *App) DuplicateFile(path string) (string, error) {
	resultPath := path
	resultPrefix := ""
	if stripped, ok := stripPathScope(path, "workspace"); ok {
		resultPath, resultPrefix = stripped, "workspace://"
	} else if stripped, ok := stripPathScope(path, "files"); ok {
		resultPath, resultPrefix = stripped, "files://"
	}
	source, err := a.directoryPath(path, false)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(source)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", fmt.Errorf("directory duplication is not supported")
	}
	ext := filepath.Ext(source)
	stem := strings.TrimSuffix(filepath.Base(source), ext)
	dir := filepath.Dir(source)
	var destination string
	var name string
	for i := 1; ; i++ {
		suffix := " copy"
		if i > 1 {
			suffix = fmt.Sprintf(" copy %d", i)
		}
		name = stem + suffix + ext
		destination = filepath.Join(dir, name)
		if _, e := os.Stat(destination); os.IsNotExist(e) {
			break
		}
	}
	if err = copyRegularFile(source, destination); err != nil {
		return "", err
	}
	rel := filepath.ToSlash(filepath.Join(filepath.ToSlash(filepath.Dir(resultPath)), name))
	return resultPrefix + strings.TrimPrefix(rel, "./"), nil
}
func (a *App) TrashFile(path string) error {
	target, err := a.directoryPath(path, false)
	if err != nil {
		return err
	}
	base, scope := a.lifecycleBase(target)
	id := fmt.Sprintf("%d", time.Now().UnixNano())
	dir := filepath.Join(base, ".llm-hub", "trash", id)
	if err = os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	entry := TrashEntry{ID: scope + ":" + id, OriginalPath: filepath.ToSlash(path), Name: filepath.Base(target), DeletedAt: time.Now().UnixMilli(), Scope: scope}
	payload, _ := json.Marshal(entry)
	if err = os.WriteFile(filepath.Join(dir, "meta.json"), payload, 0o600); err != nil {
		return err
	}
	return os.Rename(target, filepath.Join(dir, entry.Name))
}
func (a *App) ListTrash() ([]TrashEntry, error) {
	result := []TrashEntry{}
	seen := map[string]struct{}{}
	bases := []struct{ base, scope string }{{a.GetDirectoryBase(), "files"}, {a.GetWorkspacePath(), "workspace"}}
	for _, item := range bases {
		if item.base == "" {
			continue
		}
		dirs, _ := os.ReadDir(filepath.Join(item.base, ".llm-hub", "trash"))
		for _, dir := range dirs {
			data, e := os.ReadFile(filepath.Join(item.base, ".llm-hub", "trash", dir.Name(), "meta.json"))
			if e != nil {
				continue
			}
			var entry TrashEntry
			if json.Unmarshal(data, &entry) == nil {
				if _, duplicate := seen[entry.ID]; duplicate {
					continue
				}
				seen[entry.ID] = struct{}{}
				result = append(result, entry)
			}
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].DeletedAt > result[j].DeletedAt })
	return result, nil
}
func (a *App) RestoreTrash(id string) error {
	parts := strings.SplitN(id, ":", 2)
	if len(parts) != 2 {
		return fmt.Errorf("invalid trash id")
	}
	base := a.GetDirectoryBase()
	if parts[0] == "workspace" {
		base = a.GetWorkspacePath()
	}
	dir := filepath.Join(base, ".llm-hub", "trash", filepath.Base(parts[1]))
	data, err := os.ReadFile(filepath.Join(dir, "meta.json"))
	if err != nil {
		return err
	}
	var entry TrashEntry
	if err = json.Unmarshal(data, &entry); err != nil {
		return err
	}
	target, err := a.directoryPath(entry.OriginalPath, true)
	if err != nil {
		return err
	}
	if _, err = os.Stat(target); err == nil {
		return fmt.Errorf("restore target already exists")
	}
	if err = os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	if err = os.Rename(filepath.Join(dir, entry.Name), target); err != nil {
		return err
	}
	return os.RemoveAll(dir)
}
