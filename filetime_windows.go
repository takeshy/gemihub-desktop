//go:build windows

package main

import (
	"os"
	"syscall"
	"time"
)

func fileCreatedTime(info os.FileInfo) int64 {
	if data, ok := info.Sys().(*syscall.Win32FileAttributeData); ok {
		return time.Unix(0, data.CreationTime.Nanoseconds()).UnixMilli()
	}
	return info.ModTime().UnixMilli()
}
