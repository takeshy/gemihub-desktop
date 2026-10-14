package bluesky

import (
	"context"
	"encoding/json"
	"github.com/bluesky-social/indigo/atproto/atclient"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func TestLostResponseRetryKeepsOneThread(t *testing.T) {
	rows := map[string]blueskyRecord{}
	writes := 0
	lose := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "getRecord") {
			row, ok := rows[r.URL.Query().Get("rkey")]
			if !ok {
				w.WriteHeader(400)
				json.NewEncoder(w).Encode(map[string]string{"error": "RecordNotFound"})
				return
			}
			json.NewEncoder(w).Encode(row)
			return
		}
		if strings.HasSuffix(r.URL.Path, "createRecord") {
			var request struct {
				RKey   string         `json:"rkey"`
				Record map[string]any `json:"record"`
			}
			json.NewDecoder(r.Body).Decode(&request)
			writes++
			row := blueskyRecord{URI: "at://did:plc:test/app.bsky.feed.post/" + request.RKey, CID: request.RKey, Value: request.Record}
			rows[request.RKey] = row
			if lose {
				lose = false
				w.WriteHeader(500)
				return
			}
			json.NewEncoder(w).Encode(row)
			return
		}
		t.Errorf("unexpected endpoint: %s", r.URL.Path)
	}))
	defer server.Close()
	posts := []Post{{ID: "root", Text: "hello", CreatedAt: "2026-10-14T00:00:00Z"}, {ID: "reply", Text: "reply", CreatedAt: "2026-10-14T00:00:01Z", Parent: "root"}}
	api := atclient.NewAPIClient(server.URL)
	if _, err := Publish(context.Background(), api, "did:plc:test", posts); err == nil {
		t.Fatal("expected uncertain result")
	}
	result, err := Publish(context.Background(), api, "did:plc:test", posts)
	if err != nil {
		t.Fatal(err)
	}
	if writes != 2 || len(rows) != 2 || len(result.URLs) != 2 {
		t.Fatalf("duplicate publication: writes=%d rows=%d", writes, len(rows))
	}
	reply := rows[RecordKey("did:plc:test", posts[1])].Value["reply"].(map[string]any)
	if reply["root"].(map[string]any)["uri"] != rows[RecordKey("did:plc:test", posts[0])].URI {
		t.Fatal("broken reply root")
	}
	if _, err := Publish(context.Background(), api, "did:plc:test", posts); err != nil {
		t.Fatal(err)
	}
	if writes != 2 {
		t.Fatal("retry wrote duplicates")
	}
}
func TestReadFailureNeverCreates(t *testing.T) {
	writes := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			writes++
		}
		w.WriteHeader(503)
	}))
	defer server.Close()
	_, err := Publish(context.Background(), atclient.NewAPIClient(server.URL), "did:plc:test", []Post{{ID: "p", Text: "hello", CreatedAt: "2026-10-14T00:00:00Z"}})
	if err == nil || writes != 0 {
		t.Fatal("read uncertainty must not permit creation")
	}
}
func TestValidation(t *testing.T) {
	for _, p := range []Post{{ID: "p", Text: strings.Repeat("あ", 301), CreatedAt: "2026-10-14T00:00:00Z"}, {ID: "p", Text: "x", CreatedAt: "invalid"}, {ID: "p", Text: "x", CreatedAt: "2026-10-14T00:00:00Z", Parent: "missing"}} {
		if ValidatePosts([]Post{p}) == nil {
			t.Fatal("accepted invalid post")
		}
	}
	if ValidatePosts([]Post{{ID: "emoji", Text: strings.Repeat("👨‍👩‍👧‍👦", 100), CreatedAt: "2026-10-14T00:00:00Z"}}) != nil {
		t.Fatal("valid graphemes rejected")
	}
}

func TestLinkFacetsUseUTF8Bytes(t *testing.T) {
	text := "日本語 https://example.com。"
	facets := linkFacets(text)
	if len(facets) != 1 {
		t.Fatal("missing link")
	}
	index := facets[0].(map[string]any)["index"].(map[string]int)
	if index["byteStart"] != len("日本語 ") || index["byteEnd"] != len("日本語 https://example.com") {
		t.Fatal("incorrect UTF-8 range")
	}
}

func TestExpiredAuthorizationAsksToReconnect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(401)
		json.NewEncoder(w).Encode(map[string]string{"error": "InvalidToken", "message": "token expired"})
	}))
	defer server.Close()
	api := atclient.NewAPIClient(server.URL)
	posts := []Post{{ID: "a", Text: "hello", CreatedAt: "2026-10-14T00:00:00Z"}}
	if _, err := Publish(context.Background(), api, "did:plc:test", posts); err != ErrReconnect {
		t.Fatalf("error = %v", err)
	}
}

func TestRecordKeysAreStableTIDs(t *testing.T) {
	post := Post{ID: "a", Text: "hello", CreatedAt: "2026-10-14T00:00:00Z"}
	key := RecordKey("did:plc:test", post)
	if !regexp.MustCompile(`^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$`).MatchString(key) {
		t.Fatalf("not a TID: %s", key)
	}
	if key != RecordKey("did:plc:test", post) {
		t.Fatal("key is not deterministic")
	}
	post.Text = "edited"
	if key == RecordKey("did:plc:test", post) {
		t.Fatal("different content shares a key")
	}
}
