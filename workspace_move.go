package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
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

func copyDirectoryTree(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relative)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return os.MkdirAll(target, info.Mode().Perm())
		}
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, info.Mode().Perm())
		if err != nil {
			_ = input.Close()
			return err
		}
		_, copyErr := io.Copy(output, input)
		inputCloseErr := input.Close()
		closeErr := output.Close()
		if copyErr != nil {
			return copyErr
		}
		if inputCloseErr != nil {
			return inputCloseErr
		}
		return closeErr
	})
}

func moveDirectory(source, destination string) error {
	if err := os.Rename(source, destination); err == nil {
		return nil
	} else {
		if _, destinationErr := os.Lstat(destination); destinationErr == nil {
			return fmt.Errorf("destination appeared while moving: %s", destination)
		} else if !os.IsNotExist(destinationErr) {
			return destinationErr
		}
		// Rename commonly fails with EXDEV for a cross-volume move. Copying is a
		// safe fallback for that and for platform-specific equivalents.
		if copyErr := copyDirectoryTree(source, destination); copyErr != nil {
			_ = os.RemoveAll(destination)
			return fmt.Errorf("move directory: %w (copy fallback: %v)", err, copyErr)
		}
		// On Windows a directory can reject rename while one of its children is
		// open without denying removal of the remaining tree. Renaming the source
		// to a staging name therefore makes the copy fallback fail unnecessarily.
		// Remove the original tree directly and discard the copy if that fails.
		if removeErr := os.RemoveAll(source); removeErr != nil {
			_ = os.RemoveAll(destination)
			return fmt.Errorf("copied directory but could not remove the original; close applications using files under %s and try again: %w", source, removeErr)
		}
		return nil
	}
}

func moveRegularFile(source, destination string, mode os.FileMode) error {
	if err := os.Rename(source, destination); err == nil {
		return nil
	} else {
		input, openErr := os.Open(source)
		if openErr != nil {
			return err
		}
		output, createErr := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode.Perm())
		if createErr != nil {
			_ = input.Close()
			return createErr
		}
		_, copyErr := io.Copy(output, input)
		inputCloseErr := input.Close()
		closeErr := output.Close()
		if copyErr != nil || inputCloseErr != nil || closeErr != nil {
			_ = os.Remove(destination)
			if copyErr != nil {
				return copyErr
			}
			if inputCloseErr != nil {
				return inputCloseErr
			}
			return closeErr
		}
		if removeErr := os.Remove(source); removeErr != nil {
			_ = os.Remove(destination)
			return removeErr
		}
		return nil
	}
}

// MovePathIntoWorkspace moves an external file or directory into a Workspace
// directory. path is resolved against Files; destinationDirectory is relative
// to the active Workspace. Links are supported for directories only.
func (a *App) MovePathIntoWorkspace(path, destinationDirectory, destinationName string, leaveLink bool) (*WorkspaceDirectoryMoveResult, error) {
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
	projectBase := a.GetActiveProjectPath()
	if projectBase == "" {
		return nil, fmt.Errorf("active Workspace is not configured")
	}
	targetParent, err := a.projectPath(destinationDirectory, true)
	if err != nil {
		return nil, err
	}
	parentInfo, err := os.Stat(targetParent)
	if err != nil || !parentInfo.IsDir() {
		return nil, fmt.Errorf("Workspace destination is not a directory")
	}
	destination := filepath.Join(targetParent, name)
	if err := requirePathInside(projectBase, destination); err != nil {
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
		if err := requireIndependentDirectories(source, projectBase); err != nil {
			return nil, err
		}
		if err := moveDirectory(source, destination); err != nil {
			return nil, err
		}
	} else if err := moveRegularFile(source, destination, info.Mode()); err != nil {
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
	relative, _ := filepath.Rel(projectBase, destination)
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
	projectBase := a.GetActiveProjectPath()
	if projectBase == "" {
		return nil, fmt.Errorf("active Workspace is not configured")
	}
	destination := filepath.Join(projectBase, name)
	if err := requirePathInside(projectBase, destination); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(projectBase)
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
	if err := requireIndependentDirectories(source, projectBase); err != nil {
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

func requireIndependentDirectories(source, project string) error {
	for _, pair := range [][2]string{{source, project}, {project, source}} {
		relative, err := filepath.Rel(pair[0], pair[1])
		if err == nil && (relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))) {
			return fmt.Errorf("source directory and Workspace cannot contain each other")
		}
	}
	return nil
}
