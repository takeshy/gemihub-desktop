//go:build windows

package main

import (
	"fmt"
	"os/exec"
	"strings"
)

func createDirectoryLink(linkPath, targetPath string) error {
	command := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", `& { param($link, $target) New-Item -ItemType Junction -Path $link -Target $target | Out-Null }`, linkPath, targetPath)
	if output, err := command.CombinedOutput(); err != nil {
		return fmt.Errorf("create Windows junction: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}
