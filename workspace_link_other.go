//go:build !windows

package main

import "os"

func createDirectoryLink(linkPath, targetPath string) error {
	return os.Symlink(targetPath, linkPath)
}
