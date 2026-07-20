package main

import (
	"bytes"
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
	forceFiles := strings.HasPrefix(strings.ToLower(path), "files://")
	forceWorkspace := strings.HasPrefix(strings.ToLower(path), "workspace://")
	if forceFiles {
		path = path[len("files://"):]
	} else if forceWorkspace {
		path = path[len("workspace://"):]
	}
	base := a.GetDirectoryBase()
	if forceWorkspace {
		base = a.GetWorkspacePath()
	} else if !forceFiles && isWorkspaceResourcePath(path) {
		if workspaceBase := a.GetWorkspacePath(); workspaceBase != "" {
			base = workspaceBase
		}
	}
	if base == "" {
		if forceWorkspace {
			return "", fmt.Errorf("active Workspace is not configured")
		}
		return "", fmt.Errorf("directory base is not configured")
	}
	return resolvePathInsideBase(base, path, allowMissing)
}

func (a *App) workspacePath(path string, allowMissing bool) (string, error) {
	base := a.GetWorkspacePath()
	if base == "" {
		return "", fmt.Errorf("active Workspace is not configured")
	}
	path = strings.TrimSpace(path)
	if strings.HasPrefix(strings.ToLower(path), "workspace://") {
		path = path[len("workspace://"):]
	} else if strings.HasPrefix(strings.ToLower(path), "files://") {
		return "", fmt.Errorf("Files path cannot be used with the Workspace file API")
	}
	return resolvePathInsideBase(base, path, allowMissing)
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

func isWorkspaceResourcePath(path string) bool {
	normalized := strings.TrimLeft(filepath.ToSlash(strings.TrimSpace(path)), "/")
	first := strings.SplitN(normalized, "/", 2)[0]
	if strings.EqualFold(first, ".llm-hub") {
		return true
	}
	for _, root := range workspaceResourceDirectories {
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

func (a *App) ListWorkspaceTree() ([]FileTreeNode, error) {
	base := a.GetWorkspacePath()
	if base == "" {
		return []FileTreeNode{}, nil
	}
	return buildFileTree(base, base)
}

// ListWorkspaceFiles returns every user file in the active Workspace. It is kept
// separate from FileInventory because Files and Workspace files have
// different lifecycle and sync scopes.
func (a *App) ListWorkspaceFiles() ([]DirectoryFileEntry, error) {
	return fileInventoryForBase(a.GetWorkspacePath())
}

// ListWorkspaceDirectoryFiles returns file paths below one Workspace directory
// without hashing every file in the Workspace. It is intended for focused
// views such as Timeline, whose data lives under a known directory.
func (a *App) ListWorkspaceDirectoryFiles(path string) ([]string, error) {
	target, err := a.workspacePath(path, true)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(target); err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}
	base := a.GetWorkspacePath()
	result := []string{}
	err = filepath.WalkDir(target, func(current string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		relative, relErr := filepath.Rel(base, current)
		if relErr != nil {
			return relErr
		}
		result = append(result, filepath.ToSlash(relative))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(result)
	return result, nil
}

// ListWorkspaceDirectoryEntries returns lightweight metadata for files below
// one Workspace directory. Unlike ListWorkspaceFiles it does not hash or read
// file contents, so focused data views can obtain timestamps without scanning
// the entire Workspace.
func (a *App) ListWorkspaceDirectoryEntries(path string) ([]DirectoryFileEntry, error) {
	target, err := a.workspacePath(path, true)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(target); err != nil {
		if os.IsNotExist(err) {
			return []DirectoryFileEntry{}, nil
		}
		return nil, err
	}
	base := a.GetWorkspacePath()
	result := []DirectoryFileEntry{}
	err = filepath.WalkDir(target, func(current string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if current != target && (entry.Name() == ".git" || entry.Name() == ".llm-hub" || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return nil
		}
		relative, relErr := filepath.Rel(base, current)
		if relErr != nil {
			return relErr
		}
		result = append(result, DirectoryFileEntry{
			Path: filepath.ToSlash(relative), Size: info.Size(),
			CreatedTime: fileCreatedTime(current, info), ModTime: info.ModTime().UnixMilli(),
			Binary: isBinaryFileName(entry.Name()),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Path < result[j].Path })
	return result, nil
}

func (a *App) ReadWorkspaceFile(path string) (*LocalFileResult, error) {
	// Missing files are a valid empty starting point for Timeline entries and
	// other Workspace data that is created on first write.
	target, err := a.workspacePath(path, true)
	if err != nil {
		return nil, err
	}
	result, err := readLocalFile(target)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	result.Path = filepath.ToSlash(strings.TrimSpace(path))
	return result, nil
}

func (a *App) WriteWorkspaceFile(path, content string) error {
	target, err := a.workspacePath(path, true)
	if err != nil {
		return err
	}
	if isBinaryFileName(filepath.Base(target)) {
		return fmt.Errorf("refusing text write to binary file %q", filepath.Base(target))
	}
	unchanged, err := fileContentMatches(target, []byte(content))
	if err != nil {
		return err
	}
	if unchanged {
		return nil
	}
	if err := a.recordFileVersion(path, target); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(target), ".gemihub-workspace-*.tmp")
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

func (a *App) WriteWorkspaceBinaryFile(path, contentBase64 string) error {
	target, err := a.workspacePath(path, true)
	if err != nil {
		return err
	}
	content, err := base64.StdEncoding.DecodeString(contentBase64)
	if err != nil {
		return fmt.Errorf("invalid base64 content: %w", err)
	}
	unchanged, err := fileContentMatches(target, content)
	if err != nil {
		return err
	}
	if unchanged {
		return nil
	}
	if err := a.recordFileVersion(path, target); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return writeUserFileAtomic(target, content)
}

func (a *App) CreateWorkspaceDirectory(path string) error {
	target, err := a.workspacePath(path, true)
	if err != nil {
		return err
	}
	return os.MkdirAll(target, 0o755)
}

func (a *App) RenameWorkspaceFile(oldPath, newPath string) error {
	oldTarget, err := a.workspacePath(oldPath, false)
	if err != nil {
		return err
	}
	newTarget, err := a.workspacePath(newPath, true)
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

func (a *App) DeleteWorkspaceFile(path string) error {
	target, err := a.workspacePath(path, false)
	if err != nil {
		return err
	}
	if target == a.GetWorkspacePath() {
		return fmt.Errorf("cannot delete the active Workspace")
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
	unchanged, err := fileContentMatches(target, []byte(content))
	if err != nil {
		return err
	}
	if unchanged {
		return nil
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
	oldWorkspacePath, workspaceScoped := stripPathScope(oldPath, "workspace")
	_, filesScoped := stripPathScope(oldPath, "files")
	oldWorkspacePath = strings.Trim(filepath.ToSlash(oldWorkspacePath), "/")
	if !filesScoped && (workspaceScoped || isWorkspaceResourcePath(oldPath)) && isWorkspaceResourcePath(oldWorkspacePath) && !strings.Contains(oldWorkspacePath, "/") {
		return fmt.Errorf("cannot rename a Workspace resource directory")
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
	if target == a.GetWorkspacePath() {
		return fmt.Errorf("cannot delete the active Workspace")
	}
	workspacePath, workspaceScoped := stripPathScope(path, "workspace")
	_, filesScoped := stripPathScope(path, "files")
	workspacePath = strings.Trim(filepath.ToSlash(workspacePath), "/")
	if !filesScoped && (workspaceScoped || isWorkspaceResourcePath(path)) && isWorkspaceResourcePath(workspacePath) && !strings.Contains(workspacePath, "/") {
		return fmt.Errorf("cannot delete a Workspace resource directory")
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

func (a *App) SearchWorkspaceFiles(query string, limit int) ([]FileSearchResult, error) {
	return searchFilesInBase(a.GetWorkspacePath(), query, limit)
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
	workspaceBase := a.GetWorkspacePath()
	workspaceFiles, err := fileInventoryForBase(workspaceBase)
	if err != nil {
		return nil, err
	}
	byPath := make(map[string]DirectoryFileEntry, len(workspace)+len(workspaceFiles))
	for _, item := range workspace {
		if isWorkspaceResourcePath(item.Path) {
			continue
		}
		byPath[item.Path] = item
	}
	for _, item := range workspaceFiles {
		if isWorkspaceResourcePath(item.Path) {
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
			// Files transported through the Workspace API need a content checksum
			// for Drive sync conflict resolution. Hash them as a stream and cache
			// by size+mtime so repeated inventories do not reread large media.
			if shouldReadAsDataURL(entry.Name()) {
				checksum, _ = streamedFileMD5(path, info)
			}
			result = append(result, DirectoryFileEntry{
				Path: filepath.ToSlash(rel), Size: info.Size(), CreatedTime: fileCreatedTime(path, info), ModTime: info.ModTime().UnixMilli(), MD5: checksum, Binary: true,
			})
			return nil
		}
		checksum, err := streamedFileMD5(path, info)
		if err != nil {
			return nil
		}
		file, err := os.Open(path)
		if err != nil {
			return nil
		}
		sample := make([]byte, 8192)
		count, _ := file.Read(sample)
		_ = file.Close()
		binary := bytes.IndexByte(sample[:count], 0) >= 0
		result = append(result, DirectoryFileEntry{
			Path: filepath.ToSlash(rel), Size: info.Size(), CreatedTime: fileCreatedTime(path, info), ModTime: info.ModTime().UnixMilli(),
			MD5: checksum, Binary: binary,
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
	unchanged, err := fileContentMatches(target, bytes)
	if err != nil {
		return err
	}
	if unchanged {
		return nil
	}
	if err := a.recordFileVersion(path, target); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	return writeUserFileAtomic(target, bytes)
}

func fileContentMatches(target string, content []byte) (bool, error) {
	current, err := os.ReadFile(target)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return bytes.Equal(current, content), nil
}

func writeUserFileAtomic(target string, content []byte) error {
	temporary, err := os.CreateTemp(filepath.Dir(target), ".gemihub-binary-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o644); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return replaceRAGFile(temporaryPath, target)
}
