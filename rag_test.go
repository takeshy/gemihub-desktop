package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"testing"
)

type ragRoundTripper func(*http.Request) (*http.Response, error)

func (function ragRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestChunkRAGText(t *testing.T) {
	if got := chunkRAGText("", 100, 20); len(got) != 0 {
		t.Fatalf("expected empty chunks, got %#v", got)
	}
	text := strings.Repeat("日本語の文章です。", 30)
	chunks := chunkRAGText(text, 40, 10)
	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks, got %#v", chunks)
	}
	for _, chunk := range chunks {
		if len([]rune(chunk)) > 40 {
			t.Fatalf("chunk exceeds configured size: %d", len([]rune(chunk)))
		}
	}
}

func TestCosineRAGSimilarity(t *testing.T) {
	got := cosineRAGSimilarity([]float64{1, 1}, []float32{1, 0})
	if math.Abs(got-math.Sqrt(0.5)) > 0.00001 {
		t.Fatalf("unexpected similarity: %f", got)
	}
	if cosineRAGSimilarity([]float64{0, 0}, []float32{1, 2}) != 0 {
		t.Fatal("zero vector must return zero")
	}
}

func TestGetAdjacentRAGChunks(t *testing.T) {
	app := NewApp()
	if _, err := app.SetDirectoryBase(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	meta := make([]RAGChunkMeta, 0, 6)
	for index := 0; index < 6; index++ {
		meta = append(meta, RAGChunkMeta{FilePath: "notes/one.md", ChunkIndex: index, Text: fmt.Sprintf("chunk %d", index), ContentType: "text"})
	}
	index := &RAGIndex{Meta: meta, Dimension: 1, FileChecksums: map[string]string{"notes/one.md": "sum"}, EmbeddingModel: "test"}
	if err := app.saveRAG("Adjacent", index, []float32{1, 1, 1, 1, 1, 1}); err != nil {
		t.Fatal(err)
	}
	results, err := app.GetAdjacentRAGChunks(RAGAdjacentRequest{Name: "Adjacent", FilePath: "notes/one.md", ChunkIndex: 3, Before: 2, After: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 4 || results[0].ChunkIndex != 1 || results[1].ChunkIndex != 2 || results[2].ChunkIndex != 4 || results[3].ChunkIndex != 5 {
		t.Fatalf("unexpected adjacent chunks: %#v", results)
	}
}

func TestRAGPathIncluded(t *testing.T) {
	if !ragPathIncluded("notes/test.md", []string{"notes"}, nil) {
		t.Fatal("included folder was rejected")
	}
	if ragPathIncluded("other/test.md", []string{"notes"}, nil) {
		t.Fatal("file outside target folder was included")
	}
}

func TestRAGSyncAndSemanticSearch(t *testing.T) {
	previousClient := ragHTTPClient
	defer func() { ragHTTPClient = previousClient }()
	ragHTTPClient = &http.Client{Transport: ragRoundTripper(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/v1/embeddings" {
			t.Fatalf("unexpected embedding path: %s", request.URL.Path)
		}
		var body struct {
			Input []string `json:"input"`
		}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		data := make([]map[string]any, 0, len(body.Input))
		for index, input := range body.Input {
			lower := strings.ToLower(input)
			embedding := []float64{float64(strings.Count(lower, "apple")), float64(strings.Count(lower, "banana")), 0.1}
			data = append(data, map[string]any{"index": index, "embedding": embedding})
		}
		var encoded bytes.Buffer
		_ = json.NewEncoder(&encoded).Encode(map[string]any{"data": data})
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(bytes.NewReader(encoded.Bytes()))}, nil
	})}

	app := NewApp()
	app.workspaceConfigDir = t.TempDir()
	if err := app.initializeWorkspaces(); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetDirectoryBase(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	if err := app.WriteWorkspaceFile("notes/apple.md", "apple orchard fruit"); err != nil {
		t.Fatal(err)
	}
	if err := app.WriteWorkspaceFile("notes/banana.md", "banana yellow fruit"); err != nil {
		t.Fatal(err)
	}
	if err := app.WriteWorkspaceFile("notes/readme.txt", "apple text document"); err != nil {
		t.Fatal(err)
	}
	setting := RAGSetting{
		EmbeddingBaseURL: "http://embedding.test", EmbeddingAPIKey: "test", EmbeddingModel: "test-embedding",
		ChunkSize: 500, ChunkOverlap: 100, TopK: 5, ScoreThreshold: 0.3,
	}
	syncResult, err := app.SyncRAG(RAGSyncRequest{Name: "Default", Setting: setting})
	if err != nil {
		t.Fatal(err)
	}
	if syncResult.Embedded != 3 || syncResult.FileCount != 3 || syncResult.ChunkCount != 3 {
		t.Fatalf("unexpected sync result: %#v", syncResult)
	}
	indexedFiles, err := app.GetRAGIndexedFiles("Default")
	if err != nil {
		t.Fatal(err)
	}
	if len(indexedFiles) != 3 || indexedFiles[0].Chunks != 1 {
		t.Fatalf("unexpected indexed files: %#v", indexedFiles)
	}
	results, err := app.SearchRAG(RAGSearchRequest{Name: "Default", Query: "apple", Setting: setting})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) == 0 || results[0].FilePath != "notes/apple.md" {
		t.Fatalf("unexpected search results: %#v", results)
	}
	secondSync, err := app.SyncRAG(RAGSyncRequest{Name: "Default", Setting: setting})
	if err != nil {
		t.Fatal(err)
	}
	if secondSync.Embedded != 0 || secondSync.Skipped != 3 {
		t.Fatalf("incremental sync did not skip unchanged files: %#v", secondSync)
	}
}

func TestCancelRAGSync(t *testing.T) {
	app := NewApp()
	if !app.CancelRAGSync("Default") || !app.ragSyncCancelled("Default") {
		t.Fatal("RAG sync cancellation was not recorded")
	}
}

func TestGeminiBinaryEmbeddingUsesInlineData(t *testing.T) {
	previousClient := ragHTTPClient
	defer func() { ragHTTPClient = previousClient }()
	ragHTTPClient = &http.Client{Transport: ragRoundTripper(func(request *http.Request) (*http.Response, error) {
		var body struct {
			Content struct {
				Parts []struct {
					InlineData struct {
						MIMEType string `json:"mimeType"`
						Data     string `json:"data"`
					} `json:"inlineData"`
				} `json:"parts"`
			} `json:"content"`
		}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if len(body.Content.Parts) != 1 || body.Content.Parts[0].InlineData.MIMEType != "image/png" || body.Content.Parts[0].InlineData.Data != "cG5n" {
			t.Fatalf("unexpected inline data: %#v", body)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"embedding":{"values":[1,2,3]}}`))}, nil
	})}
	result, err := generateRAGBinaryEmbedding([]byte("png"), "image/png", RAGSetting{EmbeddingProvider: "gemini", EmbeddingAPIKey: "key", EmbeddingModel: "gemini-embedding-2-preview"}, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(result) != 3 {
		t.Fatalf("unexpected embedding: %#v", result)
	}
}

func TestGeminiNativeEmbeddingUsesStoredDimensionForQuery(t *testing.T) {
	previousClient := ragHTTPClient
	defer func() { ragHTTPClient = previousClient }()
	called := 0
	ragHTTPClient = &http.Client{Transport: ragRoundTripper(func(request *http.Request) (*http.Response, error) {
		called++
		if !strings.HasSuffix(request.URL.Path, "/gemini-embedding-2-preview:embedContent") {
			t.Fatalf("unexpected Gemini path: %s", request.URL.Path)
		}
		if request.Header.Get("x-goog-api-key") != "gemini-key" {
			t.Fatal("missing Gemini API key header")
		}
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["output_dimensionality"] != float64(3) {
			t.Fatalf("unexpected output dimensionality: %#v", body)
		}
		encoded := `{"embedding":{"values":[1,2,3]}}`
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(encoded))}, nil
	})}
	results, err := generateRAGEmbeddings([]string{"one", "two"}, RAGSetting{EmbeddingProvider: "gemini", EmbeddingAPIKey: "gemini-key", EmbeddingModel: "gemini-embedding-2-preview"}, 3)
	if err != nil {
		t.Fatal(err)
	}
	if called != 2 || len(results) != 2 || len(results[0]) != 3 {
		t.Fatalf("unexpected Gemini results: %#v", results)
	}
}

func TestVertexEmbeddingWithAuthorizationKey(t *testing.T) {
	previousClient := ragHTTPClient
	defer func() { ragHTTPClient = previousClient }()
	ragHTTPClient = &http.Client{Transport: ragRoundTripper(func(request *http.Request) (*http.Response, error) {
		wantHost := "aiplatform.us.rep.googleapis.com"
		if request.URL.Host != wantHost {
			t.Fatalf("host=%q want=%q", request.URL.Host, wantHost)
		}
		wantPath := "/v1/projects/sample-project/locations/us/publishers/google/models/gemini-embedding-2:embedContent"
		if request.URL.Path != wantPath {
			t.Fatalf("path=%q want=%q", request.URL.Path, wantPath)
		}
		if request.Header.Get("Authorization") != "Bearer oauth-token" {
			t.Fatal("missing OAuth bearer token")
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"embeddings":[{"values":[0.1,0.2,0.3]}]}`))}, nil
	})}
	setting := RAGSetting{EmbeddingProvider: "vertex", VertexAccessToken: "oauth-token", EmbeddingModel: "gemini-embedding-2", VertexProjectID: "sample-project", VertexLocation: "us"}
	results, err := generateRAGEmbeddings([]string{"hello"}, setting, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || len(results[0]) != 3 {
		t.Fatalf("unexpected results: %#v", results)
	}
}

func TestVertexGlobalEndpoint(t *testing.T) {
	got := vertexRAGEndpoint("sample-project", "global", "gemini-embedding-2")
	want := "https://aiplatform.googleapis.com/v1/projects/sample-project/locations/global/publishers/google/models/gemini-embedding-2:embedContent"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
