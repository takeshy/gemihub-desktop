package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
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
