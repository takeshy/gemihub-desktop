package main

import (
	"net/http"
	"testing"
)

func TestEmbedCheckHeaders(t *testing.T) {
	tests := []struct {
		name   string
		header http.Header
		want   bool
	}{
		{name: "no restrictions", header: http.Header{}, want: true},
		{name: "x frame deny", header: http.Header{"X-Frame-Options": []string{"DENY"}}, want: false},
		{name: "x frame same origin", header: http.Header{"X-Frame-Options": []string{"SAMEORIGIN"}}, want: false},
		{name: "csp self", header: http.Header{"Content-Security-Policy": []string{"default-src 'self'; frame-ancestors 'self'"}}, want: false},
		{name: "csp wildcard", header: http.Header{"Content-Security-Policy": []string{"frame-ancestors *"}}, want: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := embedCheckFromHeaders(test.header).Embeddable; got != test.want {
				t.Fatalf("embeddable = %v, want %v", got, test.want)
			}
		})
	}
}
