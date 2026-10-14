package bluesky

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"github.com/bluesky-social/indigo/atproto/atclient"
	"github.com/rivo/uniseg"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

type Image struct {
	Data string `json:"data"`
	MIME string `json:"mime"`
	Alt  string `json:"alt"`
}
type Post struct {
	Images    []Image `json:"images,omitempty"`
	ID        string  `json:"id"`
	Text      string  `json:"text"`
	CreatedAt string  `json:"createdAt"`
	Parent    string  `json:"parent"`
}
type PublishResult struct {
	URLs []string `json:"urls"`
}

const tidAlphabet = "234567abcdefghijklmnopqrstuvwxyz"

// Deterministic record keys let us reconcile a lost response before retrying.
// A different text or parent produces a separate, explicitly selected version.
// app.bsky.feed.post requires TID keys, so the key is a valid TID: the post's
// time in microseconds, with the sub-millisecond part and clock id from a hash.
func RecordKey(did string, p Post) string {
	raw, _ := json.Marshal([]any{did, p.ID, p.Text, p.CreatedAt, p.Parent, p.Images})
	sum := sha256.Sum256(raw)
	at, _ := time.Parse(time.RFC3339Nano, p.CreatedAt)
	micros := uint64(at.UnixMilli())*1000 + uint64(binary.BigEndian.Uint32(sum[:4]))%1000
	clock := uint64(binary.BigEndian.Uint16(sum[4:6])) & 0x3ff
	tid := micros<<10 | clock
	key := make([]byte, 13)
	for i := 12; i >= 0; i-- {
		key[i] = tidAlphabet[tid&31]
		tid >>= 5
	}
	return string(key)
}
func ValidatePosts(posts []Post) error {
	if len(posts) == 0 || len(posts) > 100 {
		return errors.New("Select between 1 and 100 posts")
	}
	seen := map[string]bool{}
	for _, p := range posts {
		if p.ID == "" || len(p.ID) > 4096 || seen[p.ID] || (strings.TrimSpace(p.Text) == "" && len(p.Images) == 0) || len(p.Text) > 3000 || uniseg.GraphemeClusterCount(p.Text) > 300 || !utf8.ValidString(p.Text) {
			return errors.New("Invalid Bluesky post")
		}
		if _, err := time.Parse(time.RFC3339Nano, p.CreatedAt); err != nil {
			return errors.New("Invalid post time")
		}
		if p.Parent != "" && !seen[p.Parent] {
			return errors.New("Parent must precede its reply")
		}
		if len(p.Images) > 4 {
			return errors.New("At most four images are allowed")
		}
		for _, im := range p.Images {
			raw, err := base64.StdEncoding.DecodeString(im.Data)
			if err != nil || len(raw) == 0 || len(raw) > 1_000_000 || len(im.Alt) > 8000 || !(im.MIME == "image/jpeg" || im.MIME == "image/png" || im.MIME == "image/webp") || http.DetectContentType(raw) != im.MIME {
				return errors.New("Invalid Bluesky image")
			}
		}
		seen[p.ID] = true
	}
	return nil
}

// ErrReconnect means the stored authorization no longer works; retrying
// cannot help until the user connects again.
var ErrReconnect = errors.New("Bluesky connection expired. Reconnect Bluesky, then retry the same selection")

// needsReconnect reports whether a request failed because the PDS or the
// authorization server rejected our tokens, rather than a transient failure.
func needsReconnect(err error) bool {
	var apiErr *atclient.APIError
	if errors.As(err, &apiErr) {
		switch apiErr.Name {
		case "AuthenticationRequired", "AuthMissing", "InvalidToken", "ExpiredToken", "invalid_token", "invalid_grant", "InsufficientScope":
			return true
		}
		return apiErr.StatusCode == http.StatusUnauthorized
	}
	// Token refresh errors are plain errors that carry the HTTP status.
	message := err.Error()
	return strings.Contains(message, "token refresh failed (HTTP 4")
}

type blueskyRecord struct {
	URI   string         `json:"uri"`
	CID   string         `json:"cid"`
	Value map[string]any `json:"value"`
}

func Publish(ctx context.Context, api *atclient.APIClient, did string, posts []Post) (PublishResult, error) {
	result := PublishResult{URLs: []string{}}
	if err := ValidatePosts(posts); err != nil {
		return result, err
	}
	refs := map[string]blueskyRecord{}
	roots := map[string]blueskyRecord{}
	for _, p := range posts {
		key := RecordKey(did, p)
		value := map[string]any{"$type": "app.bsky.feed.post", "text": p.Text, "createdAt": p.CreatedAt}
		if facets := linkFacets(p.Text); len(facets) > 0 {
			value["facets"] = facets
		}
		root := blueskyRecord{}
		if p.Parent != "" {
			parent := refs[p.Parent]
			root = roots[p.Parent]
			value["reply"] = map[string]any{"root": map[string]string{"uri": root.URI, "cid": root.CID}, "parent": map[string]string{"uri": parent.URI, "cid": parent.CID}}
		}
		var record blueskyRecord
		err := api.Get(ctx, "com.atproto.repo.getRecord", map[string]any{"repo": did, "collection": "app.bsky.feed.post", "rkey": key}, &record)
		if err != nil {
			var apiErr *atclient.APIError
			if needsReconnect(err) {
				return result, ErrReconnect
			}
			if !errors.As(err, &apiErr) || apiErr.Name != "RecordNotFound" {
				return result, errors.New("Could not verify Bluesky publication. Retry to check before sending again")
			}
			if len(p.Images) > 0 {
				images := []any{}
				for _, image := range p.Images {
					raw, _ := base64.StdEncoding.DecodeString(image.Data)
					req := atclient.NewAPIRequest(http.MethodPost, "com.atproto.repo.uploadBlob", bytes.NewReader(raw))
					req.Headers.Set("Content-Type", image.MIME)
					response, err := api.Do(ctx, req)
					if err != nil {
						if needsReconnect(err) {
							return result, ErrReconnect
						}
						return result, errors.New("Could not upload Bluesky image")
					}
					var uploaded struct {
						Blob json.RawMessage `json:"blob"`
					}
					decodeErr := json.NewDecoder(io.LimitReader(response.Body, 2<<20)).Decode(&uploaded)
					response.Body.Close()
					if response.StatusCode == http.StatusUnauthorized {
						return result, ErrReconnect
					}
					if response.StatusCode < 200 || response.StatusCode >= 300 || decodeErr != nil || len(uploaded.Blob) == 0 {
						return result, errors.New("Could not upload Bluesky image")
					}
					images = append(images, map[string]any{"alt": image.Alt, "image": uploaded.Blob})
				}
				value["embed"] = map[string]any{"$type": "app.bsky.embed.images", "images": images}
			}
			value["createdAt"] = time.Now().UTC().Format(time.RFC3339Nano)
			err = api.Post(ctx, "com.atproto.repo.createRecord", map[string]any{"repo": did, "collection": "app.bsky.feed.post", "rkey": key, "record": value}, &record)
			if err != nil && needsReconnect(err) {
				// A rejected token means the record was not created.
				return result, ErrReconnect
			}
			if err != nil {
				return result, errors.New("Publication could not be confirmed. Retry the same selection to check before sending again")
			}
		} else {
			compare := map[string]any{}
			for k, v := range record.Value {
				if k != "embed" && k != "createdAt" {
					compare[k] = v
				}
			}
			a, _ := json.Marshal(compare)
			expected := map[string]any{}
			for k, v := range value {
				if k != "createdAt" {
					expected[k] = v
				}
			}
			b, _ := json.Marshal(expected)
			if string(a) != string(b) {
				return result, errors.New("The existing Bluesky record differs from this preview")
			}
		}
		if record.URI == "" || record.CID == "" {
			return result, errors.New("Invalid Bluesky publication response")
		}
		refs[p.ID] = record
		if p.Parent == "" {
			root = record
		}
		roots[p.ID] = root
		result.URLs = append(result.URLs, "https://bsky.app/profile/"+did+"/post/"+key)
	}
	return result, nil
}

var blueskyLinks = regexp.MustCompile(`https?://[^\s<>()]+`)

func linkFacets(text string) []any {
	facets := []any{}
	for _, match := range blueskyLinks.FindAllStringIndex(text, -1) {
		uri := strings.TrimRight(text[match[0]:match[1]], ".,!?;:、。！？]}")
		parsed, err := url.Parse(uri)
		if err != nil || parsed.Host == "" {
			continue
		}
		facets = append(facets, map[string]any{"index": map[string]int{"byteStart": match[0], "byteEnd": match[0] + len(uri)}, "features": []any{map[string]string{"$type": "app.bsky.richtext.facet#link", "uri": uri}}})
	}
	return facets
}
