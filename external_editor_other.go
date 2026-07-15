//go:build !windows

package main

import "os/exec"

func startExternalEditor(editorPath string, filePath string) error {
	return exec.Command(editorPath, filePath).Start()
}
