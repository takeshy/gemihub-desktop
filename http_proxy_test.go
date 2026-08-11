package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
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

func TestExternalHTTPBinaryResponseSurvivesWailsJSONSerialization(t *testing.T) {
	// A ZIP signature plus invalid UTF-8 and NUL bytes models Office/PDF/image
	// downloads that cannot safely be represented by response.body.
	want := []byte{'P', 'K', 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80, 0x00, 0x01}
	response := externalHTTPResponse(200, map[string]string{
		"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	}, want)
	if response.Body != "" {
		t.Fatalf("binary response was copied into text body: %q", response.Body)
	}

	// Wails v2's dispatcher wraps exported method results and uses encoding/json.
	wailsCallback, err := json.Marshal(struct {
		Result *ExternalHTTPResponse `json:"result"`
	}{Result: response})
	if err != nil {
		t.Fatal(err)
	}
	var decoded struct {
		Result ExternalHTTPResponse `json:"result"`
	}
	if err := json.Unmarshal(wailsCallback, &decoded); err != nil {
		t.Fatal(err)
	}
	got, err := base64.StdEncoding.DecodeString(decoded.Result.BodyBase64)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("binary response changed across Wails JSON path: got %x, want %x", got, want)
	}
}

func TestExternalHTTPTextResponsePreservesBodyAndBase64(t *testing.T) {
	want := []byte(`{"message":"こんにちは"}`)
	response := externalHTTPResponse(200, map[string]string{
		"content-type": "application/json; charset=utf-8",
	}, want)
	if response.Body != string(want) {
		t.Fatalf("text body changed: got %q, want %q", response.Body, want)
	}
	got, err := base64.StdEncoding.DecodeString(response.BodyBase64)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("text bodyBase64 changed: got %q, want %q", got, want)
	}
}

func TestExternalHTTPUTF8ResponseWithoutContentTypePreservesBody(t *testing.T) {
	response := externalHTTPResponse(200, map[string]string{}, []byte("legacy text response"))
	if response.Body != "legacy text response" {
		t.Fatalf("UTF-8 response without content type changed: %q", response.Body)
	}
}

func TestExternalHTTPInvalidUTF8TextIsOnlyReturnedAsBase64(t *testing.T) {
	response := externalHTTPResponse(200, map[string]string{"content-type": "text/plain"}, []byte{0xff})
	if response.Body != "" || response.BodyBase64 != "/w==" {
		t.Fatalf("unsafe text representation returned: %#v", response)
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
