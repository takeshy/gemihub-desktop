package main

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type EmbedCheckResult struct {
	Embeddable bool   `json:"embeddable"`
	Reason     string `json:"reason,omitempty"`
}

func (a *App) CheckWebEmbeddable(rawURL string) EmbedCheckResult {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return EmbedCheckResult{Embeddable: false, Reason: "invalid URL"}
	}
	baseContext := a.ctx
	if baseContext == nil {
		baseContext = context.Background()
	}
	ctx, cancel := context.WithTimeout(baseContext, 8*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return EmbedCheckResult{Embeddable: true}
	}
	request.Header.Set("User-Agent", "LLM-Hub-Workspace/1.0")
	response, err := (&http.Client{Timeout: 8 * time.Second, Transport: publicNetworkTransport(), CheckRedirect: func(next *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return http.ErrUseLastResponse
		}
		return nil
	}}).Do(request)
	if err != nil {
		// Connectivity and authentication failures do not prove framing is blocked.
		return EmbedCheckResult{Embeddable: true}
	}
	defer response.Body.Close()
	return embedCheckFromHeaders(response.Header)
}

func embedCheckFromHeaders(header http.Header) EmbedCheckResult {
	xFrame := strings.ToLower(strings.TrimSpace(header.Get("X-Frame-Options")))
	if strings.Contains(xFrame, "deny") || strings.Contains(xFrame, "sameorigin") {
		return EmbedCheckResult{Embeddable: false, Reason: "X-Frame-Options blocks embedding"}
	}
	csp := strings.ToLower(header.Get("Content-Security-Policy"))
	for _, directive := range strings.Split(csp, ";") {
		fields := strings.Fields(strings.TrimSpace(directive))
		if len(fields) == 0 || fields[0] != "frame-ancestors" {
			continue
		}
		for _, source := range fields[1:] {
			if source == "*" || source == "http:" || source == "https:" {
				return EmbedCheckResult{Embeddable: true}
			}
		}
		return EmbedCheckResult{Embeddable: false, Reason: "Content-Security-Policy blocks embedding"}
	}
	return EmbedCheckResult{Embeddable: true}
}
