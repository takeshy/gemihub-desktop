package main

import (
	"fmt"
	"os"
	"strings"
	"time"
)

const systemTimelineFolder = "Dashboards/Timeline/Timeline"

type timelineAppendResult struct {
	Path string `json:"path"`
	ID   string `json:"id"`
}

type timelineReadResult struct {
	Date    string `json:"date"`
	Path    string `json:"path"`
	Content string `json:"content"`
}

func (a *App) readSystemTimeline(date string) (*timelineReadResult, error) {
	date = strings.TrimSpace(date)
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		return nil, fmt.Errorf("read_timeline date must use YYYY-MM-DD")
	}
	path := fmt.Sprintf("%s/%s.md", systemTimelineFolder, date)
	target, err := a.workspacePath(path, false)
	if err != nil {
		return nil, err
	}
	content, err := os.ReadFile(target)
	if os.IsNotExist(err) {
		return &timelineReadResult{Date: date, Path: path, Content: ""}, nil
	}
	if err != nil {
		return nil, err
	}
	return &timelineReadResult{Date: date, Path: path, Content: string(content)}, nil
}

func timelineEntryID(content string, now time.Time) string {
	base := fmt.Sprintf("%s-%03d", now.Format("20060102-150405"), now.Nanosecond()/int(time.Millisecond))
	id := base
	for suffix := 2; strings.Contains(content, "\nid: "+id+"\n"); suffix++ {
		id = fmt.Sprintf("%s-%d", base, suffix)
	}
	return id
}

func (a *App) appendSystemTimeline(content string) (*timelineAppendResult, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, fmt.Errorf("append_timeline requires non-empty content")
	}
	if len(content) > 200000 {
		return nil, fmt.Errorf("Timeline memo is too large")
	}

	a.timelineMu.Lock()
	defer a.timelineMu.Unlock()

	now := time.Now()
	path := fmt.Sprintf("%s/%s.md", systemTimelineFolder, now.Format("2006-01-02"))
	target, err := a.workspacePath(path, true)
	if err != nil {
		return nil, err
	}
	currentBytes, err := os.ReadFile(target)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	current := strings.TrimRight(string(currentBytes), "\r\n")
	id := timelineEntryID(current, now)
	block := fmt.Sprintf("%s\nid: %s\n\n%s", now.UTC().Format("2006-01-02T15:04:05.000Z"), id, content)
	next := ""
	if current == "" {
		next = "---\nsource: timeline:Timeline\n---\n\n" + block + "\n"
	} else {
		next = current + "\n\n---\n\n" + block + "\n"
	}
	if err := a.WriteWorkspaceFile(path, next); err != nil {
		return nil, err
	}
	return &timelineAppendResult{Path: path, ID: id}, nil
}
