//go:build !windows

package main

import "os"

func replaceRAGFile(source, target string) error {
	return os.Rename(source, target)
}
