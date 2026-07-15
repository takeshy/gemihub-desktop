package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"
)

type ExternalHTTPRequest struct {
	URL        string            `json:"url"`
	Method     string            `json:"method"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body,omitempty"`
	BodyBase64 string            `json:"bodyBase64,omitempty"`
}

type ExternalHTTPResponse struct {
	Status     int               `json:"status"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	BodyBase64 string            `json:"bodyBase64"`
}

// ExternalHTTPRequest bypasses WebView CORS for trusted integrations such as
// the built-in Drive plugin. Plain HTTP and redirects to plain HTTP are denied.
func (a *App) ExternalHTTPRequest(request ExternalHTTPRequest) (*ExternalHTTPResponse, error) {
	return a.doExternalHTTPRequest(request, false)
}

// WorkflowHTTPRequest supports explicit workflow HTTP nodes, including local
// HTTP services. Plugin transport remains HTTPS-only via ExternalHTTPRequest.
func (a *App) WorkflowHTTPRequest(request ExternalHTTPRequest) (*ExternalHTTPResponse, error) {
	return a.doExternalHTTPRequest(request, true)
}

func (a *App) doExternalHTTPRequest(request ExternalHTTPRequest, allowHTTP bool) (*ExternalHTTPResponse, error) {
	parsed, err := validateExternalURL(request.URL, allowHTTP)
	if err != nil {
		return nil, err
	}
	body := []byte(request.Body)
	if request.BodyBase64 != "" {
		body, err = base64.StdEncoding.DecodeString(request.BodyBase64)
		if err != nil {
			return nil, fmt.Errorf("invalid request body: %w", err)
		}
	}
	method := strings.ToUpper(strings.TrimSpace(request.Method))
	if method == "" {
		method = http.MethodGet
	}
	httpRequest, err := http.NewRequestWithContext(a.ctx, method, parsed.String(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	for key, value := range request.Headers {
		if !strings.EqualFold(key, "Host") {
			httpRequest.Header.Set(key, value)
		}
	}
	client := &http.Client{
		Timeout:   5 * time.Minute,
		Transport: linkLocalGuardedTransport(),
		CheckRedirect: func(next *http.Request, via []*http.Request) error {
			if next.URL.Scheme != "https" && !(allowHTTP && next.URL.Scheme == "http") {
				return fmt.Errorf("redirect to unsupported URL scheme denied")
			}
			if len(via) >= 5 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}
	response, err := client.Do(httpRequest)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 64*1024*1024))
	if err != nil {
		return nil, err
	}
	headers := map[string]string{}
	for key, values := range response.Header {
		headers[strings.ToLower(key)] = strings.Join(values, ", ")
	}
	return &ExternalHTTPResponse{
		Status: response.StatusCode, Headers: headers, Body: string(responseBody),
		BodyBase64: base64.StdEncoding.EncodeToString(responseBody),
	}, nil
}

// linkLocalGuardedTransport denies connections to link-local addresses
// (169.254.0.0/16, fe80::/10). This closes off cloud instance metadata
// endpoints such as 169.254.169.254 while still allowing loopback and private
// hosts, which workflow HTTP nodes legitimately target for local services.
// The check runs at dial time, so it also covers redirects and any DNS name
// that resolves to a link-local address.
func linkLocalGuardedTransport() *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return err
			}
			if ip := net.ParseIP(host); ip != nil && (ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()) {
				return fmt.Errorf("connection to link-local address %s denied", ip)
			}
			return nil
		},
	}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		return dialer.DialContext(ctx, network, address)
	}
	return transport
}

func validateExternalURL(raw string, allowHTTP bool) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	validScheme := parsed != nil && (parsed.Scheme == "https" || (allowHTTP && parsed.Scheme == "http"))
	if err != nil || !validScheme || parsed.Hostname() == "" {
		return nil, fmt.Errorf("request requires a valid %s URL", map[bool]string{true: "HTTP or HTTPS", false: "HTTPS"}[allowHTTP])
	}
	return parsed, nil
}
