//go:build linux

package main

import (
	"os"

	"golang.org/x/sys/unix"
)

func fileCreatedTime(path string, _ os.FileInfo) int64 {
	var stat unix.Statx_t
	if err := unix.Statx(unix.AT_FDCWD, path, unix.AT_SYMLINK_NOFOLLOW, unix.STATX_BTIME, &stat); err != nil {
		return 0
	}
	if stat.Mask&unix.STATX_BTIME == 0 {
		return 0
	}
	return stat.Btime.Sec*1000 + int64(stat.Btime.Nsec)/1_000_000
}
