package main

import (
	"errors"
	"strings"
	"testing"
)

func TestVertexSpeechUsesStoredOAuthOnlyForTranscribe(t *testing.T) {
	endpoint := "https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/publishers/google/models/gemini-3.5-transcribe-preview:generateContent"
	request := ExternalHTTPRequest{URL: endpoint, Method: "POST", BodyBase64: "e30=", Headers: map[string]string{"x-goog-api-key": "wrong-key", "Authorization": "wrong-token"}}
	tokenCalls, sendCalls := 0, 0
	result, err := vertexSpeechHTTPRequest(request, func() (string, error) { tokenCalls++; return "stored-token", nil }, func(r ExternalHTTPRequest) (*ExternalHTTPResponse, error) {
		sendCalls++
		if r.URL != endpoint || r.BodyBase64 != "e30=" || r.Headers["Authorization"] != "Bearer stored-token" || r.Headers["Content-Type"] != "application/json" || len(r.Headers) != 2 {
			t.Fatalf("unexpected request: URL=%s, headers=%d", r.URL, len(r.Headers))
		}
		return &ExternalHTTPResponse{Status: 200, Body: "{}"}, nil
	})
	if err != nil || result.Status != 200 || tokenCalls != 1 || sendCalls != 1 {
		t.Fatalf("failed Vertex request: %v", err)
	}
	for _, endpoint := range []string{
		"https://example.com/", strings.Replace(endpoint, "/global/", "/us-central1/", 1), endpoint + "?key=x", endpoint + "#x", strings.Replace(endpoint, "gemini-3.5-transcribe-preview", "gemini-3.8-flash", 1), strings.Replace(endpoint, "test-project", "../test-project", 1), strings.Replace(endpoint, "https:", "http:", 1),
	} {
		request.URL = endpoint
		_, err := vertexSpeechHTTPRequest(request, func() (string, error) { t.Fatal("read credentials for invalid endpoint"); return "", nil }, func(ExternalHTTPRequest) (*ExternalHTTPResponse, error) {
			t.Fatal("sent invalid request")
			return nil, nil
		})
		if err == nil {
			t.Errorf("accepted endpoint %q", endpoint)
		}
	}
}

func TestVertexSpeechAuthErrorsAreRedacted(t *testing.T) {
	request := ExternalHTTPRequest{URL: "https://aiplatform.googleapis.com/v1beta1/projects/test-project/locations/global/publishers/google/models/gemini-3.5-transcribe-preview:generateContent", Method: "POST"}
	_, err := vertexSpeechHTTPRequest(request, func() (string, error) { return "", errors.New("secret OAuth response") }, func(ExternalHTTPRequest) (*ExternalHTTPResponse, error) {
		t.Fatal("sent unauthenticated request")
		return nil, nil
	})
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatalf("unexpected error %v", err)
	}
	request.Method = "GET"
	_, err = vertexSpeechHTTPRequest(request, func() (string, error) { t.Fatal("read credentials for GET"); return "", nil }, nil)
	if err == nil {
		t.Fatal("accepted GET")
	}
}
