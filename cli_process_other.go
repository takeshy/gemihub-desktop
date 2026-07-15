//go:build !windows

package main

import "os/exec"

func configureCLIProcess(_ *exec.Cmd) {}
