package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"mime"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx                context.Context
	directoryMu        sync.RWMutex
	directoryBase      string
	workspaceMu        sync.Mutex
	workspaceConfigDir string
	workspaceState     WorkspaceState
	cliMu              sync.Mutex
	cliCmd             *exec.Cmd
	ragMu              sync.Mutex
	ragCancelMu        sync.Mutex
	ragCancelled       map[string]bool
	discordMu          sync.Mutex
	discord            *discordBot
	chatToolMu         sync.Mutex
	chatToolCalls      map[string]chan chatToolResponse
	chatLimitMu        sync.Mutex
	chatLimitCalls     map[string]chan int
	chatCancelMu       sync.Mutex
	chatCancels        map[string]context.CancelFunc
	timelineMu         sync.Mutex
	mcpStdioMu         sync.Mutex
	mcpStdio           map[string]*mcpStdioSession
	mcpOAuthMu         sync.Mutex
	pluginMu           sync.Mutex
}

type LocalFileResult struct {
	Path     string `json:"path"`
	FileName string `json:"fileName"`
	Content  string `json:"content"`
}

type LocalPathInfo struct {
	Path        string `json:"path"`
	Name        string `json:"name"`
	IsDirectory bool   `json:"isDirectory"`
}

func NewApp() *App {
	return &App{chatToolCalls: make(map[string]chan chatToolResponse), chatLimitCalls: make(map[string]chan int), chatCancels: make(map[string]context.CancelFunc), mcpStdio: make(map[string]*mcpStdioSession), ragCancelled: make(map[string]bool)}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	paths := startupFilePaths()
	if len(paths) > 0 {
		if _, err := a.SetDirectoryBase(filepath.Dir(paths[0])); err != nil {
			fmt.Println("Could not set startup directory:", err)
		}
	}
	if err := a.initializeWorkspaces(); err != nil {
		fmt.Println("Could not initialize Workspace:", err)
	}
}

func (a *App) SelectLocalFile() (*LocalFileResult, error) {
	path, err := a.SelectLocalFilePath()
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil
	}
	return readLocalFile(path)
}

func (a *App) SelectLocalFilePath() (string, error) {
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Open File",
		Filters: []wailsruntime.FileFilter{
			{
				DisplayName: "Documents and images",
				Pattern:     "*.md;*.markdown;*.txt;*.html;*.htm;*.epub;*.pdf;*.png;*.jpg;*.jpeg;*.gif;*.webp;*.avif;*.bmp;*.svg",
			},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) SelectDirectoryPath() (string, error) {
	return wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select Memo Directory",
	})
}

func (a *App) SelectExternalEditor() (string, error) {
	return wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select External Editor",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "Applications", Pattern: "*.exe;*.cmd;*.bat;*.ps1;*.app;*"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	})
}

func (a *App) ReadLocalFile(path string) (*LocalFileResult, error) {
	return readLocalFile(path)
}

// InspectLocalPath identifies a native drop before the frontend tries to read
// it as a file. Wails reports files and directories through the same callback.
func (a *App) InspectLocalPath(path string) (*LocalPathInfo, error) {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	if cleaned == "." || cleaned == "" {
		return nil, fmt.Errorf("local path is empty")
	}
	info, err := os.Stat(cleaned)
	if err != nil {
		return nil, err
	}
	return &LocalPathInfo{Path: cleaned, Name: info.Name(), IsDirectory: info.IsDir()}, nil
}

func (a *App) StartupFilePaths() []string {
	return startupFilePaths()
}

func startupFilePaths() []string {
	paths := make([]string, 0, len(os.Args)-1)
	for _, arg := range os.Args[1:] {
		if arg == "" {
			continue
		}
		path, err := filepath.Abs(arg)
		if err != nil {
			continue
		}
		stat, err := os.Stat(path)
		if err != nil || stat.IsDir() {
			continue
		}
		paths = append(paths, path)
	}
	return paths
}

type MemoFileResult struct {
	Exists  bool   `json:"exists"`
	Content string `json:"content"`
}

// ReadMemoFile reads a memo file as text; a missing file is not an error
// (specs/memo.md §4.3 treats it as "no memos yet").
func (a *App) ReadMemoFile(path string) (*MemoFileResult, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &MemoFileResult{Exists: false, Content: ""}, nil
		}
		return nil, err
	}
	return &MemoFileResult{Exists: true, Content: string(bytes)}, nil
}

type MemoListEntry struct {
	MemoPath string `json:"memoPath"`
	Source   string `json:"source"`
	ModTime  int64  `json:"modTime"`
}

// ListMemoFiles returns every memo file in the memo directory together with
// its frontmatter `source:` and modification time (unix milliseconds).
func (a *App) ListMemoFiles(dir string) ([]MemoListEntry, error) {
	if dir == "" {
		return nil, fmt.Errorf("memo directory is empty")
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	result := make([]MemoListEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		result = append(result, MemoListEntry{
			MemoPath: path,
			Source:   memoSourceFromFile(path),
			ModTime:  info.ModTime().UnixMilli(),
		})
	}
	return result, nil
}

// memoSourceFromFile reads the `source:` value from a memo file's leading
// frontmatter block without loading the whole file.
func memoSourceFromFile(path string) string {
	file, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	if !scanner.Scan() || strings.TrimSpace(scanner.Text()) != "---" {
		return ""
	}
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "---" {
			break
		}
		if strings.HasPrefix(line, "source:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "source:"))
		}
	}
	return ""
}

// AppendMemoFile appends a post block to a memo file, creating the file on
// first post (specs/memo.md §8.1: posting is append-only).
func (a *App) AppendMemoFile(path string, content string) error {
	if path == "" {
		return fmt.Errorf("memo file path is empty")
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = file.WriteString(content)
	return err
}

// WriteMemoFileAtomic rewrites a memo file via temp file + rename
// (specs/memo.md §8.1: edits/deletes must be atomic).
func (a *App) WriteMemoFileAtomic(path string, content string) error {
	if path == "" {
		return fmt.Errorf("memo file path is empty")
	}
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".gemihub-desktop-memo-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.WriteString(content); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

func (a *App) OpenExternalEditor(editorPath string, filePath string) error {
	if editorPath == "" {
		return fmt.Errorf("external editor path is empty")
	}
	if filePath == "" {
		return fmt.Errorf("file path is empty")
	}
	resolved, err := a.resolveExistingLocalFile(filePath)
	if err != nil {
		return err
	}
	return startExternalEditor(editorPath, resolved)
}

func readLocalFile(path string) (*LocalFileResult, error) {
	fileName := filepath.Base(path)
	if shouldShowDownloadOnly(fileName) {
		if _, err := os.Stat(path); err != nil {
			return nil, err
		}
		return &LocalFileResult{Path: path, FileName: fileName, Content: ""}, nil
	}
	bytes, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	content := string(bytes)
	if shouldReadAsDataURL(fileName) {
		mimeType := mime.TypeByExtension(stringsToLower(filepath.Ext(fileName)))
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		content = "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(bytes)
	}

	return &LocalFileResult{
		Path:     path,
		FileName: fileName,
		Content:  content,
	}, nil
}

func shouldShowDownloadOnly(fileName string) bool {
	switch stringsToLower(filepath.Ext(fileName)) {
	case ".xlsx", ".xls", ".xlsm", ".xlsb", ".ods", ".doc", ".docx", ".ppt", ".pptx", ".pages", ".numbers", ".key", ".zip", ".7z", ".rar", ".tar", ".gz":
		return true
	default:
		return false
	}
}

func isBinaryFileName(fileName string) bool {
	return shouldReadAsDataURL(fileName) || shouldShowDownloadOnly(fileName)
}

// OpenLocalFileDefault opens a file with the OS default associated app without
// transporting its binary contents through the WebView/JSON bridge.
func (a *App) OpenLocalFileDefault(path string) error {
	source, err := a.resolveExistingLocalFile(path)
	if err != nil {
		return err
	}
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		// `start` delegates to the Windows file association and works for native
		// ARM64 applications as well as paths containing spaces.
		command = exec.Command("cmd.exe", "/C", "start", "", source)
	case "darwin":
		command = exec.Command("open", source)
	default:
		command = exec.Command("xdg-open", source)
	}
	if err := command.Start(); err != nil {
		return err
	}
	return command.Process.Release()
}

// resolveExistingLocalFile translates Files/Workspace resource paths to a
// native path before handing them to another process. Older dashboards did
// not persist fileScope, so an unscoped relative path falls back to Workspace
// when Directory base is unavailable or does not contain the file.
func (a *App) resolveExistingLocalFile(path string) (string, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "", fmt.Errorf("file path is empty")
	}
	var source string
	var err error
	if filepath.IsAbs(trimmed) {
		source = trimmed
	} else {
		source, err = a.directoryPath(trimmed, false)
		if err != nil {
			if strings.HasPrefix(strings.ToLower(trimmed), "files://") {
				return "", err
			}
			source, err = a.workspacePath(trimmed, false)
			if err != nil {
				return "", err
			}
		}
	}
	info, err := os.Stat(source)
	if err != nil && !filepath.IsAbs(trimmed) && !strings.HasPrefix(strings.ToLower(trimmed), "files://") {
		if workspaceSource, workspaceErr := a.workspacePath(trimmed, false); workspaceErr == nil {
			if workspaceInfo, statErr := os.Stat(workspaceSource); statErr == nil {
				source, info, err = workspaceSource, workspaceInfo, nil
			}
		}
	}
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("only regular files can be opened")
	}
	return source, nil
}

func shouldReadAsDataURL(fileName string) bool {
	switch stringsToLower(filepath.Ext(fileName)) {
	case ".avif", ".bmp", ".epub", ".gif", ".jpg", ".jpeg", ".pdf", ".png", ".svg", ".webp", ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".wma", ".mid", ".midi", ".mp4", ".webm", ".mov":
		return true
	default:
		return false
	}
}

func stringsToLower(value string) string {
	out := []rune(value)
	for i, r := range out {
		if r >= 'A' && r <= 'Z' {
			out[i] = r + ('a' - 'A')
		}
	}
	return string(out)
}
