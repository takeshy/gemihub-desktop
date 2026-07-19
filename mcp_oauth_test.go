package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestDiscoverMCPOAuth(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/mcp":
			response.Header().Set("WWW-Authenticate", `Bearer resource_metadata="`+server.URL+`/resource-metadata"`)
			response.WriteHeader(http.StatusUnauthorized)
		case "/resource-metadata":
			_ = json.NewEncoder(response).Encode(map[string]any{"resource": server.URL + "/mcp", "authorization_servers": []string{server.URL}, "scopes_supported": []string{"calendar.read"}})
		case "/.well-known/oauth-authorization-server":
			_ = json.NewEncoder(response).Encode(map[string]any{"issuer": server.URL, "authorization_endpoint": server.URL + "/authorize", "token_endpoint": server.URL + "/token", "registration_endpoint": server.URL + "/register"})
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()

	discovery, err := discoverMCPOAuth(server.URL + "/mcp")
	if err != nil {
		t.Fatal(err)
	}
	if discovery.Config.AuthorizationURL != server.URL+"/authorize" || discovery.Config.TokenURL != server.URL+"/token" {
		t.Fatalf("unexpected OAuth endpoints: %#v", discovery.Config)
	}
	if discovery.Config.Resource != server.URL+"/mcp" || strings.Join(discovery.Config.Scopes, " ") != "calendar.read" {
		t.Fatalf("protected resource metadata was not retained: %#v", discovery.Config)
	}
	if discovery.RegistrationURL != server.URL+"/register" {
		t.Fatalf("unexpected registration URL: %s", discovery.RegistrationURL)
	}
}

func TestDiscoverMCPOAuthCanBeStartedManuallyAfterSuccessfulProbe(t *testing.T) {
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/mcp":
			_ = json.NewEncoder(response).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": map[string]any{}})
		case "/.well-known/oauth-protected-resource":
			_ = json.NewEncoder(response).Encode(map[string]any{"resource": server.URL + "/mcp", "authorization_servers": []string{server.URL}})
		case "/.well-known/oauth-authorization-server":
			_ = json.NewEncoder(response).Encode(map[string]any{"authorization_endpoint": server.URL + "/authorize", "token_endpoint": server.URL + "/token", "registration_endpoint": server.URL + "/register"})
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()

	discovery, err := discoverMCPOAuth(server.URL + "/mcp")
	if err != nil {
		t.Fatal(err)
	}
	if discovery.Config.AuthorizationURL != server.URL+"/authorize" {
		t.Fatalf("unexpected OAuth discovery: %#v", discovery.Config)
	}
}

func TestGoogleWorkspaceMCPOAuthDiscovery(t *testing.T) {
	server, err := url.Parse("https://gmailmcp.googleapis.com/mcp/v1")
	if err != nil {
		t.Fatal(err)
	}
	discovery := googleWorkspaceMCPOAuthDiscovery(server)
	if discovery == nil {
		t.Fatal("expected Gmail MCP OAuth fallback")
	}
	if discovery.Config.AuthorizationURL != "https://accounts.google.com/o/oauth2/v2/auth" || discovery.Config.TokenURL != "https://oauth2.googleapis.com/token" {
		t.Fatalf("unexpected Google OAuth endpoints: %#v", discovery.Config)
	}
	if !strings.Contains(strings.Join(discovery.Config.Scopes, " "), "gmail.readonly") {
		t.Fatalf("missing Gmail OAuth scopes: %#v", discovery.Config.Scopes)
	}
}

func TestGoogleCloudMCPOAuthDiscovery(t *testing.T) {
	server, err := url.Parse("https://logging.googleapis.com/mcp")
	if err != nil {
		t.Fatal(err)
	}
	discovery := googleWorkspaceMCPOAuthDiscovery(server)
	if discovery == nil || strings.Join(discovery.Config.Scopes, " ") != "https://www.googleapis.com/auth/cloud-platform" {
		t.Fatalf("unexpected Google Cloud MCP OAuth fallback: %#v", discovery)
	}
}

func TestRegisterMCPOAuthClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		var registration map[string]any
		if err := json.NewDecoder(request.Body).Decode(&registration); err != nil {
			t.Fatal(err)
		}
		redirects, _ := registration["redirect_uris"].([]any)
		if len(redirects) != 1 || redirects[0] != "http://127.0.0.1:1234/callback" {
			t.Fatalf("unexpected registration: %#v", registration)
		}
		_ = json.NewEncoder(response).Encode(map[string]string{"client_id": "dynamic-client", "client_secret": "dynamic-secret"})
	}))
	defer server.Close()
	clientID, secret, err := registerMCPOAuthClient(server.URL, "http://127.0.0.1:1234/callback")
	if err != nil {
		t.Fatal(err)
	}
	if clientID != "dynamic-client" || secret != "dynamic-secret" {
		t.Fatalf("unexpected client credentials: %q %q", clientID, secret)
	}
}

func TestMCPOAuthAccessTokenRefreshesAndPersists(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if request.Form.Get("grant_type") != "refresh_token" || request.Form.Get("refresh_token") != "refresh-1" {
			t.Fatalf("unexpected refresh form: %s", request.Form.Encode())
		}
		_ = json.NewEncoder(response).Encode(map[string]any{"access_token": "access-2", "expires_in": 3600, "token_type": "Bearer"})
	}))
	defer server.Close()
	store := &mcpOAuthCredentialStore{Servers: map[string]*mcpOAuthCredential{"server-1": {
		ServerURL: "https://example.com/mcp", Config: mcpOAuthConfig{ClientID: "client-1", TokenURL: server.URL}, AccessToken: "access-1", RefreshToken: "refresh-1", Expiry: time.Now().Add(time.Minute),
	}}}
	if err := saveMCPOAuthStore(store); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	token, err := app.MCPOAuthAccessToken("server-1", "https://example.com/mcp")
	if err != nil {
		t.Fatal(err)
	}
	if token != "access-2" {
		t.Fatalf("unexpected access token: %s", token)
	}
	saved, err := loadMCPOAuthStore()
	if err != nil {
		t.Fatal(err)
	}
	if saved.Servers["server-1"].AccessToken != "access-2" || saved.Servers["server-1"].RefreshToken != "refresh-1" {
		t.Fatalf("refreshed credentials were not preserved: %#v", saved.Servers["server-1"])
	}
}

func TestExchangeMCPOAuthTokenIncludesClientSecret(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		_ = request.ParseForm()
		if request.Form.Get("client_secret") != "secret" {
			t.Fatal("client secret missing")
		}
		_ = json.NewEncoder(response).Encode(map[string]any{"access_token": "access", "refresh_token": "refresh"})
	}))
	defer server.Close()
	token, err := exchangeMCPOAuthToken(mcpOAuthConfig{ClientID: "client", ClientSecret: "secret", TokenURL: server.URL}, url.Values{"grant_type": {"authorization_code"}})
	if err != nil || token.AccessToken != "access" {
		t.Fatalf("unexpected token response: %#v, %v", token, err)
	}
}
