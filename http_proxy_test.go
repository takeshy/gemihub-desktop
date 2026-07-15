package main

import (
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
