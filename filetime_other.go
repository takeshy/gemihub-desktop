//go:build !windows

package main

import "os"

func fileCreatedTime(info os.FileInfo) int64 {
	return info.ModTime().UnixMilli()
}
