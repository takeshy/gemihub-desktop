package main

import (
	"context"
	"crypto/rand"
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

const (
	googleOAuthAuthorizationURL = "https://accounts.google.com/o/oauth2/v2/auth"
	googleOAuthTokenURL         = "https://oauth2.googleapis.com/token"
	googleOAuthRevokeURL        = "https://oauth2.googleapis.com/revoke"
	vertexCloudScope            = "https://www.googleapis.com/auth/cloud-platform"
)

type VertexOAuthClient struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	ProjectID    string `json:"projectId"`
}

type VertexOAuthStatus struct {
	Connected bool   `json:"connected"`
	ClientID  string `json:"clientId,omitempty"`
}

type vertexOAuthCredentials struct {
	ClientID     string    `json:"clientId"`
	ClientSecret string    `json:"clientSecret,omitempty"`
	RefreshToken string    `json:"refreshToken"`
	AccessToken  string    `json:"accessToken,omitempty"`
	Expiry       time.Time `json:"expiry,omitempty"`
}

type googleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Error        string `json:"error"`
	Description  string `json:"error_description"`
}

var vertexOAuthHTTPClient = &http.Client{Timeout: 30 * time.Second}

func (a *App) SelectVertexOAuthClient() (*VertexOAuthClient, error) {
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: "Select Google OAuth desktop client JSON", Filters: []wailsruntime.FileFilter{{DisplayName: "OAuth client JSON", Pattern: "*.json"}}})
	if err != nil || path == "" {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var document struct {
		Installed *struct {
			ClientID     string `json:"client_id"`
			ClientSecret string `json:"client_secret"`
			ProjectID    string `json:"project_id"`
		} `json:"installed"`
	}
	if err := json.Unmarshal(data, &document); err != nil {
		return nil, err
	}
	if document.Installed == nil || document.Installed.ClientID == "" {
		return nil, fmt.Errorf("the JSON must contain an OAuth client of type Desktop app")
	}
	return &VertexOAuthClient{ClientID: document.Installed.ClientID, ClientSecret: document.Installed.ClientSecret, ProjectID: document.Installed.ProjectID}, nil
}

func (a *App) ConnectVertexOAuth(clientID, clientSecret string) (*VertexOAuthStatus, error) {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" {
		return nil, fmt.Errorf("OAuth client ID is required")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	defer listener.Close()
	redirectURI := "http://" + listener.Addr().String() + "/callback"
	state, err := randomOAuthValue(32)
	if err != nil {
		return nil, err
	}
	verifier, err := randomOAuthValue(64)
	if err != nil {
		return nil, err
	}
	challengeBytes := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(challengeBytes[:])
	values := url.Values{"client_id": {clientID}, "redirect_uri": {redirectURI}, "response_type": {"code"}, "scope": {vertexCloudScope}, "access_type": {"offline"}, "prompt": {"consent"}, "include_granted_scopes": {"true"}, "state": {state}, "code_challenge": {challenge}, "code_challenge_method": {"S256"}}
	type callbackResult struct{ code, err string }
	callback := make(chan callbackResult, 1)
	server := &http.Server{ReadHeaderTimeout: 10 * time.Second}
	server.Handler = http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/callback" {
			http.NotFound(response, request)
			return
		}
		if request.URL.Query().Get("state") != state {
			callback <- callbackResult{err: "OAuth state did not match"}
			http.Error(response, "OAuth state did not match", http.StatusBadRequest)
			return
		}
		callback <- callbackResult{code: request.URL.Query().Get("code"), err: request.URL.Query().Get("error")}
		response.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(response, "<!doctype html><meta charset=utf-8><title>GemiHub Desktop</title><p>Google authorization completed. You can close this window and return to GemiHub Desktop.</p>")
	})
	go func() { _ = server.Serve(listener) }()
	wailsruntime.BrowserOpenURL(a.ctx, googleOAuthAuthorizationURL+"?"+values.Encode())
	var result callbackResult
	select {
	case result = <-callback:
	case <-time.After(3 * time.Minute):
		_ = server.Shutdown(context.Background())
		return nil, fmt.Errorf("Google authorization timed out")
	}
	_ = server.Shutdown(context.Background())
	if result.err != "" {
		return nil, fmt.Errorf("Google authorization failed: %s", result.err)
	}
	if result.code == "" {
		return nil, fmt.Errorf("Google authorization returned no code")
	}
	token, err := exchangeGoogleToken(url.Values{"client_id": {clientID}, "client_secret": {clientSecret}, "code": {result.code}, "code_verifier": {verifier}, "redirect_uri": {redirectURI}, "grant_type": {"authorization_code"}})
	if err != nil {
		return nil, err
	}
	if token.RefreshToken == "" {
		return nil, fmt.Errorf("Google did not return a refresh token; revoke the existing grant and connect again")
	}
	credentials := &vertexOAuthCredentials{ClientID: clientID, ClientSecret: clientSecret, RefreshToken: token.RefreshToken, AccessToken: token.AccessToken, Expiry: time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)}
	if err := saveVertexOAuthCredentials(credentials); err != nil {
		return nil, err
	}
	return &VertexOAuthStatus{Connected: true, ClientID: clientID}, nil
}

func (a *App) GetVertexOAuthStatus() (*VertexOAuthStatus, error) {
	credentials, err := loadVertexOAuthCredentials()
	if os.IsNotExist(err) {
		return &VertexOAuthStatus{}, nil
	}
	if err != nil {
		return nil, err
	}
	return &VertexOAuthStatus{Connected: credentials.RefreshToken != "", ClientID: credentials.ClientID}, nil
}

func (a *App) DisconnectVertexOAuth() error {
	credentials, _ := loadVertexOAuthCredentials()
	if credentials != nil && credentials.RefreshToken != "" {
		if response, err := vertexOAuthHTTPClient.PostForm(googleOAuthRevokeURL, url.Values{"token": {credentials.RefreshToken}}); err == nil {
			response.Body.Close()
		}
	}
	path, err := vertexOAuthPath()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (a *App) vertexOAuthAccessToken() (string, error) {
	credentials, err := loadVertexOAuthCredentials()
	if err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("connect a Google account in the Vertex AI settings")
		}
		return "", err
	}
	if credentials.AccessToken != "" && time.Until(credentials.Expiry) > time.Minute {
		return credentials.AccessToken, nil
	}
	token, err := exchangeGoogleToken(url.Values{"client_id": {credentials.ClientID}, "client_secret": {credentials.ClientSecret}, "refresh_token": {credentials.RefreshToken}, "grant_type": {"refresh_token"}})
	if err != nil {
		return "", err
	}
	credentials.AccessToken = token.AccessToken
	credentials.Expiry = time.Now().Add(time.Duration(token.ExpiresIn) * time.Second)
	if token.RefreshToken != "" {
		credentials.RefreshToken = token.RefreshToken
	}
	if err := saveVertexOAuthCredentials(credentials); err != nil {
		return "", err
	}
	return credentials.AccessToken, nil
}

func exchangeGoogleToken(values url.Values) (*googleTokenResponse, error) {
	response, err := vertexOAuthHTTPClient.PostForm(googleOAuthTokenURL, values)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1024*1024))
	if err != nil {
		return nil, err
	}
	var token googleTokenResponse
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || token.AccessToken == "" {
		message := token.Description
		if message == "" {
			message = token.Error
		}
		return nil, fmt.Errorf("Google token exchange failed (%d): %s", response.StatusCode, message)
	}
	return &token, nil
}

func randomOAuthValue(size int) (string, error) {
	data := make([]byte, size)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func vertexOAuthPath() (string, error) {
	config, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	directory := filepath.Join(config, appID, "credentials")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(directory, "vertex-oauth.json"), nil
}

func loadVertexOAuthCredentials() (*vertexOAuthCredentials, error) {
	path, err := vertexOAuthPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var credentials vertexOAuthCredentials
	if err := json.Unmarshal(data, &credentials); err != nil {
		return nil, err
	}
	return &credentials, nil
}

func saveVertexOAuthCredentials(credentials *vertexOAuthCredentials) error {
	path, err := vertexOAuthPath()
	if err != nil {
		return err
	}
	data, err := json.Marshal(credentials)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}
