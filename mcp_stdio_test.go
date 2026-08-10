package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type testWriteCloser struct{ io.Writer }

func (testWriteCloser) Close() error { return nil }

func TestMCPStdioContentLengthFraming(t *testing.T) {
	payload := []byte(`{"jsonrpc":"2.0","id":1,"result":{"ok":true}}`)
	input := bytes.NewBufferString(fmt.Sprintf("Content-Type: application/json\r\nContent-Length: %d\r\n\r\n", len(payload)))
	input.Write(payload)
	var output bytes.Buffer
	session := &mcpStdioSession{stdout: bufio.NewReader(input), stdin: testWriteCloser{&output}, framing: "content-length"}
	read, err := session.readFrame()
	if err != nil || !bytes.Equal(read, payload) {
		t.Fatalf("unexpected frame: %q, %v", read, err)
	}
	if err := session.writeFrame(payload); err != nil {
		t.Fatal(err)
	}
	if output.String() != fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(payload), payload) {
		t.Fatalf("unexpected encoded frame: %q", output.String())
	}
}

func TestMCPStdioNewlineFraming(t *testing.T) {
	payload := []byte(`{"jsonrpc":"2.0","id":1}`)
	var output bytes.Buffer
	session := &mcpStdioSession{stdout: bufio.NewReader(bytes.NewBuffer(append(payload, '\n'))), stdin: testWriteCloser{&output}, framing: "newline"}
	read, err := session.readFrame()
	if err != nil || !bytes.Equal(read, payload) {
		t.Fatalf("unexpected frame: %q, %v", read, err)
	}
	if err := session.writeFrame(payload); err != nil || output.String() != string(payload)+"\n" {
		t.Fatalf("unexpected newline frame: %q, %v", output.String(), err)
	}
}

func TestAgentPluginStdioInjectsReservedEnvironmentAndContainsCWD(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("shell fixture")
	}
	base := t.TempDir()
	app := NewApp()
	if _, err := app.SetDirectoryBase(base); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetWorkspaceDirectory(base); err != nil {
		t.Fatal(err)
	}
	root := filepath.Join(base, ".llm-hub", "agent-plugins", "demo")
	data := filepath.Join(base, ".llm-hub", "agent-plugin-data", "demo")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	command := filepath.Join(root, "server.sh")
	if err := os.WriteFile(command, []byte("#!/bin/sh\nsleep 30\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	sessionID, err := app.MCPStdioStart(MCPStdioStartRequest{Command: command, CWD: filepath.Join(data, "state"), PluginRoot: root, PluginData: data})
	if err != nil {
		t.Fatal(err)
	}
	defer app.MCPStdioClose(sessionID)
	app.mcpStdioMu.Lock()
	session := app.mcpStdio[sessionID]
	app.mcpStdioMu.Unlock()
	environment := strings.Join(session.cmd.Env, "\n")
	if !strings.Contains(environment, "PLUGIN_ROOT="+root) || !strings.Contains(environment, "PLUGIN_DATA="+data) {
		t.Fatalf("reserved environment missing: %s", environment)
	}
	if session.cmd.Dir != filepath.Join(data, "state") {
		t.Fatalf("unexpected cwd: %s", session.cmd.Dir)
	}
	if _, err := app.MCPStdioStart(MCPStdioStartRequest{Command: command, CWD: filepath.Dir(base), PluginRoot: root, PluginData: data}); err == nil {
		t.Fatal("outside cwd accepted")
	}
}
