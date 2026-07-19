package main

import (
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// FileTreeNode is a filesystem entry rooted at DirectoryBase. Paths returned
// to the frontend are always slash-separated and relative to DirectoryBase.
type FileTreeNode struct {
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	IsDir    bool           `json:"isDir"`
	Size     int64          `json:"size"`
	ModTime  int64          `json:"modTime"`
	Children []FileTreeNode `json:"children,omitempty"`
}

type FileSearchResult struct {
	Path    string `json:"path"`
	Name    string `json:"name"`
	Line    int    `json:"line,omitempty"`
	Preview string `json:"preview,omitempty"`
}

type DirectoryFileEntry struct {
	Path        string `json:"path"`
	Size        int64  `json:"size"`
	CreatedTime int64  `json:"createdTime"`
	ModTime     int64  `json:"modTime"`
	MD5         string `json:"md5"`
	Binary      bool   `json:"binary"`
}

type fileChecksumCacheEntry struct {
	size    int64
	modTime int64
	md5     string
}

var fileChecksumCache sync.Map

func streamedFileMD5(path string, info os.FileInfo) (string, error) {
	if cached, ok := fileChecksumCache.Load(path); ok {
		entry := cached.(fileChecksumCacheEntry)
		if entry.size == info.Size() && entry.modTime == info.ModTime().UnixNano() {
			return entry.md5, nil
		}
	}
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	value := hex.EncodeToString(hash.Sum(nil))
	fileChecksumCache.Store(path, fileChecksumCacheEntry{size: info.Size(), modTime: info.ModTime().UnixNano(), md5: value})
	return value, nil
}

func (a *App) SelectDirectoryBase() (string, error) {
	path, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select Files Directory",
	})
	if err != nil || path == "" {
		return path, err
	}
	return a.SetDirectoryBase(path)
}

func (a *App) SetDirectoryBase(path string) (string, error) {
	if strings.TrimSpace(path) == "" {
		a.directoryMu.Lock()
		a.directoryBase = ""
		a.directoryMu.Unlock()
		return "", nil
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(real)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", fmt.Errorf("directory base is not a directory")
	}
	a.directoryMu.Lock()
	a.directoryBase = filepath.Clean(real)
	a.directoryMu.Unlock()
	return filepath.Clean(real), nil
}

func (a *App) GetDirectoryBase() string {
	a.directoryMu.RLock()
	defer a.directoryMu.RUnlock()
	return a.directoryBase
}

func (a *App) directoryPath(path string, allowMissing bool) (string, error) {
	path = strings.TrimSpace(path)
	forceWorkspace := strings.HasPrefix(strings.ToLower(path), "workspace://")
	forceProject := strings.HasPrefix(strings.ToLower(path), "project://")
	if forceWorkspace {
		path = path[len("workspace://"):]
	} else if forceProject {
		path = path[len("project://"):]
	}
	base := a.GetDirectoryBase()
	if forceProject {
		base = a.GetActiveProjectPath()
	} else if !forceWorkspace && isProjectResourcePath(path) {
		if projectBase := a.GetActiveProjectPath(); projectBase != "" {
			base = projectBase
		}
	}
	if base == "" {
		if forceProject {
			return "", fmt.Errorf("active project is not configured")
		}
		return "", fmt.Errorf("directory base is not configured")
	}
	return resolvePathInsideBase(base, path, allowMissing)
}

func (a *App) projectPath(path string, allowMissing bool) (string, error) {
	base := a.GetActiveProjectPath()
	if base == "" {
		return "", fmt.Errorf("active project is not configured")
	}
	return resolvePathInsideBase(base, strings.TrimSpace(path), allowMissing)
}

func resolvePathInsideBase(base, path string, allowMissing bool) (string, error) {
	rel := filepath.FromSlash(strings.TrimSpace(path))
	if filepath.IsAbs(rel) {
		var err error
		rel, err = filepath.Rel(base, rel)
		if err != nil {
			return "", err
		}
	}
	target := filepath.Clean(filepath.Join(base, rel))
	if err := requirePathInside(base, target); err != nil {
		return "", err
	}

	check := target
	if allowMissing {
		for {
			if _, err := os.Lstat(check); err == nil {
				break
			} else if !os.IsNotExist(err) {
				return "", err
			}
			parent := filepath.Dir(check)
			if parent == check {
				return "", fmt.Errorf("cannot resolve parent directory")
			}
			check = parent
		}
	}
	real, err := filepath.EvalSymlinks(check)
	if err != nil {
		return "", err
	}
	if err := requirePathInside(base, real); err != nil {
		return "", err
	}
	return target, nil
}

func isProjectResourcePath(path string) bool {
	normalized := strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(path)), "/")
	first := strings.SplitN(normalized, "/", 2)[0]
	if strings.EqualFold(first, ".llm-hub") {
		return true
	}
	for _, root := range projectResourceDirectories {
		if strings.EqualFold(first, root) {
			return true
		}
	}
	return false
}

func stripPathScope(path, scope string) (string, bool) {
	trimmed := strings.TrimSpace(path)
	prefix := scope + "://"
	if !strings.HasPrefix(strings.ToLower(trimmed), prefix) {
		return trimmed, false
	}
	return trimmed[len(prefix):], true
}

func requirePathInside(base, target string) error {
	rel, err := filepath.Rel(base, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("path is outside the directory base")
	}
	return nil
}

func (a *App) ListFileTree() ([]FileTreeNode, error) {
	base := a.GetDirectoryBase()
	if base == "" {
		return []FileTreeNode{}, nil
	}
	return buildFileTree(base, base)
}

// OpenContainingFolder opens a file's parent directory (or the directory
// itself) in the operating system's file manager.
func (a *App) OpenContainingFolder(path string) error {
	target, err := a.directoryPath(path, false)
	if err != nil {
		return err
	}
	info, err := os.Stat(target)
	if err != nil {
		return err
	}
	folder := target
	if !info.IsDir() {
		folder = filepath.Dir(target)
	}
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		command = exec.Command("explorer.exe", folder)
	case "darwin":
		command = exec.Command("open", folder)
	default:
		command = exec.Command("xdg-open", folder)
	}
	if err := command.Start(); err != nil {
		return err
	}
	return command.Process.Release()
}

func (a *App) ListProjectTree() ([]FileTreeNode, error) {
	base := a.GetActiveProjectPath()
	if base == "" {
		return []FileTreeNode{}, nil
	}
	return buildFileTree(base, base)
}

// ListProjectFiles returns every user file in the active project. It is kept
// separate from FileInventory because workspace and project files have
// different lifecycle and sync scopes.
func (a *App) ListProjectFiles() ([]DirectoryFileEntry, error) {
	return fileInventoryForBase(a.GetActiveProjectPath())
}

func (a *App) ReadProjectFile(path string) (*LocalFileResult, error) {
	target, err := a.projectPath(path, false)
	if err != nil {
		return nil, err
	}
	result, err := readLocalFile(target)
	if err != nil {
		return nil, err
	}
	result.Path = filepath.ToSlash(strings.TrimSpace(path))
	return result, nil
}

func (a *App) WriteProjectFile(path, content string) error {
	target, err := a.projectPath(path, true)
	if err != nil {
		return err
	}
	if isBinaryFileName(filepath.Base(target)) {
		return fmt.Errorf("refusing text write to binary file %q", filepath.Base(target))
	}
	if err := a.recordFileVersion(path, target); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".gemihub-project-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, target)
}

func (a *App) WriteProjectBinaryFile(path, contentBase64 string) error {
	target, err := a.projectPath(path, true)
	if err != nil {
		return err
	}
	content, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		return fmt.Errorf("invalid base64 content: %w", err)
	}
	if err := a.recordFileVersion(path, target); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, content, 0o644)
}

func (a *App) CreateProjectDirectory(path string) error {
	target, err := a.projectPath(path, true)
	if err != nil {
		return err
	}
	return os.MkdirAll(target, 0o755)
}

func (a *App) RenameProjectFile(oldPath, newPath string) error {
	oldTarget, err := a.projectPath(oldPath, false)
	if err != nil {
		return err
	}
	newTarget, err := a.projectPath(newPath, true)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(newTarget); err == nil {
		return fmt.Errorf("target already exists")
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(newTarget), 0o755); err != nil {
		return err
	}
	return os.Rename(oldTarget, newTarget)
}

func (a *App) DeleteProjectFile(path string) error {
	target, err := a.projectPath(path, false)
	if err != nil {
		return err
	}
	if target == a.GetActiveProjectPath() {
		return fmt.Errorf("cannot delete the active project")
	}
	info, err := os.Lstat(target)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return os.Remove(target)
	}
	return os.Remove(target)
}

func buildFileTree(base, dir string) ([]FileTreeNode, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	nodes := make([]FileTreeNode, 0, len(entries))
	for _, entry := range entries {
		// Workspace metadata and VCS internals are intentionally hidden from
		// the everyday file tree and LLM-facing list operation.
		if entry.Name() == ".git" || entry.Name() == ".llm-hub" || entry.Name() == "node_modules" {
			continue
		}
		absolute := filepath.Join(dir, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue
		}
		rel, _ := filepath.Rel(base, absolute)
		node := FileTreeNode{
			Name: entry.Name(), Path: filepath.ToSlash(rel), IsDir: entry.IsDir(),
			Size: info.Size(), ModTime: info.ModTime().UnixMilli(),
		}
		if entry.IsDir() && entry.Type()&os.ModeSymlink == 0 {
			node.Children, err = buildFileTree(base, absolute)
			if err != nil {
				node.Children = nil
			}
		}
		nodes = append(nodes, node)
	}
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].IsDir != nodes[j].IsDir {
			return nodes[i].IsDir
		}
		return strings.ToLower(nodes[i].Name) < strings.ToLower(nodes[j].Name)
	})
	return nodes, nil
}

func (a *App) ListPluginIDs() ([]string, error) {
	pluginsDir, err := a.directoryPath(".llm-hub/plugins", true)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(pluginsDir)
	if os.IsNotExist(err) {
		return []string{}, nil
	}
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() && !strings.ContainsAny(entry.Name(), `/\\`) {
			ids = append(ids, entry.Name())
		}
	}
	sort.Strings(ids)
	return ids, nil
}

func (a *App) ReadFile(path string) (*LocalFileResult, error) {
	// Reads are nullable at the Wails boundary: callers use a missing file as
	// the empty starting point when creating Timeline and other Workspace data.
	target, err := a.directoryPath(path, true)
	if err != nil {
		return nil, err
	}
	result, err := readLocalFile(target)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	result.Path = filepath.ToSlash(strings.TrimSpace(path))
	return result, nil
}

func (a *App) WriteFile(path, content string) error {
	target, err := a.directoryPath(path, true)
	if err != nil {
		return err
	}
	if isBinaryFileName(filepath.Base(target)) {
		return fmt.Errorf("refusing text write to binary file %q; use WriteBinaryFile", filepath.Base(target))
	}
	if err := a.recordFileVersion(path, target); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".llm-hub-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, target)
}

func (a *App) CreateDirectory(path string) error {
	target, err := a.directoryPath(path, true)
	if err != nil {
		return err
	}
	return os.MkdirAll(target, 0o755)
}

func (a *App) RenameFile(oldPath, newPath string) error {
	oldProjectPath, projectScoped := stripPathScope(oldPath, "project")
	_, workspaceScoped := stripPathScope(oldPath, "workspace")
	oldProjectPath = strings.Trim(filepath.ToSlash(oldProjectPath), "/")
	if !workspaceScoped && (projectScoped || isProjectResourcePath(oldPath)) && isProjectResourcePath(oldProjectPath) && !strings.Contains(oldProjectPath, "/") {
		return fmt.Errorf("cannot rename a project resource directory")
	}
	oldTarget, err := a.directoryPath(oldPath, false)
	if err != nil {
		return err
	}
	newTarget, err := a.directoryPath(newPath, true)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(newTarget); err == nil {
		return fmt.Errorf("target already exists")
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(newTarget), 0o755); err != nil {
		return err
	}
	return os.Rename(oldTarget, newTarget)
}

func (a *App) DeleteFile(path string) error {
	target, err := a.directoryPath(path, false)
	if err != nil {
		return err
	}
	if target == a.GetDirectoryBase() {
		return fmt.Errorf("cannot delete the directory base")
	}
	if target == a.GetActiveProjectPath() {
		return fmt.Errorf("cannot delete the active project")
	}
	projectPath, projectScoped := stripPathScope(path, "project")
	_, workspaceScoped := stripPathScope(path, "workspace")
	projectPath = strings.Trim(filepath.ToSlash(projectPath), "/")
	if !workspaceScoped && (projectScoped || isProjectResourcePath(path)) && isProjectResourcePath(projectPath) && !strings.Contains(projectPath, "/") {
		return fmt.Errorf("cannot delete a project resource directory")
	}
	info, err := os.Lstat(target)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return os.Remove(target) // only empty directories are removable
	}
	return os.Remove(target)
}

func (a *App) SearchFiles(query string, limit int) ([]FileSearchResult, error) {
	base := a.GetDirectoryBase()
	return searchFilesInBase(base, query, limit)
}

func (a *App) SearchProjectFiles(query string, limit int) ([]FileSearchResult, error) {
	return searchFilesInBase(a.GetActiveProjectPath(), query, limit)
}

func searchFilesInBase(base, query string, limit int) ([]FileSearchResult, error) {
	if base == "" {
		return []FileSearchResult{}, nil
	}
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return []FileSearchResult{}, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	results := make([]FileSearchResult, 0, limit)
	err := filepath.WalkDir(base, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || len(results) >= limit {
			return walkErr
		}
		if entry.IsDir() {
			if path != base && (entry.Name() == ".git" || entry.Name() == ".llm-hub" || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(base, path)
		if strings.Contains(strings.ToLower(filepath.ToSlash(rel)), query) {
			results = append(results, FileSearchResult{Path: filepath.ToSlash(rel), Name: entry.Name()})
			return nil
		}
		info, err := entry.Info()
		if err != nil || info.Size() > 2*1024*1024 || isBinaryFileName(entry.Name()) {
			return nil
		}
		bytes, err := os.ReadFile(path)
		if err != nil || strings.IndexByte(string(bytes), 0) >= 0 {
			return nil
		}
		for index, line := range strings.Split(string(bytes), "\n") {
			if strings.Contains(strings.ToLower(line), query) {
				preview := strings.TrimSpace(line)
				if len(preview) > 180 {
					preview = preview[:180] + "…"
				}
				results = append(results, FileSearchResult{Path: filepath.ToSlash(rel), Name: entry.Name(), Line: index + 1, Preview: preview})
				break
			}
		}
		return nil
	})
	return results, err
}

func (a *App) FileInventory() ([]DirectoryFileEntry, error) {
	base := a.GetDirectoryBase()
	workspace, err := fileInventoryForBase(base)
	if err != nil {
		return nil, err
	}
	projectBase := a.GetActiveProjectPath()
	project, err := fileInventoryForBase(projectBase)
	if err != nil {
		return nil, err
	}
	byPath := make(map[string]DirectoryFileEntry, len(workspace)+len(project))
	for _, item := range workspace {
		if isProjectResourcePath(item.Path) {
			continue
		}
		byPath[item.Path] = item
	}
	for _, item := range project {
		if isProjectResourcePath(item.Path) {
			byPath[item.Path] = item
		}
	}
	result := make([]DirectoryFileEntry, 0, len(byPath))
	for _, item := range byPath {
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Path < result[j].Path })
	return result, nil
}

func fileInventoryForBase(base string) ([]DirectoryFileEntry, error) {
	if base == "" {
		return []DirectoryFileEntry{}, nil
	}
	result := make([]DirectoryFileEntry, 0)
	err := filepath.WalkDir(base, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path != base && (entry.Name() == ".git" || entry.Name() == ".llm-hub" || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(base, path)
		if isBinaryFileName(entry.Name()) {
			checksum := ""
			// Files transported through the project API need a content checksum
			// for Drive sync conflict resolution. Hash them as a stream and cache
			// by size+mtime so repeated inventories do not reread large media.
			if shouldReadAsDataURL(entry.Name()) {
				checksum, _ = streamedFileMD5(path, info)
			}
			result = append(result, DirectoryFileEntry{
				Path: filepath.ToSlash(rel), Size: info.Size(), CreatedTime: fileCreatedTime(info), ModTime: info.ModTime().UnixMilli(), MD5: checksum, Binary: true,
			})
			return nil
		}
		bytes, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		sum := md5.Sum(bytes)
		binary := strings.IndexByte(string(bytes), 0) >= 0
		result = append(result, DirectoryFileEntry{
			Path: filepath.ToSlash(rel), Size: info.Size(), CreatedTime: fileCreatedTime(info), ModTime: info.ModTime().UnixMilli(),
			MD5: hex.EncodeToString(sum[:]), Binary: binary,
		})
		return nil
	})
	return result, err
}

func (a *App) WriteBinaryFile(path, contentBase64 string) error {
	target, err := a.directoryPath(path, true)
	if err != nil {
		return err
	}
	bytes, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		return fmt.Errorf("invalid base64 content: %w", err)
	}
	if err := a.recordFileVersion(path, target); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return os.WriteFile(target, bytes, 0o644)
}
