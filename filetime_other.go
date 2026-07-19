//go:build !windows && !linux && !darwin

package main

import "os"

func fileCreatedTime(_ string, _ os.FileInfo) int64 {
	// Do not present the modification time as a creation time on platforms
	// where the filesystem birth time is unavailable.
	return 0
}
