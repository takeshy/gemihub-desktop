package main

import (
	"path/filepath"
	"testing"
)

// Temp directories use alias paths on macOS (/var -> /private/var) and may
// use 8.3 short names on Windows. Production paths are canonicalized before
// they enter App state, so test fixtures must do the same.
func canonicalTestPath(t *testing.T, path string) string {
	t.Helper()
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Clean(real)
}

func testWorkspaceState(t *testing.T, path string) WorkspaceState {
	t.Helper()
	return WorkspaceState{
		ActiveWorkspaceID: "workspace",
		Workspaces: []Workspace{{
			ID:   "workspace",
			Name: "Workspace",
			Path: canonicalTestPath(t, path),
		}},
	}
}
