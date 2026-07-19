package main

import (
	"strings"
	"testing"
)

func TestWorkflowHTTPRequestAllowsHTTPWhilePluginTransportDoesNot(t *testing.T) {
	if _, err := validateExternalURL("http://127.0.0.1:8080/api", false); err == nil {
		t.Fatal("plugin HTTP transport unexpectedly accepted plain HTTP")
	}
	if _, err := validateExternalURL("http://127.0.0.1:8080/api", true); err != nil {
		t.Fatalf("workflow HTTP transport rejected plain HTTP: %v", err)
	}
}

func TestExternalHTTPRejectsOversizedResponse(t *testing.T) {
	if _, err := readLimitedHTTPBody(strings.NewReader("12345"), 4); err == nil {
		t.Fatal("oversized response was silently truncated")
	}
	data, err := readLimitedHTTPBody(strings.NewReader("1234"), 4)
	if err != nil || string(data) != "1234" {
		t.Fatalf("valid response failed: %v, %q", err, data)
	}
}
