package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const mcpOAuthRefreshBuffer = 5 * time.Minute

type MCPOAuthConnectRequest struct {
	ServerID     string   `json:"serverId"`
	ServerURL    string   `json:"serverUrl"`
	ClientID     string   `json:"clientId,omitempty"`
	ClientSecret string   `json:"clientSecret,omitempty"`
	Scopes       []string `json:"scopes,omitempty"`
}

type MCPOAuthStatus struct {
	Connected bool   `json:"connected"`
	ClientID  string `json:"clientId,omitempty"`
}

type mcpOAuthConfig struct {
	ClientID         string   `json:"clientId"`
	ClientSecret     string   `json:"clientSecret,omitempty"`
	AuthorizationURL string   `json:"authorizationUrl"`
	TokenURL         string   `json:"tokenUrl"`
	Scopes           []string `json:"scopes,omitempty"`
	Resource         string   `json:"resource,omitempty"`
}

type mcpOAuthCredential struct {
	ServerURL    string         `json:"serverUrl"`
	Config       mcpOAuthConfig `json:"config"`
	AccessToken  string         `json:"accessToken,omitempty"`
	RefreshToken string         `json:"refreshToken,omitempty"`
	TokenType    string         `json:"tokenType,omitempty"`
	Expiry       time.Time      `json:"expiry,omitempty"`
}

type mcpOAuthCredentialStore struct {
	Servers map[string]*mcpOAuthCredential `json:"servers"`
}

type mcpOAuthDiscovery struct {
	Config          mcpOAuthConfig
	RegistrationURL string
}

type mcpOAuthTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	Error        string `json:"error"`
	Description  string `json:"error_description"`
}

var mcpOAuthHTTPClient = &http.Client{Timeout: 30 * time.Second}

func (a *App) ConnectMCPOAuth(request MCPOAuthConnectRequest) (*MCPOAuthStatus, error) {
	serverID := strings.TrimSpace(request.ServerID)
	if serverID == "" {
		return nil, fmt.Errorf("MCP server ID is required")
	}
	serverURL, err := validateExternalURL(request.ServerURL, true)
	if err != nil {
		return nil, err
	}
	discovery, err := discoverMCPOAuth(serverURL.String())
	if err != nil {
		return nil, err
	}
	if len(request.Scopes) > 0 {
		discovery.Config.Scopes = request.Scopes
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	defer listener.Close()
	redirectURI := "http://" + listener.Addr().String() + "/callback"

	clientID := strings.TrimSpace(request.ClientID)
	clientSecret := request.ClientSecret
	if clientID == "" && strings.EqualFold(discovery.Config.AuthorizationURL, "https://accounts.google.com/o/oauth2/v2/auth") {
		return nil, fmt.Errorf("OAuth Client ID is required for Google Workspace MCP servers")
	}
	if clientID == "" && discovery.RegistrationURL != "" {
		clientID, clientSecret, err = registerMCPOAuthClient(discovery.RegistrationURL, redirectURI)
		if err != nil {
			return nil, err
		}
	}
	if clientID == "" {
		clientID = appID
	}
	discovery.Config.ClientID = clientID
	discovery.Config.ClientSecret = clientSecret

	state, err := randomOAuthValue(32)
	if err != nil {
		return nil, err
	}
	verifier, err := randomOAuthValue(64)
	if err != nil {
		return nil, err
	}
	challengeBytes := sha256.Sum256([]byte(verifier))
	values := url.Values{
		"client_id":             {clientID},
		"redirect_uri":          {redirectURI},
		"response_type":         {"code"},
		"state":                 {state},
		"code_challenge":        {base64.RawURLEncoding.EncodeToString(challengeBytes[:])},
		"code_challenge_method": {"S256"},
	}
	if len(discovery.Config.Scopes) > 0 {
		values.Set("scope", strings.Join(discovery.Config.Scopes, " "))
	}
	if discovery.Config.Resource != "" {
		values.Set("resource", discovery.Config.Resource)
	}
	if strings.EqualFold(discovery.Config.AuthorizationURL, "https://accounts.google.com/o/oauth2/v2/auth") {
		values.Set("access_type", "offline")
		values.Set("prompt", "consent")
	}

	type callbackResult struct{ code, err string }
	callback := make(chan callbackResult, 1)
	server := &http.Server{ReadHeaderTimeout: 10 * time.Second}
	server.Handler = http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/callback" {
			http.NotFound(response, request)
			return
		}
		result := callbackResult{code: request.URL.Query().Get("code"), err: request.URL.Query().Get("error")}
		if request.URL.Query().Get("state") != state {
			result = callbackResult{err: "OAuth state did not match"}
		}
		select {
		case callback <- result:
		default:
		}
		response.Header().Set("Content-Type", "text/html; charset=utf-8")
		if result.err != "" {
			response.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(response, "<!doctype html><meta charset=utf-8><title>GemiHub Desktop</title><p>Authorization failed. You can close this window and return to GemiHub Desktop.</p>")
			return
		}
		_, _ = io.WriteString(response, "<!doctype html><meta charset=utf-8><title>GemiHub Desktop</title><p>Authorization completed. You can close this window and return to GemiHub Desktop.</p>")
	})
	go func() { _ = server.Serve(listener) }()
	wailsruntime.BrowserOpenURL(a.ctx, discovery.Config.AuthorizationURL+"?"+values.Encode())

	var result callbackResult
	select {
	case result = <-callback:
	case <-time.After(3 * time.Minute):
		_ = server.Shutdown(context.Background())
		return nil, fmt.Errorf("MCP authorization timed out")
	}
	_ = server.Shutdown(context.Background())
	if result.err != "" {
		return nil, fmt.Errorf("MCP authorization failed: %s", result.err)
	}
	if result.code == "" {
		return nil, fmt.Errorf("MCP authorization returned no code")
	}
	token, err := exchangeMCPOAuthToken(discovery.Config, url.Values{
		"grant_type": {"authorization_code"}, "code": {result.code}, "redirect_uri": {redirectURI},
		"client_id": {clientID}, "code_verifier": {verifier},
	})
	if err != nil {
		return nil, err
	}
	credential := &mcpOAuthCredential{ServerURL: serverURL.String(), Config: discovery.Config}
	applyMCPOAuthToken(credential, token)
	a.mcpOAuthMu.Lock()
	defer a.mcpOAuthMu.Unlock()
	store, err := loadMCPOAuthStore()
	if err != nil {
		return nil, err
	}
	store.Servers[serverID] = credential
	if err := saveMCPOAuthStore(store); err != nil {
		return nil, err
	}
	return &MCPOAuthStatus{Connected: true, ClientID: clientID}, nil
}

func (a *App) GetMCPOAuthStatus(serverID, serverURL string) (*MCPOAuthStatus, error) {
	a.mcpOAuthMu.Lock()
	defer a.mcpOAuthMu.Unlock()
	store, err := loadMCPOAuthStore()
	if err != nil {
		return nil, err
	}
	credential := store.Servers[strings.TrimSpace(serverID)]
	if credential == nil || credential.ServerURL != strings.TrimSpace(serverURL) || credential.AccessToken == "" {
		return &MCPOAuthStatus{}, nil
	}
	return &MCPOAuthStatus{Connected: true, ClientID: credential.Config.ClientID}, nil
}

func (a *App) MCPOAuthAccessToken(serverID, serverURL string) (string, error) {
	a.mcpOAuthMu.Lock()
	defer a.mcpOAuthMu.Unlock()
	store, err := loadMCPOAuthStore()
	if err != nil {
		return "", err
	}
	credential := store.Servers[strings.TrimSpace(serverID)]
	if credential == nil || credential.ServerURL != strings.TrimSpace(serverURL) {
		return "", fmt.Errorf("authenticate this MCP server in Settings")
	}
	if credential.AccessToken != "" && (credential.Expiry.IsZero() || time.Until(credential.Expiry) > mcpOAuthRefreshBuffer) {
		return credential.AccessToken, nil
	}
	if credential.RefreshToken == "" {
		return "", fmt.Errorf("MCP OAuth token expired; authenticate the server again")
	}
	values := url.Values{"grant_type": {"refresh_token"}, "refresh_token": {credential.RefreshToken}, "client_id": {credential.Config.ClientID}}
	token, err := exchangeMCPOAuthToken(credential.Config, values)
	if err != nil {
		return "", err
	}
	applyMCPOAuthToken(credential, token)
	if err := saveMCPOAuthStore(store); err != nil {
		return "", err
	}
	return credential.AccessToken, nil
}

func (a *App) DisconnectMCPOAuth(serverID string) error {
	a.mcpOAuthMu.Lock()
	defer a.mcpOAuthMu.Unlock()
	store, err := loadMCPOAuthStore()
	if err != nil {
		return err
	}
	delete(store.Servers, strings.TrimSpace(serverID))
	return saveMCPOAuthStore(store)
}

func discoverMCPOAuth(serverURL string) (*mcpOAuthDiscovery, error) {
	server, err := validateExternalURL(serverURL, true)
	if err != nil {
		return nil, err
	}
	probeBody := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"gemihub-desktop-oauth-probe","version":"0.1.0"}}}`
	probe, err := newMCPOAuthRequest(http.MethodPost, server.String(), strings.NewReader(probeBody))
	if err != nil {
		return nil, err
	}
	probe.Header.Set("Content-Type", "application/json")
	probe.Header.Set("Accept", "application/json, text/event-stream")
	probeResponse, probeErr := mcpOAuthHTTPClient.Do(probe)
	metadataURL := ""
	if probeErr == nil {
		defer probeResponse.Body.Close()
		if probeResponse.StatusCode == http.StatusUnauthorized {
			metadataURL = bearerParameter(probeResponse.Header.Get("WWW-Authenticate"), "resource_metadata")
		}
	}
	if metadataURL == "" {
		metadataURL = server.Scheme + "://" + server.Host + "/.well-known/oauth-protected-resource"
	}
	var resource struct {
		AuthorizationServers []string `json:"authorization_servers"`
		Resource             string   `json:"resource"`
		ScopesSupported      []string `json:"scopes_supported"`
	}
	if err := fetchMCPOAuthJSON(metadataURL, &resource); err != nil {
		if discovery := googleWorkspaceMCPOAuthDiscovery(server); discovery != nil {
			return discovery, nil
		}
		if probeErr != nil {
			return nil, fmt.Errorf("MCP OAuth probe failed: %v; metadata discovery failed: %w", probeErr, err)
		}
		return nil, fmt.Errorf("MCP OAuth protected-resource discovery failed: %w", err)
	}
	if len(resource.AuthorizationServers) == 0 {
		return nil, fmt.Errorf("MCP OAuth metadata has no authorization server")
	}
	issuer, err := validateExternalURL(resource.AuthorizationServers[0], true)
	if err != nil {
		return nil, fmt.Errorf("invalid OAuth authorization server: %w", err)
	}
	path := strings.TrimSuffix(issuer.EscapedPath(), "/")
	wellKnown := issuer.Scheme + "://" + issuer.Host + "/.well-known/oauth-authorization-server" + path
	var authorization struct {
		AuthorizationEndpoint string   `json:"authorization_endpoint"`
		TokenEndpoint         string   `json:"token_endpoint"`
		RegistrationEndpoint  string   `json:"registration_endpoint"`
		ScopesSupported       []string `json:"scopes_supported"`
	}
	if err := fetchMCPOAuthJSON(wellKnown, &authorization); err != nil {
		if directErr := fetchMCPOAuthJSON(issuer.String(), &authorization); directErr != nil {
			return nil, fmt.Errorf("MCP OAuth authorization-server discovery failed: %w", err)
		}
	}
	if authorization.AuthorizationEndpoint == "" || authorization.TokenEndpoint == "" {
		return nil, fmt.Errorf("MCP OAuth metadata is missing authorization or token endpoint")
	}
	for _, endpoint := range []string{authorization.AuthorizationEndpoint, authorization.TokenEndpoint} {
		if _, err := validateExternalURL(endpoint, true); err != nil {
			return nil, fmt.Errorf("invalid OAuth endpoint: %w", err)
		}
	}
	if authorization.RegistrationEndpoint != "" {
		if _, err := validateExternalURL(authorization.RegistrationEndpoint, true); err != nil {
			return nil, fmt.Errorf("invalid OAuth registration endpoint: %w", err)
		}
	}
	scopes := resource.ScopesSupported
	if len(scopes) == 0 {
		scopes = authorization.ScopesSupported
	}
	resourceURL := resource.Resource
	if resourceURL == "" {
		resourceURL = server.String()
	}
	return &mcpOAuthDiscovery{Config: mcpOAuthConfig{AuthorizationURL: authorization.AuthorizationEndpoint, TokenURL: authorization.TokenEndpoint, Scopes: scopes, Resource: resourceURL}, RegistrationURL: authorization.RegistrationEndpoint}, nil
}

func googleWorkspaceMCPOAuthDiscovery(server *url.URL) *mcpOAuthDiscovery {
	if !strings.HasSuffix(strings.ToLower(server.Hostname()), ".googleapis.com") || !strings.Contains(strings.ToLower(server.String()), "mcp") {
		return nil
	}
	scopes := []string{"https://www.googleapis.com/auth/cloud-platform"}
	if strings.EqualFold(server.Hostname(), "gmailmcp.googleapis.com") {
		scopes = []string{
			"https://www.googleapis.com/auth/gmail.readonly",
			"https://www.googleapis.com/auth/gmail.compose",
		}
	}
	return &mcpOAuthDiscovery{Config: mcpOAuthConfig{
		AuthorizationURL: "https://accounts.google.com/o/oauth2/v2/auth",
		TokenURL:         "https://oauth2.googleapis.com/token",
		Scopes:           scopes,
	}}
}

func registerMCPOAuthClient(registrationURL, redirectURI string) (string, string, error) {
	body, _ := json.Marshal(map[string]any{"client_name": appName, "redirect_uris": []string{redirectURI}, "grant_types": []string{"authorization_code", "refresh_token"}, "response_types": []string{"code"}, "token_endpoint_auth_method": "none"})
	request, err := newMCPOAuthRequest(http.MethodPost, registrationURL, strings.NewReader(string(body)))
	if err != nil {
		return "", "", err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := mcpOAuthHTTPClient.Do(request)
	if err != nil {
		return "", "", err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	if err != nil {
		return "", "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", "", fmt.Errorf("OAuth client registration failed (%d): %s", response.StatusCode, strings.TrimSpace(string(data)))
	}
	var registered struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
	}
	if err := json.Unmarshal(data, &registered); err != nil {
		return "", "", err
	}
	if registered.ClientID == "" {
		return "", "", fmt.Errorf("OAuth client registration returned no client ID")
	}
	return registered.ClientID, registered.ClientSecret, nil
}

func exchangeMCPOAuthToken(config mcpOAuthConfig, values url.Values) (*mcpOAuthTokenResponse, error) {
	if config.ClientSecret != "" {
		values.Set("client_secret", config.ClientSecret)
	}
	request, err := newMCPOAuthRequest(http.MethodPost, config.TokenURL, strings.NewReader(values.Encode()))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	response, err := mcpOAuthHTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	if err != nil {
		return nil, err
	}
	var token mcpOAuthTokenResponse
	if err := json.Unmarshal(data, &token); err != nil {
		return nil, fmt.Errorf("OAuth token endpoint returned invalid JSON: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || token.AccessToken == "" {
		message := token.Description
		if message == "" {
			message = token.Error
		}
		if message == "" {
			message = strings.TrimSpace(string(data))
		}
		return nil, fmt.Errorf("OAuth token request failed (%d): %s", response.StatusCode, message)
	}
	return &token, nil
}

func applyMCPOAuthToken(credential *mcpOAuthCredential, token *mcpOAuthTokenResponse) {
	credential.AccessToken = token.AccessToken
	if token.RefreshToken != "" {
		credential.RefreshToken = token.RefreshToken
	}
	credential.TokenType = token.TokenType
	if credential.TokenType == "" {
		credential.TokenType = "Bearer"
	}
	if token.ExpiresIn > 0 {
		credential.Expiry = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	} else {
		credential.Expiry = time.Time{}
	}
}

func newMCPOAuthRequest(method, rawURL string, body io.Reader) (*http.Request, error) {
	parsed, err := validateExternalURL(rawURL, true)
	if err != nil {
		return nil, err
	}
	return http.NewRequest(method, parsed.String(), body)
}

func fetchMCPOAuthJSON(rawURL string, target any) error {
	request, err := newMCPOAuthRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")
	response, err := mcpOAuthHTTPClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("%s returned status %d", rawURL, response.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(response.Body, 1024*1024)).Decode(target)
}

func bearerParameter(header, name string) string {
	lower := strings.ToLower(header)
	needle := strings.ToLower(name) + "=\""
	index := strings.Index(lower, needle)
	if index < 0 {
		return ""
	}
	start := index + len(needle)
	end := strings.Index(header[start:], "\"")
	if end < 0 {
		return ""
	}
	return header[start : start+end]
}

func mcpOAuthPath() (string, error) {
	config, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	directory := filepath.Join(config, appID, "credentials")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(directory, "mcp-oauth.json"), nil
}

func loadMCPOAuthStore() (*mcpOAuthCredentialStore, error) {
	path, err := mcpOAuthPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return &mcpOAuthCredentialStore{Servers: map[string]*mcpOAuthCredential{}}, nil
	}
	if err != nil {
		return nil, err
	}
	var store mcpOAuthCredentialStore
	if err := json.Unmarshal(data, &store); err != nil {
		return nil, err
	}
	if store.Servers == nil {
		store.Servers = map[string]*mcpOAuthCredential{}
	}
	return &store, nil
}

func saveMCPOAuthStore(store *mcpOAuthCredentialStore) error {
	path, err := mcpOAuthPath()
	if err != nil {
		return err
	}
	data, err := json.Marshal(store)
	if err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return err
	}
	return os.Chmod(path, 0o600)
}
