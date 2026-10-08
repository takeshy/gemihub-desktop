package main

import (
	"os"
	"path/filepath"
	"sync"
)

type FileOpenRequest struct {
	ID   uint64 `json:"id"`
	Path string `json:"path"`
}

// Keep the latest native request until the frontend acknowledges it. macOS can
// deliver open-document events before the webview has subscribed to events.
type fileOpenRequests struct {
	mu      sync.Mutex
	nextID  uint64
	pending *FileOpenRequest
}

func (r *fileOpenRequests) open(path string) *FileOpenRequest {
	if path == "" {
		return nil
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil
	}
	info, err := os.Stat(absolute)
	if err != nil || info.IsDir() {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.nextID++
	request := FileOpenRequest{ID: r.nextID, Path: absolute}
	r.pending = &request
	copy := request
	return &copy
}

func (r *fileOpenRequests) current() *FileOpenRequest {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.pending == nil {
		return nil
	}
	copy := *r.pending
	return &copy
}

func (r *fileOpenRequests) acknowledge(id uint64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.pending != nil && r.pending.ID == id {
		r.pending = nil
	}
}
