//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

func configureCLIProcess(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
