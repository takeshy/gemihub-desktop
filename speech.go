package main

import (
	"fmt"
	"regexp"
	"strings"
)

// OAuth credentials are only attached to this fixed model and global endpoint.
var vertexSpeechURLPattern = regexp.MustCompile(`^https://aiplatform\.googleapis\.com/v1beta1/projects/[a-zA-Z0-9][a-zA-Z0-9_-]*/locations/global/publishers/google/models/gemini-3\.5-transcribe-preview:generateContent$`)

func (a *App) VertexSpeechHTTPRequest(request ExternalHTTPRequest) (*ExternalHTTPResponse, error) {
	return vertexSpeechHTTPRequest(request, a.vertexOAuthAccessToken, func(r ExternalHTTPRequest) (*ExternalHTTPResponse, error) {
		return a.doExternalHTTPRequest(r, false)
	})
}

func vertexSpeechHTTPRequest(request ExternalHTTPRequest, accessToken func() (string, error), send func(ExternalHTTPRequest) (*ExternalHTTPResponse, error)) (*ExternalHTTPResponse, error) {
	if !vertexSpeechURLPattern.MatchString(request.URL) || request.Method != "POST" {
		return nil, fmt.Errorf("invalid Vertex AI speech endpoint or method")
	}
	token, err := accessToken()
	if err != nil {
		// OAuth errors can include remote responses; do not expose those to the UI.
		return nil, fmt.Errorf("Vertex AIの認証を取得できません。AI設定でGoogleに再接続してください。")
	}
	if strings.TrimSpace(token) == "" {
		return nil, fmt.Errorf("Vertex AIのGoogleログインが必要です。")
	}
	request.Headers = map[string]string{"Content-Type": "application/json", "Authorization": "Bearer " + token}
	return send(request)
}
