package main

import (
	"crypto/md5"
	"encoding/base64"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testDirectoryApp(t *testing.T) (*App, string) {
	t.Helper()
	dir := t.TempDir()
	app := NewApp()
	if _, err := app.SetDirectoryBase(dir); err != nil {
		t.Fatal(err)
	}
	return app, dir
}

func TestWorkspaceFileAPIUsesEntireWorkspace(t *testing.T) {
	workspace := t.TempDir()
	files := t.TempDir()
	app := NewApp()
	if _, err := app.SetDirectoryBase(files); err != nil {
		t.Fatal(err)
	}
	app.workspaceState = WorkspaceState{ActiveWorkspaceID: "one", Workspaces: []Workspace{{ID: "one", Name: "One", Path: workspace}}}
	if err := app.WriteWorkspaceFile("notes/readme.md", "Workspace data"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(workspace, "notes", "readme.md")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(files, "notes", "readme.md")); !os.IsNotExist(err) {
		t.Fatalf("Workspace file leaked into Files: %v", err)
	}
	entries, err := app.ListWorkspaceFiles()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Path != "notes/readme.md" {
		t.Fatalf("unexpected Workspace inventory: %#v", entries)
	}
	if _, err := app.ReadWorkspaceFile("../outside.md"); err == nil {
		t.Fatal("Workspace path traversal was accepted")
	}
	midi := []byte("MThd\x00\x00\x00\x06")
	if err := app.WriteWorkspaceBinaryFile("music/score.mid", base64.StdEncoding.EncodeToString(midi)); err != nil {
		t.Fatal(err)
	}
	read, err := app.ReadWorkspaceFile("workspace://music/score.mid")
	if err != nil {
		t.Fatalf("scoped plugin path was not readable: %v", err)
	}
	comma := strings.IndexByte(read.Content, ',')
	if comma < 0 {
		t.Fatalf("MIDI was not returned as a data URL: %q", read.Content)
	}
	decoded, err := base64.StdEncoding.DecodeString(read.Content[comma+1:])
	if err != nil || string(decoded) != string(midi) {
		t.Fatalf("unexpected MIDI payload %q: %v", decoded, err)
	}
}

func TestDirectoryBaseFileOperations(t *testing.T) {
	app, _ := testDirectoryApp(t)
	if err := app.WriteFile("notes/hello.md", "hello DirectoryBase"); err != nil {
		t.Fatal(err)
	}
	read, err := app.ReadFile("notes/hello.md")
	if err != nil || read.Content != "hello DirectoryBase" {
		t.Fatalf("unexpected read: %#v, %v", read, err)
	}
	tree, err := app.ListFileTree()
	if err != nil || len(tree) != 1 || !tree[0].IsDir || len(tree[0].Children) != 1 {
		t.Fatalf("unexpected tree: %#v, %v", tree, err)
	}
	results, err := app.SearchFiles("directorybase", 10)
	if err != nil || len(results) != 1 || results[0].Path != "notes/hello.md" {
		t.Fatalf("unexpected search: %#v, %v", results, err)
	}
	if err := app.RenameFile("notes/hello.md", "notes/renamed.md"); err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteFile("notes/renamed.md"); err != nil {
		t.Fatal(err)
	}
}

func TestReadFileReturnsNilForMissingFile(t *testing.T) {
	app, _ := testDirectoryApp(t)
	result, err := app.ReadFile("Dashboards/Timeline/Timeline/2026-07-19.md")
	if err != nil {
		t.Fatalf("ReadFile returned an error for a missing file: %v", err)
	}
	if result != nil {
		t.Fatalf("ReadFile returned %#v for a missing file, want nil", result)
	}
}

func TestWriteFileCannotReplaceBinaryWithDataURLText(t *testing.T) {
	app, dir := testDirectoryApp(t)
	target := filepath.Join(dir, "document.pdf")
	original := []byte("%PDF-1.7\noriginal binary")
	if err := os.WriteFile(target, original, 0o644); err != nil {
		t.Fatal(err)
	}

	if err := app.WriteFile("document.pdf", "data:application/pdf;base64,JVBERi0xLjc="); err == nil {
		t.Fatal("expected text write to a binary file to be rejected")
	}
	after, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(original) {
		t.Fatalf("binary file changed: %q", after)
	}
}

func TestAudioScoreFormatsUseBinaryProjectIO(t *testing.T) {
	for _, name := range []string{"track.mp3", "track.wav", "track.aac", "track.wma", "score.mid", "score.midi"} {
		if !shouldReadAsDataURL(name) {
			t.Errorf("%s was not classified as binary", name)
		}
	}
	dir := t.TempDir()
	content := []byte("ID3\x04\x00\x00test audio payload")
	if err := os.WriteFile(filepath.Join(dir, "track.mp3"), content, 0o600); err != nil {
		t.Fatal(err)
	}
	inventory, err := fileInventoryForBase(dir)
	if err != nil || len(inventory) != 1 {
		t.Fatalf("audio inventory = %#v, %v", inventory, err)
	}
	expected := md5.Sum(content)
	if !inventory[0].Binary || inventory[0].MD5 != hex.EncodeToString(expected[:]) {
		t.Fatalf("audio inventory should include a streaming checksum: %#v", inventory[0])
	}
}

func TestOfficeFilesUseDownloadOnlyViewWithoutLoadingContents(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "large.xlsx")
	if err := os.WriteFile(path, []byte("PK\x03\x04large workbook payload"), 0o600); err != nil {
		t.Fatal(err)
	}
	result, err := readLocalFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if result.Content != "" || result.FileName != "large.xlsx" {
		t.Fatalf("download-only result = %#v", result)
	}
	if !isBinaryFileName("large.xlsx") {
		t.Fatal("xlsx was not classified as binary")
	}
	inventory, err := fileInventoryForBase(dir)
	if err != nil || len(inventory) != 1 || !inventory[0].Binary || inventory[0].MD5 != "" {
		t.Fatalf("binary inventory should use metadata only: %#v, %v", inventory, err)
	}
}

func TestDirectoryBaseRejectsTraversalAndSymlinkEscape(t *testing.T) {
	app, dir := testDirectoryApp(t)
	if err := app.WriteFile("../escape.md", "no"); err == nil {
		t.Fatal("expected traversal to be rejected")
	}
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(dir, "outside")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := app.WriteFile("outside/escape.md", "no"); err == nil {
		t.Fatal("expected symlink escape to be rejected")
	}
}

func TestFileInventoryExcludesApplicationMetadata(t *testing.T) {
	app, dir := testDirectoryApp(t)
	if err := app.WriteFile("visible.md", "visible"); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, ".llm-hub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, ".llm-hub", "secret.json"), []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}
	files, err := app.FileInventory()
	if err != nil || len(files) != 1 || files[0].Path != "visible.md" || files[0].MD5 == "" {
		t.Fatalf("unexpected inventory: %#v, %v", files, err)
	}
}

func TestFileHistoryDuplicateAndTrashLifecycle(t *testing.T) {
	app, _ := testDirectoryApp(t)
	if err := app.WriteFile("notes/item.md", "one"); err != nil {
		t.Fatal(err)
	}
	if err := app.WriteFile("notes/item.md", "two"); err != nil {
		t.Fatal(err)
	}
	if err := app.WriteFile("notes/item.md", "two"); err != nil {
		t.Fatal(err)
	}
	history, err := app.ListFileHistory("notes/item.md")
	if err != nil || len(history) != 1 {
		t.Fatalf("unexpected history: %#v %v", history, err)
	}
	if err := app.RestoreFileHistory("notes/item.md", history[0].ID); err != nil {
		t.Fatal(err)
	}
	read, _ := app.ReadFile("notes/item.md")
	if read.Content != "one" {
		t.Fatalf("restore got %q", read.Content)
	}
	copyPath, err := app.DuplicateFile("notes/item.md")
	if err != nil || copyPath != "notes/item copy.md" {
		t.Fatalf("duplicate: %q %v", copyPath, err)
	}
	scopedCopyPath, err := app.DuplicateFile("files://notes/item.md")
	if err != nil || scopedCopyPath != "files://notes/item copy 2.md" {
		t.Fatalf("scoped duplicate: %q %v", scopedCopyPath, err)
	}
	if err := app.TrashFile(copyPath); err != nil {
		t.Fatal(err)
	}
	trash, err := app.ListTrash()
	if err != nil || len(trash) != 1 {
		t.Fatalf("trash: %#v %v", trash, err)
	}
	if err := app.RestoreTrash(trash[0].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := app.ReadFile(copyPath); err != nil {
		t.Fatal(err)
	}
}

func TestInspectLocalPathDistinguishesDirectoryAndFile(t *testing.T) {
	directory := t.TempDir()
	file := filepath.Join(directory, "note.md")
	if err := os.WriteFile(file, []byte("hello"), 0o600); err != nil {
		t.Fatal(err)
	}

	app := NewApp()
	directoryInfo, err := app.InspectLocalPath(directory)
	if err != nil {
		t.Fatal(err)
	}
	if !directoryInfo.IsDirectory || directoryInfo.Path != filepath.Clean(directory) {
		t.Fatalf("unexpected directory info: %#v", directoryInfo)
	}

	fileInfo, err := app.InspectLocalPath(file)
	if err != nil {
		t.Fatal(err)
	}
	if fileInfo.IsDirectory || fileInfo.Name != "note.md" {
		t.Fatalf("unexpected file info: %#v", fileInfo)
	}
}
