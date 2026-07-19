//go:build darwin

package main

import (
	"os"
	"syscall"
)

func fileCreatedTime(_ string, info os.FileInfo) int64 {
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		return stat.Birthtimespec.Sec*1000 + int64(stat.Birthtimespec.Nsec)/1_000_000
	}
	return 0
}
