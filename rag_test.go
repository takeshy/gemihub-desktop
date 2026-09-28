package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	pdfsplit "github.com/takeshy/minipdfsplit"
)

func TestFilterRAGResultsWithJev(t *testing.T) {
	results := []RAGSearchResult{
		{FilePath: "travel.md", Text: "The train arrives at 09:10.", Score: 0.8},
		{FilePath: "recipe.md", Text: "Bake bread for 30 minutes.", Score: 0.7},
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer key" {
			t.Fatalf("unexpected authorization: %q", got)
		}
		var body struct {
			Model     string                     `json:"model"`
			Questions map[string]json.RawMessage `json:"questions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Model != openRouterJevModel || len(body.Questions) != 2 {
			t.Fatalf("unexpected request: %#v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"answers":{"result_0":{"type":"choice","choice":"keep"},"result_1":{"type":"choice","choice":"exclude"}}}`))
	}))
	defer server.Close()

	filtered, err := filterRAGResultsWithJev("train arrival", results, "key", true, server.URL)
	if err != nil {
		t.Fatal(err)
	}
	if len(filtered) != 1 || filtered[0].FilePath != "travel.md" {
		t.Fatalf("unexpected filtered results: %#v", filtered)
	}
}

func TestFilterRAGResultsWithJevRejectsMissingDecisions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"answers":{"result_0":{"choice":"keep"}}}`))
	}))
	defer server.Close()
	_, err := filterRAGResultsWithJev("query", []RAGSearchResult{{Text: "one"}, {Text: "two"}}, "key", false, server.URL)
	if err == nil || !strings.Contains(err.Error(), "omitted result_1") {
		t.Fatalf("expected omitted decision error, got %v", err)
	}
}

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

// The note-read node reads a PDF a range at a time: an endPage past the last page is
// clamped so a fixed-size loop needs no page count, and format "pdf" returns an
// excerpt PDF holding just that range.
func TestReadWorkflowPDFPages(t *testing.T) {
	workspace := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspace, "book.pdf"), buildTextPDF(t, "page one", "page two", "page three", "page four"), 0o600); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	app.workspaceState = testWorkspaceState(t, workspace)

	if count, err := app.CountWorkflowPDFPages("book.pdf"); err != nil || count != 4 {
		t.Fatalf("page count = %d, %v; want 4", count, err)
	}

	result, err := app.ReadWorkflowPDFPages("book.pdf", 2, 3, "text")
	if err != nil {
		t.Fatalf("ranged text read failed: %v", err)
	}
	if result.TotalPages != 4 || result.StartPage != 2 || result.EndPage != 3 || result.Data != "" {
		t.Fatalf("unexpected range metadata: %#v", result)
	}
	if result.Text != "[Page 2]\npage two\n\n[Page 3]\npage three" {
		t.Fatalf("unexpected ranged text: %q", result.Text)
	}

	result, err = app.ReadWorkflowPDFPages("book.pdf", 3, 99, "")
	if err != nil || result.EndPage != 4 || !strings.Contains(result.Text, "page four") {
		t.Fatalf("endPage past the last page must be clamped: %#v, %v", result, err)
	}
	result, err = app.ReadWorkflowPDFPages("book.pdf", 0, 0, "text")
	if err != nil || result.StartPage != 1 || result.EndPage != 4 {
		t.Fatalf("an unset range must cover the whole PDF: %#v, %v", result, err)
	}

	result, err = app.ReadWorkflowPDFPages("book.pdf", 2, 3, "pdf")
	if err != nil {
		t.Fatalf("ranged PDF read failed: %v", err)
	}
	if result.FileName != "book (pages 2-3).pdf" || result.Text != "" {
		t.Fatalf("unexpected excerpt metadata: %#v", result)
	}
	excerpt, err := base64.StdEncoding.DecodeString(result.Data)
	if err != nil {
		t.Fatal(err)
	}
	excerptPages, err := pdfsplit.ExtractText(excerpt)
	if err != nil || len(excerptPages) != 2 || !strings.Contains(excerptPages[0].Text, "page two") || !strings.Contains(excerptPages[1].Text, "page three") {
		t.Fatalf("excerpt does not hold pages 2-3 in order: %#v, %v", excerptPages, err)
	}

	for _, tc := range []struct {
		start, end int
		format     string
	}{{5, 0, "text"}, {5, 0, "pdf"}, {3, 2, "text"}, {-1, 0, "text"}, {1, 1, "markdown"}} {
		if _, err := app.ReadWorkflowPDFPages("book.pdf", tc.start, tc.end, tc.format); err == nil {
			t.Fatalf("invalid read %#v was accepted", tc)
		}
	}
}
