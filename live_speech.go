package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/coder/websocket"
)

var vertexProjectIDPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]*$`)

// How long a provider may take to send the closing transcript after the audio
// stream ends before the session is abandoned.
const liveSpeechFinalizeTimeout = 10 * time.Second

type LiveSpeechSettings struct {
	EndpointType    string `json:"endpointType"`
	APIKey          string `json:"apiKey"`
	Language        string `json:"language"`
	VertexProjectID string `json:"vertexProjectId"`
}
type liveSpeechEventData struct {
	SessionID string `json:"sessionId"`
	Kind      string `json:"kind"`
	ItemID    string `json:"itemId,omitempty"`
	Text      string `json:"text,omitempty"`
	Message   string `json:"message,omitempty"`
}
type liveSpeechSession struct {
	id, provider string
	conn         *websocket.Conn
	ctx          context.Context
	cancel       context.CancelFunc
	writeMu      sync.Mutex
	done         chan struct{}
	finishing    atomic.Bool
}

func (s *liveSpeechSession) write(value any) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	ctx, cancel := context.WithTimeout(s.ctx, 15*time.Second)
	defer cancel()
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return s.conn.Write(ctx, websocket.MessageText, data)
}

func (a *App) StartLiveSpeech(settings LiveSpeechSettings) (string, error) {
	a.StopLiveSpeech()
	if settings.EndpointType != "openai" && settings.EndpointType != "gemini-transcribe" && settings.EndpointType != "vertex-transcribe" {
		return "", errors.New("live speech supports OpenAI, Gemini API, and Vertex AI only")
	}
	if settings.EndpointType != "vertex-transcribe" && strings.TrimSpace(settings.APIKey) == "" {
		return "", errors.New("API key is required")
	}
	if settings.EndpointType == "vertex-transcribe" && !vertexProjectIDPattern.MatchString(strings.TrimSpace(settings.VertexProjectID)) {
		return "", errors.New("valid Vertex AI project ID is required")
	}
	parent := a.ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	s := &liveSpeechSession{id: fmt.Sprintf("live-%d", time.Now().UnixNano()), provider: settings.EndpointType, ctx: ctx, cancel: cancel, done: make(chan struct{})}
	headers := http.Header{}
	endpoint := ""
	switch settings.EndpointType {
	case "openai":
		endpoint = "wss://api.openai.com/v1/realtime?intent=transcription"
		headers.Set("Authorization", "Bearer "+settings.APIKey)
	case "gemini-transcribe":
		endpoint = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
		headers.Set("x-goog-api-key", settings.APIKey)
	default:
		token, err := a.vertexOAuthAccessToken()
		if err != nil {
			cancel()
			return "", err
		}
		endpoint = "wss://aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"
		headers.Set("Authorization", "Bearer "+token)
	}
	conn, _, err := websocket.Dial(ctx, endpoint, &websocket.DialOptions{HTTPHeader: headers, HTTPClient: &http.Client{Transport: publicNetworkTransport()}})
	if err != nil {
		cancel()
		return "", fmt.Errorf("live speech connection failed: %w", err)
	}
	s.conn = conn
	if err := s.write(liveSpeechSetup(settings)); err != nil {
		_ = conn.Close(websocket.StatusInternalError, "setup failed")
		cancel()
		return "", err
	}
	if err := waitLiveSpeechReady(s); err != nil {
		_ = conn.Close(websocket.StatusPolicyViolation, "setup rejected")
		cancel()
		return "", fmt.Errorf("live speech setup failed: %w", err)
	}
	a.liveMu.Lock()
	a.liveSpeech = s
	a.liveMu.Unlock()
	go a.readLiveSpeech(s)
	return s.id, nil
}

func liveSpeechSetup(settings LiveSpeechSettings) any {
	language := strings.TrimSpace(settings.Language)
	if strings.EqualFold(language, "auto") {
		language = ""
	}
	if settings.EndpointType == "openai" {
		transcription := map[string]any{"model": "gpt-live-transcribe", "delay": "low"}
		if language != "" {
			transcription["languages"] = []string{language}
		}
		return map[string]any{"type": "session.update", "session": map[string]any{"type": "transcription", "audio": map[string]any{"input": map[string]any{"format": map[string]any{"type": "audio/pcm", "rate": 24000}, "transcription": transcription, "turn_detection": nil}}}}
	}
	languages := []string{}
	if language != "" {
		languages = append(languages, language)
	}
	model := "models/gemini-3.5-transcribe-live"
	if settings.EndpointType == "vertex-transcribe" {
		model = fmt.Sprintf("projects/%s/locations/global/publishers/google/models/gemini-3.5-transcribe-live-preview", settings.VertexProjectID)
	}
	return map[string]any{"setup": map[string]any{"model": model, "generationConfig": map[string]any{"responseModalities": []string{"TEXT"}}, "inputAudioTranscription": map[string]any{"languageCodes": languages, "mode": "SMART"}}}
}

func waitLiveSpeechReady(s *liveSpeechSession) error {
	ctx, cancel := context.WithTimeout(s.ctx, 15*time.Second)
	defer cancel()
	for {
		_, data, err := s.conn.Read(ctx)
		if err != nil {
			return err
		}
		var msg map[string]any
		if json.Unmarshal(data, &msg) != nil {
			return errors.New("invalid live speech setup response")
		}
		if remote, ok := msg["error"].(map[string]any); ok {
			return errors.New(liveProviderError(s.provider, remote))
		}
		if s.provider == "openai" {
			if msg["type"] == "session.updated" {
				return nil
			}
		} else if msg["setupComplete"] != nil || msg["setup_complete"] != nil {
			return nil
		}
	}
}
func (a *App) SendLiveSpeechAudio(id, audio string) error {
	s, err := a.currentLiveSpeech(id)
	if err != nil {
		return err
	}
	if len(audio) == 0 || len(audio) > 1024*1024 {
		return errors.New("invalid live audio chunk")
	}
	if s.provider == "openai" {
		return s.write(map[string]any{"type": "input_audio_buffer.append", "audio": audio})
	}
	return s.write(map[string]any{"realtimeInput": map[string]any{"audio": map[string]any{"data": audio, "mimeType": "audio/pcm;rate=16000"}}})
}
func (a *App) FinishLiveSpeech(id string) error {
	s, err := a.currentLiveSpeech(id)
	if err != nil {
		return err
	}
	s.finishing.Store(true)
	var payload any = map[string]any{"realtimeInput": map[string]any{"audioStreamEnd": true}}
	if s.provider == "openai" {
		payload = map[string]any{"type": "input_audio_buffer.commit"}
	}
	if err := s.write(payload); err != nil {
		return err
	}
	go func() {
		select {
		case <-s.done:
		case <-time.After(liveSpeechFinalizeTimeout):
			// The closing transcript never arrived, so the draft is missing its
			// tail: report that rather than a normal completion.
			a.emitEvent("speech:live", liveSpeechEventData{SessionID: s.id, Kind: "error", Message: "live transcription did not finish in time; the last words may be missing"})
			a.stopLiveSpeechSession(s)
		}
	}()
	return nil
}
func (a *App) StopLiveSpeech() {
	a.liveMu.Lock()
	s := a.liveSpeech
	a.liveSpeech = nil
	a.liveMu.Unlock()
	if s != nil {
		s.cancel()
		_ = s.conn.CloseNow()
	}
}
func (a *App) currentLiveSpeech(id string) (*liveSpeechSession, error) {
	a.liveMu.Lock()
	defer a.liveMu.Unlock()
	if a.liveSpeech == nil || a.liveSpeech.id != id {
		return nil, errors.New("live speech session is not active")
	}
	return a.liveSpeech, nil
}
func (a *App) stopLiveSpeechSession(s *liveSpeechSession) {
	a.liveMu.Lock()
	if a.liveSpeech == s {
		a.liveSpeech = nil
	}
	a.liveMu.Unlock()
	s.cancel()
	_ = s.conn.CloseNow()
}
func (a *App) readLiveSpeech(s *liveSpeechSession) {
	defer close(s.done)
	defer a.stopLiveSpeechSession(s)
	for {
		_, data, err := s.conn.Read(s.ctx)
		if err != nil {
			if s.ctx.Err() == nil && s.finishing.Load() {
				a.emitEvent("speech:live", liveSpeechEventData{SessionID: s.id, Kind: "done"})
			} else if s.ctx.Err() == nil {
				a.emitEvent("speech:live", liveSpeechEventData{SessionID: s.id, Kind: "error", Message: err.Error()})
			}
			return
		}
		for _, event := range normalizeLiveSpeechMessage(s.id, s.provider, data) {
			a.emitEvent("speech:live", event)
		}
	}
}
func normalizeLiveSpeechMessage(id, provider string, data []byte) []liveSpeechEventData {
	var msg map[string]any
	if json.Unmarshal(data, &msg) != nil {
		return []liveSpeechEventData{{SessionID: id, Kind: "error", Message: "invalid live speech response"}}
	}
	if remote, ok := msg["error"].(map[string]any); ok {
		return []liveSpeechEventData{{SessionID: id, Kind: "error", Message: liveProviderError(provider, remote)}}
	}
	if provider == "openai" {
		kind, _ := msg["type"].(string)
		item, _ := msg["item_id"].(string)
		if kind == "conversation.item.input_audio_transcription.delta" {
			text, _ := msg["delta"].(string)
			return []liveSpeechEventData{{SessionID: id, Kind: "delta", ItemID: item, Text: text}}
		}
		if kind == "conversation.item.input_audio_transcription.completed" {
			text, _ := msg["transcript"].(string)
			return []liveSpeechEventData{{SessionID: id, Kind: "final", ItemID: item, Text: text}}
		}
		return nil
	}
	content, _ := msg["serverContent"].(map[string]any)
	if content == nil {
		content, _ = msg["server_content"].(map[string]any)
	}
	if content == nil {
		return nil
	}
	result := []liveSpeechEventData{}
	for _, f := range []struct{ k, a, kind string }{{"interimInputTranscription", "interim_input_transcription", "interim"}, {"inputTranscription", "input_transcription", "final"}} {
		part, _ := content[f.k].(map[string]any)
		if part == nil {
			part, _ = content[f.a].(map[string]any)
		}
		text, _ := part["text"].(string)
		if text != "" {
			result = append(result, liveSpeechEventData{SessionID: id, Kind: f.kind, Text: text})
		}
	}
	return result
}
func liveProviderError(provider string, remote map[string]any) string {
	name := map[string]string{"openai": "OpenAI", "gemini-transcribe": "Gemini API", "vertex-transcribe": "Vertex AI"}[provider]
	message := strings.TrimSpace(fmt.Sprint(remote["message"]))
	if message == "<nil>" || message == "" {
		message = "live transcription failed"
	}
	return name + ": " + message
}
