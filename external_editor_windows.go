//go:build windows

package main

import (
	"os/exec"
	"path/filepath"
)

func startExternalEditor(editorPath string, filePath string) error {
	if isTerminalEditor(editorPath) {
		return exec.Command("cmd.exe", "/c", "start", "", editorPath, filePath).Start()
	}
	return exec.Command(editorPath, filePath).Start()
}

func isTerminalEditor(editorPath string) bool {
	switch stringsToLower(filepath.Base(editorPath)) {
	case "nvim.exe", "vim.exe", "vi.exe", "nano.exe", "emacs.exe":
		return true
	default:
		return false
	}
}
