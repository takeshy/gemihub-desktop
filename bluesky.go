package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/bluesky-social/indigo/atproto/auth/oauth"
	"github.com/bluesky-social/indigo/atproto/syntax"
	"github.com/takeshy/gemihub-desktop/internal/bluesky"
)

var blueskyMu sync.Mutex

// The authorization wait runs outside blueskyMu so status and publishing stay
// responsive; only the latest attempt can be cancelled or complete.
var blueskyConnect struct {
	mu      sync.Mutex
	attempt int
	cancel  context.CancelFunc
}
var blueskyScopes = []string{"atproto", "repo:app.bsky.feed.post?action=create", "blob:image/*"}

type BlueskyStatus struct {
	Connected bool   `json:"connected"`
	Handle    string `json:"handle,omitempty"`
	DID       string `json:"did,omitempty"`
}
type BlueskyImage = bluesky.Image
type BlueskyPost = bluesky.Post
type BlueskyPublishResult = bluesky.PublishResult
type blueskyDisk struct {
	Session *oauth.ClientSessionData `json:"session,omitempty"`
	Config  oauth.ClientConfig       `json:"config"`
	Handle  string                   `json:"handle"`
}
type blueskyStore struct {
	mu       sync.Mutex
	path     string
	data     blueskyDisk
	requests *oauth.MemStore
}

func (a *App) blueskyStore() (*blueskyStore, error) {
	dir, err := a.workspaceConfigDirPath()
	if err != nil {
		return nil, err
	}
	dir = filepath.Join(dir, "credentials")
	if err = os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	s := &blueskyStore{path: filepath.Join(dir, "bluesky-oauth.json"), requests: oauth.NewMemStore()}
	raw, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(raw, &s.data); err != nil {
		return nil, errors.New("Cannot read Bluesky credentials")
	}
	return s, nil
}
func (s *blueskyStore) save() error {
	raw, err := json.Marshal(s.data)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(s.path), ".bluesky-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if _, err = f.Write(raw); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return replaceRAGFile(name, s.path)
}
func (s *blueskyStore) GetSession(_ context.Context, did syntax.DID, id string) (*oauth.ClientSessionData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v := s.data.Session
	if v == nil || v.AccountDID != did || v.SessionID != id {
		return nil, errors.New("Connect Bluesky first")
	}
	copy := *v
	return &copy, nil
}
func (s *blueskyStore) SaveSession(_ context.Context, v oauth.ClientSessionData) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Session = &v
	return s.save()
}
func (s *blueskyStore) DeleteSession(_ context.Context, _ syntax.DID, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data.Session = nil
	return s.save()
}
func (s *blueskyStore) GetAuthRequestInfo(ctx context.Context, state string) (*oauth.AuthRequestData, error) {
	return s.requests.GetAuthRequestInfo(ctx, state)
}
func (s *blueskyStore) SaveAuthRequestInfo(ctx context.Context, v oauth.AuthRequestData) error {
	return s.requests.SaveAuthRequestInfo(ctx, v)
}
func (s *blueskyStore) DeleteAuthRequestInfo(ctx context.Context, state string) error {
	return s.requests.DeleteAuthRequestInfo(ctx, state)
}
func (s *blueskyStore) status() BlueskyStatus {
	if s.data.Session == nil {
		return BlueskyStatus{}
	}
	return BlueskyStatus{true, s.data.Handle, s.data.Session.AccountDID.String()}
}
func (a *App) GetBlueskyStatus() (BlueskyStatus, error) {
	blueskyMu.Lock()
	defer blueskyMu.Unlock()
	s, err := a.blueskyStore()
	if err != nil {
		return BlueskyStatus{}, err
	}
	return s.status(), nil
}

// CancelBlueskyConnect abandons a pending authorization, if any.
func (a *App) CancelBlueskyConnect() {
	blueskyConnect.mu.Lock()
	defer blueskyConnect.mu.Unlock()
	if blueskyConnect.cancel != nil {
		blueskyConnect.cancel()
		blueskyConnect.cancel = nil
	}
}

func (a *App) ConnectBluesky(handle string) (BlueskyStatus, error) {
	handle = strings.TrimSpace(handle)
	if _, err := syntax.ParseHandle(handle); err != nil {
		return BlueskyStatus{}, errors.New("Enter a valid Bluesky handle")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	blueskyConnect.mu.Lock()
	if blueskyConnect.cancel != nil {
		blueskyConnect.cancel()
	}
	blueskyConnect.attempt++
	attempt := blueskyConnect.attempt
	blueskyConnect.cancel = cancel
	blueskyConnect.mu.Unlock()
	defer func() {
		blueskyConnect.mu.Lock()
		if blueskyConnect.attempt == attempt {
			blueskyConnect.cancel = nil
		}
		blueskyConnect.mu.Unlock()
	}()

	blueskyMu.Lock()
	s, err := a.blueskyStore()
	blueskyMu.Unlock()
	if err != nil {
		return BlueskyStatus{}, err
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return BlueskyStatus{}, err
	}
	defer listener.Close()
	config := oauth.NewLocalhostConfig("http://"+listener.Addr().String()+"/callback", blueskyScopes)
	config.UserAgent = "GemiHub-Desktop"
	// Use a fresh store until the callback succeeds so a cancelled reconnect
	// cannot overwrite the previous account's configuration or credentials.
	pendingPath := fmt.Sprintf("%s.pending-%d", s.path, attempt)
	defer os.Remove(pendingPath)
	pending := &blueskyStore{path: pendingPath, requests: oauth.NewMemStore(), data: blueskyDisk{Config: config}}
	app := oauth.NewClientApp(&config, pending)
	redirect, err := app.StartAuthFlow(ctx, handle)
	if err != nil {
		if ctx.Err() != nil {
			return BlueskyStatus{}, errors.New("Bluesky connection cancelled")
		}
		return BlueskyStatus{}, errors.New("Could not start Bluesky authorization")
	}
	callback := make(chan url.Values, 1)
	server := &http.Server{ReadHeaderTimeout: 10 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/callback" || r.Method != "GET" {
			http.NotFound(w, r)
			return
		}
		// Ignore unrelated callback attempts; only our pending OAuth state can
		// complete the request and consume the single result slot.
		if _, err := pending.GetAuthRequestInfo(r.Context(), r.URL.Query().Get("state")); err != nil {
			http.Error(w, "Invalid authorization state", 400)
			return
		}
		select {
		case callback <- r.URL.Query():
		default:
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprint(w, "Return to GemiHub Desktop to finish connecting Bluesky.")
	})}
	go func() { _ = server.Serve(listener) }()
	defer server.Close()
	if err = a.openURL(redirect); err != nil {
		return BlueskyStatus{}, err
	}
	var params url.Values
	select {
	case params = <-callback:
	case <-ctx.Done():
		if errors.Is(ctx.Err(), context.Canceled) {
			return BlueskyStatus{}, errors.New("Bluesky connection cancelled")
		}
		return BlueskyStatus{}, errors.New("Bluesky authorization timed out")
	}
	// ProcessCallback validates state, issuer, PKCE and DPoP through the SDK.
	session, err := app.ProcessCallback(ctx, params)
	if err != nil {
		return BlueskyStatus{}, errors.New("Bluesky authorization failed")
	}
	pending.data.Handle = handle
	if identity, err := app.Dir.LookupDID(ctx, session.AccountDID); err == nil {
		pending.data.Handle = identity.Handle.String()
	}
	for _, required := range blueskyScopes {
		found := false
		for _, granted := range session.Scopes {
			if required == granted {
				found = true
			}
		}
		if !found {
			_ = app.Logout(ctx, session.AccountDID, session.SessionID)
			return BlueskyStatus{}, errors.New("Allow Bluesky posting and image uploads when connecting")
		}
	}
	blueskyMu.Lock()
	defer blueskyMu.Unlock()
	if ctx.Err() != nil {
		_ = app.Logout(context.Background(), session.AccountDID, session.SessionID)
		return BlueskyStatus{}, errors.New("Bluesky connection cancelled")
	}
	// Re-read: another connection or a disconnect may have finished meanwhile.
	if s, err = a.blueskyStore(); err != nil {
		return BlueskyStatus{}, err
	}
	if s.data.Session != nil {
		old := oauth.NewClientApp(&s.data.Config, s)
		_ = old.Logout(ctx, s.data.Session.AccountDID, s.data.Session.SessionID)
	}
	pending.path = s.path
	if err = pending.save(); err != nil {
		return BlueskyStatus{}, err
	}
	return pending.status(), nil
}
func (a *App) DisconnectBluesky() error {
	blueskyMu.Lock()
	defer blueskyMu.Unlock()
	s, err := a.blueskyStore()
	if err != nil {
		return err
	}
	if s.data.Session == nil {
		return nil
	}
	app := oauth.NewClientApp(&s.data.Config, s)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err = app.Logout(ctx, s.data.Session.AccountDID, s.data.Session.SessionID); err != nil {
		return errors.New("Could not revoke Bluesky connection; try again")
	}
	return nil
}

func (a *App) PublishBluesky(posts []BlueskyPost, did string) (BlueskyPublishResult, error) {
	blueskyMu.Lock()
	defer blueskyMu.Unlock()
	s, err := a.blueskyStore()
	if err != nil {
		return BlueskyPublishResult{}, err
	}
	if s.data.Session == nil || s.data.Session.AccountDID.String() != did {
		return BlueskyPublishResult{}, errors.New("Bluesky account changed. Reopen the preview")
	}
	app := oauth.NewClientApp(&s.data.Config, s)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	session, err := app.ResumeSession(ctx, s.data.Session.AccountDID, s.data.Session.SessionID)
	if err != nil {
		return BlueskyPublishResult{}, errors.New("Reconnect Bluesky")
	}
	return bluesky.Publish(ctx, session.APIClient(), did, posts)
}

// Images are resolved inside the Workspace and are converted in the preview.
// The frontend passes the same path candidates the Timeline renders with.
func (a *App) ReadBlueskyImage(candidates []string) (map[string]string, error) {
	for _, candidate := range candidates {
		if strings.TrimSpace(candidate) == "" || strings.Contains(candidate, "://") {
			continue
		}
		target, err := a.workspacePath(candidate, true)
		if err != nil {
			continue
		}
		info, err := os.Stat(target)
		if err != nil || !info.Mode().IsRegular() || info.Size() > 20_000_000 {
			continue
		}
		raw, err := os.ReadFile(target)
		if err != nil {
			continue
		}
		mime := http.DetectContentType(raw)
		if !strings.HasPrefix(mime, "image/") {
			return nil, errors.New("Not an image")
		}
		return map[string]string{"data": base64.StdEncoding.EncodeToString(raw), "mime": mime}, nil
	}
	return nil, errors.New("Cannot find the Workspace image")
}
