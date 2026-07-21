package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type WorkspaceDirectoryMoveResult struct {
	WorkspacePath string `json:"workspacePath"`
	OriginalPath  string `json:"originalPath"`
	LinkCreated   bool   `json:"linkCreated"`
}

var reservedWorkspaceNames = map[string]struct{}{
	"dashboards": {}, "memos": {}, "secrets": {}, "skills": {},
	"workflows": {}, ".llm-hub": {}, ".gemihub": {},
}

func validateWorkspaceDirectoryName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." || filepath.Base(name) != name || strings.ContainsAny(name, `/\`) {
		return "", fmt.Errorf("destination must be a single directory name")
	}
	if strings.ContainsAny(name, `<>:"|?*`) || strings.HasSuffix(name, ".") {
		return "", fmt.Errorf("destination name contains characters unsupported on Windows")
	}
	for _, character := range name {
		if character < 32 {
			return "", fmt.Errorf("destination name contains control characters")
		}
	}
	windowsStem := strings.ToLower(strings.SplitN(name, ".", 2)[0])
	if windowsStem == "con" || windowsStem == "prn" || windowsStem == "aux" || windowsStem == "nul" ||
		(len(windowsStem) == 4 && (strings.HasPrefix(windowsStem, "com") || strings.HasPrefix(windowsStem, "lpt")) && windowsStem[3] >= '1' && windowsStem[3] <= '9') {
		return "", fmt.Errorf("%q is reserved by Windows", name)
	}
	if _, reserved := reservedWorkspaceNames[strings.ToLower(name)]; reserved {
		return "", fmt.Errorf("%q is reserved by GemiHub", name)
	}
	return name, nil
}

func ensureTreeHasNoSymlinks(root string) error {
	return filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("directory contains a symbolic link: %s", path)
		}
		return nil
	})
}

func moveDirectory(source, destination string) error {
	return moveDirectoryWithRetry(source, destination, os.Rename, time.Sleep)
}

func moveDirectoryWith(source, destination string, rename func(string, string) error) error {
	return moveDirectoryWithRetry(source, destination, rename, func(time.Duration) {})
}

// moveDirectoryWithRetry keeps directory adoption atomic. In particular, it
// deliberately does not fall back to copy + delete: on Windows a process that
// blocks rename commonly blocks cleanup too, which would leave two trees.
func moveDirectoryWithRetry(source, destination string, rename func(string, string) error, wait func(time.Duration)) error {
	delays := [...]time.Duration{50 * time.Millisecond, 100 * time.Millisecond, 200 * time.Millisecond, 400 * time.Millisecond, 800 * time.Millisecond}
	var lastErr error
	for attempt := 0; attempt <= len(delays); attempt++ {
		if err := rename(source, destination); err == nil {
			return nil
		} else {
			lastErr = err
		}
		if attempt < len(delays) {
			wait(delays[attempt])
		}
	}
	return fmt.Errorf("move directory after retrying: %w; close Explorer, terminals, editors, or MCP processes using %s and try again", lastErr, source)
}

func moveRegularFile(source, destination string) error {
	if err := os.Rename(source, destination); err != nil {
		return fmt.Errorf("move file: %w", err)
	}
	return nil
}

// MovePathIntoWorkspace moves an external file or directory into a Workspace
// directory. path is resolved against Files; destinationDirectory is relative
// to the active Workspace. Links are supported for directories only.
func (a *App) MovePathIntoWorkspace(path, destinationDirectory, destinationName string, leaveLink bool) (*WorkspaceDirectoryMoveResult, error) {
	if _, workspaceScoped := stripPathScope(path, "workspace"); workspaceScoped {
		return nil, fmt.Errorf("Workspace path cannot be used as an external move source")
	}
	relative, _ := stripPathScope(path, "files")
	source, err := a.directoryPath("files://"+relative, false)
	if err != nil {
		return nil, err
	}
	return a.moveResolvedPathIntoWorkspace(source, destinationDirectory, destinationName, leaveLink)
}

// MoveLocalPathIntoWorkspace moves an absolute path dropped by the operating
// system into a Workspace directory. It uses the same validation and optional
// directory-link behavior as moving an item from Files.
func (a *App) MoveLocalPathIntoWorkspace(path, destinationDirectory, destinationName string, leaveLink bool) (*WorkspaceDirectoryMoveResult, error) {
	source := filepath.Clean(strings.TrimSpace(path))
	if !filepath.IsAbs(source) {
		return nil, fmt.Errorf("dropped path must be absolute")
	}
	workspaceBase := a.GetWorkspacePath()
	if workspaceBase == "" {
		return nil, fmt.Errorf("active Workspace is not configured")
	}
	if pathInside(workspaceBase, source) {
		return nil, fmt.Errorf("source is already inside the active Workspace")
	}
	return a.moveResolvedPathIntoWorkspace(source, destinationDirectory, destinationName, leaveLink)
}

func (a *App) moveResolvedPathIntoWorkspace(source, destinationDirectory, destinationName string, leaveLink bool) (*WorkspaceDirectoryMoveResult, error) {
	name, err := validateWorkspaceDirectoryName(destinationName)
	if err != nil {
		return nil, err
	}
	info, err := os.Lstat(source)
	if err != nil {
		return nil, err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("symbolic links cannot be moved into the Workspace")
	}
	if !info.IsDir() && !info.Mode().IsRegular() {
		return nil, fmt.Errorf("only files and directories can be moved into the Workspace")
	}
	if leaveLink && !info.IsDir() {
		return nil, fmt.Errorf("links can only be left for directories")
	}
	if info.IsDir() {
		if err := ensureTreeHasNoSymlinks(source); err != nil {
			return nil, err
		}
	}
	workspaceBase := a.GetWorkspacePath()
	if workspaceBase == "" {
		return nil, fmt.Errorf("active Workspace is not configured")
	}
	targetParent, err := a.workspacePath(destinationDirectory, true)
	if err != nil {
		return nil, err
	}
	parentInfo, err := os.Stat(targetParent)
	if err != nil || !parentInfo.IsDir() {
		return nil, fmt.Errorf("Workspace destination is not a directory")
	}
	destination := filepath.Join(targetParent, name)
	if err := requirePathInside(workspaceBase, destination); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(targetParent)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if strings.EqualFold(entry.Name(), name) {
			return nil, fmt.Errorf("destination already contains %q", entry.Name())
		}
	}
	if info.IsDir() {
		if err := requireIndependentDirectories(source, workspaceBase); err != nil {
			return nil, err
		}
		if err := moveDirectory(source, destination); err != nil {
			return nil, err
		}
	} else if err := moveRegularFile(source, destination); err != nil {
		return nil, err
	}
	linked := false
	if leaveLink {
		if err := createDirectoryLink(source, destination); err != nil {
			rollbackErr := moveDirectory(destination, source)
			if rollbackErr != nil {
				return nil, fmt.Errorf("create original-location link: %w; rollback failed: %v", err, rollbackErr)
			}
			return nil, fmt.Errorf("create original-location link: %w", err)
		}
		linked = true
	}
	relative, _ := filepath.Rel(workspaceBase, destination)
	return &WorkspaceDirectoryMoveResult{WorkspacePath: filepath.ToSlash(relative), OriginalPath: source, LinkCreated: linked}, nil
}

// MoveDirectoryIntoWorkspace adopts a directory from Files into the active
// Workspace root. The optional link is a local convenience only and is never
// required for the Workspace copy to remain usable on another device.
func (a *App) MoveDirectoryIntoWorkspace(path, destinationName string, leaveLink bool) (*WorkspaceDirectoryMoveResult, error) {
	name, err := validateWorkspaceDirectoryName(destinationName)
	if err != nil {
		return nil, err
	}
	source, err := a.directoryPath(path, false)
	if err != nil {
		return nil, err
	}
	info, err := os.Lstat(source)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("only real directories can be moved into the Workspace")
	}
	if err := ensureTreeHasNoSymlinks(source); err != nil {
		return nil, err
	}
	workspaceBase := a.GetWorkspacePath()
	if workspaceBase == "" {
		return nil, fmt.Errorf("active Workspace is not configured")
	}
	destination := filepath.Join(workspaceBase, name)
	if err := requirePathInside(workspaceBase, destination); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(workspaceBase)
	if err != nil {
		return nil, err
	}
	for _, entry := range entries {
		if strings.EqualFold(entry.Name(), name) {
			return nil, fmt.Errorf("Workspace already contains %q", entry.Name())
		}
	}
	if _, err := os.Lstat(destination); !os.IsNotExist(err) {
		if err == nil {
			return nil, fmt.Errorf("Workspace already contains %q", name)
		}
		return nil, err
	}
	if err := requireIndependentDirectories(source, workspaceBase); err != nil {
		return nil, err
	}
	if err := moveDirectory(source, destination); err != nil {
		return nil, err
	}
	linked := false
	if leaveLink {
		if err := createDirectoryLink(source, destination); err != nil {
			rollbackErr := moveDirectory(destination, source)
			if rollbackErr != nil {
				return nil, fmt.Errorf("create original-location link: %w; rollback failed: %v", err, rollbackErr)
			}
			return nil, fmt.Errorf("create original-location link: %w", err)
		}
		linked = true
	}
	return &WorkspaceDirectoryMoveResult{WorkspacePath: filepath.ToSlash(name), OriginalPath: source, LinkCreated: linked}, nil
}

func requireIndependentDirectories(source, workspace string) error {
	for _, pair := range [][2]string{{source, workspace}, {workspace, source}} {
		relative, err := filepath.Rel(pair[0], pair[1])
		if err == nil && (relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))) {
			return fmt.Errorf("source directory and Workspace cannot contain each other")
		}
	}
	return nil
}
