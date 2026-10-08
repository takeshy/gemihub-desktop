package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNativeFileOpenBeforeFrontendReady(t *testing.T) {
	path := filepath.Join(t.TempDir(), "new.md")
	if err := os.WriteFile(path, []byte("new file"), 0o600); err != nil {
		t.Fatal(err)
	}
	var requests fileOpenRequests
	opened := requests.open(path)
	if opened == nil || opened.ID == 0 || opened.Path != path {
		t.Fatalf("unexpected native request: %+v", opened)
	}
	// Receiving the event before a frontend listener exists must not lose it.
	if pending := requests.current(); pending == nil || *pending != *opened {
		t.Fatalf("native file was not retained: %+v", pending)
	}
	requests.acknowledge(opened.ID)
	if requests.current() != nil {
		t.Fatal("acknowledged request should not replay")
	}
}

func TestOlderFileOpenAcknowledgementDoesNotClearNewRequest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "same.md")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	var requests fileOpenRequests
	first := requests.open(path)
	second := requests.open(path)
	if second.ID <= first.ID {
		t.Fatal("reopening the same file must create a new request")
	}
	requests.acknowledge(first.ID)
	if pending := requests.current(); pending == nil || pending.ID != second.ID {
		t.Fatalf("old acknowledgement cleared a newer file open: %+v", pending)
	}
	copy := requests.current()
	copy.Path = "changed"
	if requests.current().Path != path {
		t.Fatal("caller mutated the queued request")
	}
}

func TestInvalidNativeFileOpenDoesNotReplacePendingFile(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "valid.md")
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	var requests fileOpenRequests
	opened := requests.open(path)
	for _, invalid := range []string{"", directory, filepath.Join(directory, "missing.md")} {
		if requests.open(invalid) != nil {
			t.Fatalf("accepted invalid document: %q", invalid)
		}
	}
	if pending := requests.current(); pending == nil || *pending != *opened {
		t.Fatal("invalid native event replaced a valid document")
	}
}
