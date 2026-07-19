package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	pdfsplit "github.com/takeshy/minipdfsplit"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	defaultGeminiEmbeddingModel = "gemini-embedding-2-preview"
	geminiEmbeddingBaseURL      = "https://generativelanguage.googleapis.com/v1beta/models"
	embeddingBatchSize          = 32
	maxChangedFilesPerSync      = 50
)

var ragHTTPClient = &http.Client{Timeout: 3 * time.Minute}

type RAGSetting struct {
	EmbeddingProvider    string   `json:"embeddingProvider"`
	EmbeddingBaseURL     string   `json:"embeddingBaseUrl"`
	EmbeddingAPIKey      string   `json:"embeddingApiKey"`
	EmbeddingModel       string   `json:"embeddingModel"`
	ChunkSize            int      `json:"chunkSize"`
	ChunkOverlap         int      `json:"chunkOverlap"`
	PDFChunkPages        int      `json:"pdfChunkPages"`
	TopK                 int      `json:"topK"`
	ScoreThreshold       float64  `json:"scoreThreshold"`
	TargetFolders        []string `json:"targetFolders"`
	ExcludePatterns      []string `json:"excludePatterns"`
	SearchFileExtensions []string `json:"searchFileExtensions"`
	LastFullSync         *int64   `json:"lastFullSync"`
	ExternalIndexPath    string   `json:"externalIndexPath"`
	SourceRAGSettings    []string `json:"sourceRagSettings"`
	IndexMultimodal      bool     `json:"indexMultimodal"`
	VertexProjectID      string   `json:"vertexProjectId"`
	VertexLocation       string   `json:"vertexLocation"`
	VertexAccessToken    string   `json:"-"`
}

type RAGSyncRequest struct {
	Name    string     `json:"name"`
	Setting RAGSetting `json:"setting"`
}

type RAGSearchRequest struct {
	Name    string     `json:"name"`
	Query   string     `json:"query"`
	Setting RAGSetting `json:"setting"`
}

type RAGAdjacentRequest struct {
	Name       string `json:"name"`
	FilePath   string `json:"filePath"`
	ChunkIndex int    `json:"chunkIndex"`
	Before     int    `json:"before"`
	After      int    `json:"after"`
}

type RAGChunkMeta struct {
	FilePath    string `json:"filePath"`
	ChunkIndex  int    `json:"chunkIndex"`
	Text        string `json:"text"`
	ContentType string `json:"contentType,omitempty"`
	PageLabel   string `json:"pageLabel,omitempty"`
}

type RAGIndex struct {
	Meta              []RAGChunkMeta    `json:"meta"`
	Dimension         int               `json:"dimension"`
	FileChecksums     map[string]string `json:"fileChecksums"`
	EmbeddingModel    string            `json:"embeddingModel"`
	ChunkSize         int               `json:"chunkSize"`
	ChunkOverlap      int               `json:"chunkOverlap"`
	PDFChunkPages     int               `json:"pdfChunkPages,omitempty"`
	IndexMultimodal   bool              `json:"indexMultimodal,omitempty"`
	EmbeddingProvider string            `json:"embeddingProvider,omitempty"`
	EmbeddingBaseURL  string            `json:"embeddingBaseUrl,omitempty"`
	VertexProjectID   string            `json:"vertexProjectId,omitempty"`
	VertexLocation    string            `json:"vertexLocation,omitempty"`
}

type RAGSyncResult struct {
	Embedded      int      `json:"embedded"`
	Skipped       int      `json:"skipped"`
	Removed       int      `json:"removed"`
	DeferredFiles int      `json:"deferredFiles"`
	ChunkCount    int      `json:"chunkCount"`
	FileCount     int      `json:"fileCount"`
	Errors        []string `json:"errors"`
}

type RAGSyncProgress struct {
	Name      string `json:"name"`
	Processed int    `json:"processed"`
	Total     int    `json:"total"`
	FilePath  string `json:"filePath,omitempty"`
}

func (a *App) emitRAGSyncProgress(progress RAGSyncProgress) {
	if a.ctx != nil {
		wailsruntime.EventsEmit(a.ctx, "rag:sync-progress", progress)
	}
}

type RAGSearchResult struct {
	FilePath    string  `json:"filePath"`
	Text        string  `json:"text"`
	Score       float64 `json:"score"`
	ChunkIndex  int     `json:"chunkIndex"`
	ContentType string  `json:"contentType,omitempty"`
	PageLabel   string  `json:"pageLabel,omitempty"`
}

type RAGStatus struct {
	ChunkCount     int    `json:"chunkCount"`
	FileCount      int    `json:"fileCount"`
	Dimension      int    `json:"dimension"`
	EmbeddingModel string `json:"embeddingModel"`
}

type RAGIndexedFile struct {
	FilePath string `json:"filePath"`
	Chunks   int    `json:"chunks"`
}

type ragFile struct {
	path        string
	absolute    string
	content     string
	data        []byte
	pdfPages    [][]byte
	mimeType    string
	contentType string
	extractErr  error
	checksum    string
}

func normalizeRAGSetting(setting RAGSetting) RAGSetting {
	if setting.EmbeddingProvider == "" {
		if strings.TrimSpace(setting.EmbeddingBaseURL) != "" {
			setting.EmbeddingProvider = "openai"
		} else {
			setting.EmbeddingProvider = "gemini"
		}
	}
	if setting.ChunkSize <= 0 {
		setting.ChunkSize = 500
	}
	if setting.ChunkOverlap < 0 {
		setting.ChunkOverlap = 100
	}
	if setting.PDFChunkPages < 1 || setting.PDFChunkPages > 6 {
		setting.PDFChunkPages = 6
	}
	if setting.TopK <= 0 || setting.TopK > 20 {
		setting.TopK = 5
	}
	if setting.ScoreThreshold < 0 || setting.ScoreThreshold > 1 {
		setting.ScoreThreshold = 0.3
	}
	if setting.VertexLocation == "" {
		setting.VertexLocation = "us"
	}
	if strings.TrimSpace(setting.EmbeddingModel) == "" {
		if setting.EmbeddingProvider == "vertex" {
			setting.EmbeddingModel = "gemini-embedding-2"
		} else if setting.EmbeddingProvider == "gemini" {
			setting.EmbeddingModel = defaultGeminiEmbeddingModel
		}
	}
	return setting
}

func (a *App) SyncRAG(request RAGSyncRequest) (*RAGSyncResult, error) {
	a.ragMu.Lock()
	defer a.ragMu.Unlock()
	a.ragCancelMu.Lock()
	a.ragCancelled[request.Name] = false
	a.ragCancelMu.Unlock()
	setting := normalizeRAGSetting(request.Setting)
	if setting.EmbeddingProvider == "vertex" {
		token, err := a.vertexOAuthAccessToken()
		if err != nil {
			return nil, err
		}
		setting.VertexAccessToken = token
	} else if strings.TrimSpace(setting.EmbeddingAPIKey) == "" {
		return nil, fmt.Errorf("embedding API key is required")
	}
	files, err := a.ragFiles(setting)
	if err != nil {
		return nil, err
	}
	index, vectors, _ := a.loadRAG(request.Name)
	if index == nil || index.EmbeddingModel != setting.EmbeddingModel || index.EmbeddingProvider != setting.EmbeddingProvider || index.EmbeddingBaseURL != setting.EmbeddingBaseURL || index.VertexProjectID != setting.VertexProjectID || index.VertexLocation != setting.VertexLocation || index.ChunkSize != setting.ChunkSize || index.ChunkOverlap != setting.ChunkOverlap || index.PDFChunkPages != setting.PDFChunkPages || index.IndexMultimodal != setting.IndexMultimodal {
		index = &RAGIndex{Meta: []RAGChunkMeta{}, FileChecksums: map[string]string{}}
		vectors = nil
	}
	currentPaths := make(map[string]bool, len(files))
	changed := make([]ragFile, 0)
	kept := make(map[string]bool)
	for _, file := range files {
		currentPaths[file.path] = true
		if index.FileChecksums[file.path] == file.checksum {
			kept[file.path] = true
		} else {
			changed = append(changed, file)
		}
	}
	deferred := 0
	if len(changed) > maxChangedFilesPerSync {
		deferred = len(changed) - maxChangedFilesPerSync
		for _, file := range changed[maxChangedFilesPerSync:] {
			if index.FileChecksums[file.path] != "" {
				kept[file.path] = true
			}
		}
		changed = changed[:maxChangedFilesPerSync]
	}
	changedPaths := make(map[string]bool, len(changed))
	for _, file := range changed {
		changedPaths[file.path] = true
	}
	removed := 0
	for path := range index.FileChecksums {
		if !currentPaths[path] || changedPaths[path] {
			removed++
		}
	}
	keptMeta := make([]RAGChunkMeta, 0)
	keptVectors := make([]float32, 0)
	if index.Dimension > 0 {
		for i, meta := range index.Meta {
			if !kept[meta.FilePath] {
				continue
			}
			start := i * index.Dimension
			end := start + index.Dimension
			if end <= len(vectors) {
				keptMeta = append(keptMeta, meta)
				keptVectors = append(keptVectors, vectors[start:end]...)
			}
		}
	}
	newMeta := make([]RAGChunkMeta, 0)
	newVectors := make([]float32, 0)
	newChecksums := make(map[string]string)
	for path := range kept {
		newChecksums[path] = index.FileChecksums[path]
	}
	result := &RAGSyncResult{Skipped: len(kept), Removed: removed, DeferredFiles: deferred, Errors: []string{}}
	dimension := index.Dimension
	a.emitRAGSyncProgress(RAGSyncProgress{Name: request.Name, Total: len(changed)})
	for fileIndex, file := range changed {
		if a.ragSyncCancelled(request.Name) {
			return nil, fmt.Errorf("RAG sync cancelled")
		}
		a.emitRAGSyncProgress(RAGSyncProgress{Name: request.Name, Processed: fileIndex + 1, Total: len(changed), FilePath: file.path})
		if file.extractErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", file.path, file.extractErr))
			newChecksums[file.path] = file.checksum
			continue
		}
		if file.contentType == "pdf" && len(file.pdfPages) > 0 {
			embeddedPages := 0
			for pageIndex, pagePDF := range file.pdfPages {
				if a.ragSyncCancelled(request.Name) {
					return nil, fmt.Errorf("RAG sync cancelled")
				}
				embedding, embedErr := generateRAGBinaryEmbedding(pagePDF, "application/pdf", setting, dimension)
				if embedErr != nil {
					result.Errors = append(result.Errors, fmt.Sprintf("%s page %d: %v", file.path, pageIndex+1, embedErr))
					continue
				}
				if len(embedding) == 0 || dimension != 0 && len(embedding) != dimension {
					result.Errors = append(result.Errors, fmt.Sprintf("%s page %d: embedding dimension changed", file.path, pageIndex+1))
					continue
				}
				if dimension == 0 {
					dimension = len(embedding)
				}
				pageLabel := fmt.Sprintf("page %d of %d", pageIndex+1, len(file.pdfPages))
				label := fmt.Sprintf("[Pdf: %s (%s)]", filepath.Base(file.path), pageLabel)
				newMeta = append(newMeta, RAGChunkMeta{FilePath: file.path, ChunkIndex: pageIndex, Text: label, ContentType: "pdf", PageLabel: pageLabel})
				for _, value := range embedding {
					newVectors = append(newVectors, float32(value))
				}
				embeddedPages++
			}
			if embeddedPages > 0 {
				newChecksums[file.path] = file.checksum
				result.Embedded++
			}
			continue
		}
		if file.mimeType != "" {
			embedding, embedErr := generateRAGBinaryEmbedding(file.data, file.mimeType, setting, dimension)
			if embedErr != nil {
				result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", file.path, embedErr))
				continue
			}
			if len(embedding) == 0 || dimension != 0 && len(embedding) != dimension {
				result.Errors = append(result.Errors, fmt.Sprintf("%s: embedding dimension changed", file.path))
				continue
			}
			if dimension == 0 {
				dimension = len(embedding)
			}
			label := fmt.Sprintf("[%s: %s]", strings.ToUpper(file.contentType[:1])+file.contentType[1:], filepath.Base(file.path))
			newMeta = append(newMeta, RAGChunkMeta{FilePath: file.path, ChunkIndex: 0, Text: label, ContentType: file.contentType})
			for _, value := range embedding {
				newVectors = append(newVectors, float32(value))
			}
			newChecksums[file.path] = file.checksum
			result.Embedded++
			continue
		}
		chunks := chunkRAGText(file.content, setting.ChunkSize, setting.ChunkOverlap)
		if len(chunks) == 0 {
			continue
		}
		embeddings, embedErr := generateRAGEmbeddings(chunks, setting, 0)
		if embedErr != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %v", file.path, embedErr))
			continue
		}
		if len(embeddings) != len(chunks) || len(embeddings) == 0 || len(embeddings[0]) == 0 {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: embedding response count mismatch", file.path))
			continue
		}
		if dimension == 0 {
			dimension = len(embeddings[0])
		}
		valid := true
		for _, embedding := range embeddings {
			if len(embedding) != dimension {
				valid = false
				break
			}
		}
		if !valid {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: embedding dimension changed", file.path))
			continue
		}
		for i, chunk := range chunks {
			contentType := file.contentType
			if contentType == "" {
				contentType = "text"
			}
			newMeta = append(newMeta, RAGChunkMeta{FilePath: file.path, ChunkIndex: i, Text: chunk, ContentType: contentType})
			for _, value := range embeddings[i] {
				newVectors = append(newVectors, float32(value))
			}
		}
		newChecksums[file.path] = file.checksum
		result.Embedded++
	}
	index = &RAGIndex{
		Meta: append(keptMeta, newMeta...), Dimension: dimension,
		FileChecksums: newChecksums, EmbeddingModel: setting.EmbeddingModel,
		ChunkSize: setting.ChunkSize, ChunkOverlap: setting.ChunkOverlap,
		PDFChunkPages: setting.PDFChunkPages, IndexMultimodal: setting.IndexMultimodal,
		EmbeddingProvider: setting.EmbeddingProvider, EmbeddingBaseURL: setting.EmbeddingBaseURL,
		VertexProjectID: setting.VertexProjectID, VertexLocation: setting.VertexLocation,
	}
	vectors = append(keptVectors, newVectors...)
	if err := a.saveRAG(request.Name, index, vectors); err != nil {
		return nil, err
	}
	result.ChunkCount = len(index.Meta)
	result.FileCount = len(index.FileChecksums)
	return result, nil
}

func (a *App) ragSyncCancelled(name string) bool {
	a.ragCancelMu.Lock()
	defer a.ragCancelMu.Unlock()
	return a.ragCancelled[name]
}

func (a *App) CancelRAGSync(name string) bool {
	a.ragCancelMu.Lock()
	a.ragCancelled[name] = true
	a.ragCancelMu.Unlock()
	return true
}

func (a *App) GetRAGIndexedFiles(name string) ([]RAGIndexedFile, error) {
	index, _, err := a.loadRAG(name)
	if err != nil || index == nil {
		return []RAGIndexedFile{}, err
	}
	counts := make(map[string]int, len(index.FileChecksums))
	for path := range index.FileChecksums {
		counts[path] = 0
	}
	for _, meta := range index.Meta {
		counts[meta.FilePath]++
	}
	files := make([]RAGIndexedFile, 0, len(counts))
	for path, chunks := range counts {
		files = append(files, RAGIndexedFile{FilePath: path, Chunks: chunks})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].FilePath < files[j].FilePath })
	return files, nil
}

func (a *App) SearchRAG(request RAGSearchRequest) ([]RAGSearchResult, error) {
	a.ragMu.Lock()
	defer a.ragMu.Unlock()
	setting := normalizeRAGSetting(request.Setting)
	if setting.EmbeddingProvider == "vertex" {
		token, err := a.vertexOAuthAccessToken()
		if err != nil {
			return nil, err
		}
		setting.VertexAccessToken = token
	} else if strings.TrimSpace(setting.EmbeddingAPIKey) == "" {
		return nil, fmt.Errorf("embedding API key is required")
	}
	index, vectors, err := a.loadRAG(request.Name)
	if err != nil || index == nil || index.Dimension == 0 || len(index.Meta) == 0 {
		return []RAGSearchResult{}, err
	}
	setting.EmbeddingModel = index.EmbeddingModel
	embeddings, err := generateRAGEmbeddings([]string{request.Query}, setting, index.Dimension)
	if err != nil {
		return nil, err
	}
	if len(embeddings) == 0 || len(embeddings[0]) != index.Dimension {
		return nil, fmt.Errorf("query embedding dimension does not match the index")
	}
	extensions := make(map[string]bool)
	for _, extension := range setting.SearchFileExtensions {
		extensions[strings.ToLower(strings.TrimPrefix(extension, "."))] = true
	}
	results := make([]RAGSearchResult, 0, len(index.Meta))
	for i, meta := range index.Meta {
		if len(extensions) > 0 && !extensions[strings.ToLower(strings.TrimPrefix(filepath.Ext(meta.FilePath), "."))] {
			continue
		}
		start := i * index.Dimension
		end := start + index.Dimension
		if end > len(vectors) {
			break
		}
		score := cosineRAGSimilarity(embeddings[0], vectors[start:end])
		if score > setting.ScoreThreshold {
			results = append(results, RAGSearchResult{FilePath: meta.FilePath, Text: meta.Text, Score: score, ChunkIndex: meta.ChunkIndex, ContentType: meta.ContentType, PageLabel: meta.PageLabel})
		}
	}
	sort.SliceStable(results, func(i, j int) bool { return results[i].Score > results[j].Score })
	if len(results) > setting.TopK {
		results = results[:setting.TopK]
	}
	return results, nil
}

func (a *App) GetAdjacentRAGChunks(request RAGAdjacentRequest) ([]RAGSearchResult, error) {
	a.ragMu.Lock()
	defer a.ragMu.Unlock()
	index, _, err := a.loadRAG(request.Name)
	if err != nil || index == nil {
		return []RAGSearchResult{}, err
	}
	before := max(0, min(request.Before, 30))
	after := max(0, min(request.After, 30))
	results := make([]RAGSearchResult, 0, before+after)
	for _, meta := range index.Meta {
		if meta.FilePath != request.FilePath || meta.ChunkIndex == request.ChunkIndex {
			continue
		}
		if meta.ChunkIndex >= request.ChunkIndex-before && meta.ChunkIndex < request.ChunkIndex || meta.ChunkIndex > request.ChunkIndex && meta.ChunkIndex <= request.ChunkIndex+after {
			results = append(results, RAGSearchResult{FilePath: meta.FilePath, Text: meta.Text, ChunkIndex: meta.ChunkIndex, ContentType: meta.ContentType, PageLabel: meta.PageLabel})
		}
	}
	sort.SliceStable(results, func(i, j int) bool { return results[i].ChunkIndex < results[j].ChunkIndex })
	return results, nil
}

func (a *App) GetRAGStatus(name string) (*RAGStatus, error) {
	index, _, err := a.loadRAG(name)
	if err != nil || index == nil {
		return &RAGStatus{}, err
	}
	return &RAGStatus{ChunkCount: len(index.Meta), FileCount: len(index.FileChecksums), Dimension: index.Dimension, EmbeddingModel: index.EmbeddingModel}, nil
}

func (a *App) DeleteRAGIndex(name string) error {
	directory, err := a.ragDirectory(name, false)
	if err != nil {
		return err
	}
	if err := os.RemoveAll(directory); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (a *App) RenameRAGIndex(oldName, newName string) error {
	oldDirectory, err := a.ragDirectory(oldName, false)
	if err != nil {
		return err
	}
	newDirectory, err := a.ragDirectory(newName, false)
	if err != nil {
		return err
	}
	if oldDirectory == newDirectory {
		return nil
	}
	if _, err := os.Stat(newDirectory); err == nil {
		return fmt.Errorf("RAG setting already exists: %s", newName)
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(oldDirectory, newDirectory); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (a *App) ragFiles(setting RAGSetting) ([]ragFile, error) {
	base := a.GetWorkspacePath()
	if base == "" {
		return []ragFile{}, nil
	}
	patterns := make([]*regexp.Regexp, 0, len(setting.ExcludePatterns))
	for _, pattern := range setting.ExcludePatterns {
		if compiled, err := regexp.Compile(pattern); err == nil {
			patterns = append(patterns, compiled)
		}
	}
	files := make([]ragFile, 0)
	err := filepath.WalkDir(base, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path != base && (entry.Name() == ".git" || entry.Name() == ".llm-hub" || entry.Name() == "node_modules") {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		extension := strings.ToLower(strings.TrimPrefix(filepath.Ext(entry.Name()), "."))
		geminiMultimodal := (setting.EmbeddingProvider == "gemini" || setting.EmbeddingProvider == "vertex") && strings.Contains(strings.ToLower(setting.EmbeddingModel), "gemini-embedding-2")
		mimeTypes := map[string]string{"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "pdf": "application/pdf", "mp3": "audio/mpeg", "wav": "audio/wav", "mp4": "video/mp4", "mpeg": "video/mpeg"}
		if extension != "md" && extension != "txt" && extension != "pdf" && !(geminiMultimodal && mimeTypes[extension] != "") {
			return nil
		}
		relative, _ := filepath.Rel(base, path)
		relative = filepath.ToSlash(relative)
		if !ragPathIncluded(relative, setting.TargetFolders, patterns) {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		sum := sha256.Sum256(data)
		file := ragFile{path: relative, absolute: path, checksum: hex.EncodeToString(sum[:]), contentType: "text"}
		if geminiMultimodal && extension == "pdf" {
			file.data = data
			file.mimeType = mimeTypes[extension]
			file.contentType = "pdf"
			file.pdfPages, file.extractErr = pdfsplit.SplitBytes(data)
		} else if geminiMultimodal && mimeTypes[extension] != "" {
			file.data = data
			file.mimeType = mimeTypes[extension]
			file.contentType = ragContentType(extension)
		} else if extension == "pdf" {
			file.contentType = "pdf"
			file.content, file.extractErr = extractRAGPDFText(path)
		} else {
			file.content = string(data)
		}
		files = append(files, file)
		return nil
	})
	return files, err
}

func ragContentType(extension string) string {
	switch extension {
	case "png", "jpg", "jpeg":
		return "image"
	case "mp3", "wav":
		return "audio"
	case "mp4", "mpeg":
		return "video"
	case "pdf":
		return "pdf"
	default:
		return "text"
	}
}

func extractRAGPDFText(path string) (string, error) {
	pages, err := pdfsplit.ExtractTextFile(path)
	if err != nil {
		return "", fmt.Errorf("extract PDF text: %w", err)
	}
	texts := make([]string, 0, len(pages))
	for _, page := range pages {
		if value := strings.TrimSpace(page.Text); value != "" {
			texts = append(texts, value)
		}
	}
	if len(texts) == 0 {
		return "", fmt.Errorf("PDF contains no extractable text")
	}
	return strings.Join(texts, "\n\n"), nil
}

func (a *App) ExtractWorkspacePDFText(path, pageLabel string) (string, error) {
	target, err := a.workspacePath(path, false)
	if err != nil {
		return "", err
	}
	if strings.ToLower(filepath.Ext(target)) != ".pdf" {
		return "", fmt.Errorf("file is not a PDF")
	}
	pages, err := pdfsplit.ExtractTextFile(target)
	if err != nil {
		return "", fmt.Errorf("extract PDF text: %w", err)
	}
	if pageNumber := ragPDFPageNumber(pageLabel); pageNumber > 0 && pageNumber <= len(pages) {
		return pages[pageNumber-1].Text, nil
	}
	texts := make([]string, 0, len(pages))
	for _, page := range pages {
		if text := strings.TrimSpace(page.Text); text != "" {
			texts = append(texts, text)
		}
	}
	return strings.Join(texts, "\n\n"), nil
}

func (a *App) ReadWorkspacePDFPages(path, pageLabel string) (*LocalFileResult, error) {
	target, err := a.workspacePath(path, false)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}
	pageNumber := ragPDFPageNumber(pageLabel)
	if pageNumber <= 0 {
		return readLocalFile(target)
	}
	pages, err := pdfsplit.SplitBytes(data)
	if err != nil {
		return nil, fmt.Errorf("split PDF pages: %w", err)
	}
	if pageNumber > len(pages) {
		return nil, fmt.Errorf("PDF page %d is out of range", pageNumber)
	}
	fileName := fmt.Sprintf("%s-page-%d.pdf", strings.TrimSuffix(filepath.Base(target), filepath.Ext(target)), pageNumber)
	return &LocalFileResult{Path: target, FileName: fileName, Content: "data:application/pdf;base64," + base64.StdEncoding.EncodeToString(pages[pageNumber-1])}, nil
}

func ragPDFPageNumber(pageLabel string) int {
	match := regexp.MustCompile(`(?i)^page(?:s)?\s+(\d+)`).FindStringSubmatch(strings.TrimSpace(pageLabel))
	if len(match) != 2 {
		return 0
	}
	page, _ := strconv.Atoi(match[1])
	return page
}

func ragPathIncluded(path string, folders []string, patterns []*regexp.Regexp) bool {
	if len(folders) > 0 {
		included := false
		for _, folder := range folders {
			folder = strings.TrimSuffix(filepath.ToSlash(strings.TrimSpace(folder)), "/")
			if path == folder || strings.HasPrefix(path, folder+"/") {
				included = true
				break
			}
		}
		if !included {
			return false
		}
	}
	for _, pattern := range patterns {
		if pattern.MatchString(path) {
			return false
		}
	}
	return true
}

func chunkRAGText(text string, chunkSize, chunkOverlap int) []string {
	runes := []rune(text)
	if strings.TrimSpace(text) == "" || chunkSize <= 0 {
		return []string{}
	}
	overlap := min(chunkOverlap, chunkSize-1)
	chunks := make([]string, 0)
	for start := 0; start < len(runes); {
		end := min(start+chunkSize, len(runes))
		if end < len(runes) {
			window := string(runes[start:end])
			if position := strings.LastIndex(window, "\n\n"); position > len([]rune(window))/2 {
				end = start + len([]rune(window[:position+2]))
			} else if position := strings.LastIndex(window, ". "); position > len([]rune(window))/2 {
				end = start + len([]rune(window[:position+2]))
			}
		}
		chunk := strings.TrimSpace(string(runes[start:end]))
		if chunk != "" {
			chunks = append(chunks, chunk)
		}
		next := end - overlap
		if next <= start {
			start = end
		} else {
			start = next
		}
	}
	return chunks
}

func cosineRAGSimilarity(a []float64, b []float32) float64 {
	if len(a) != len(b) {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		valueB := float64(b[i])
		dot += a[i] * valueB
		normA += a[i] * a[i]
		normB += valueB * valueB
	}
	denominator := math.Sqrt(normA) * math.Sqrt(normB)
	if denominator == 0 {
		return 0
	}
	return dot / denominator
}

func generateRAGEmbeddings(texts []string, setting RAGSetting, outputDimension int) ([][]float64, error) {
	if setting.EmbeddingProvider == "vertex" {
		return generateVertexRAGEmbeddings(texts, setting, outputDimension)
	}
	if setting.EmbeddingProvider == "gemini" {
		return generateGeminiRAGEmbeddings(texts, setting, outputDimension)
	}
	if strings.TrimSpace(setting.EmbeddingBaseURL) == "" {
		return nil, fmt.Errorf("embedding base URL is required for OpenAI-compatible provider")
	}
	base := strings.TrimRight(setting.EmbeddingBaseURL, "/")
	base = strings.TrimSuffix(base, "/v1")
	endpoint := base + "/v1/embeddings"
	results := make([][]float64, 0, len(texts))
	for start := 0; start < len(texts); start += embeddingBatchSize {
		end := min(start+embeddingBatchSize, len(texts))
		body, _ := json.Marshal(map[string]any{"model": setting.EmbeddingModel, "input": texts[start:end]})
		request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Authorization", "Bearer "+setting.EmbeddingAPIKey)
		response, err := ragHTTPClient.Do(request)
		if err != nil {
			return nil, err
		}
		responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 32*1024*1024))
		response.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, fmt.Errorf("embedding API error %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
		}
		var decoded struct {
			Data []struct {
				Embedding []float64 `json:"embedding"`
				Index     int       `json:"index"`
			} `json:"data"`
		}
		if err := json.Unmarshal(responseBody, &decoded); err != nil {
			return nil, err
		}
		sort.SliceStable(decoded.Data, func(i, j int) bool { return decoded.Data[i].Index < decoded.Data[j].Index })
		for _, item := range decoded.Data {
			results = append(results, item.Embedding)
		}
	}
	return results, nil
}

func generateRAGBinaryEmbedding(data []byte, mimeType string, setting RAGSetting, outputDimension int) ([]float64, error) {
	if setting.EmbeddingProvider != "gemini" && setting.EmbeddingProvider != "vertex" {
		return nil, fmt.Errorf("binary embedding requires Gemini Embedding 2")
	}
	model := strings.TrimPrefix(setting.EmbeddingModel, "models/")
	var endpoint string
	if setting.EmbeddingProvider == "vertex" {
		endpoint = vertexRAGEndpoint(strings.TrimSpace(setting.VertexProjectID), strings.TrimSpace(setting.VertexLocation), model)
	} else {
		endpoint = fmt.Sprintf("%s/%s:embedContent", geminiEmbeddingBaseURL, model)
	}
	bodyValue := map[string]any{
		"content": map[string]any{"parts": []map[string]any{{
			"inlineData": map[string]string{"mimeType": mimeType, "data": base64.StdEncoding.EncodeToString(data)},
		}}},
	}
	if outputDimension > 0 {
		bodyValue["output_dimensionality"] = outputDimension
	}
	body, _ := json.Marshal(bodyValue)
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	if setting.EmbeddingProvider == "vertex" {
		request.Header.Set("Authorization", "Bearer "+setting.VertexAccessToken)
	} else {
		request.Header.Set("x-goog-api-key", setting.EmbeddingAPIKey)
	}
	response, err := ragHTTPClient.Do(request)
	if err != nil {
		return nil, err
	}
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 256*1024*1024))
	response.Body.Close()
	if readErr != nil {
		return nil, readErr
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("embedding API error %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	var decoded struct {
		Embedding struct {
			Values []float64 `json:"values"`
		} `json:"embedding"`
		Embeddings []struct {
			Values []float64 `json:"values"`
		} `json:"embeddings"`
	}
	if err := json.Unmarshal(responseBody, &decoded); err != nil {
		return nil, err
	}
	values := decoded.Embedding.Values
	if len(values) == 0 && len(decoded.Embeddings) > 0 {
		values = decoded.Embeddings[0].Values
	}
	if len(values) == 0 {
		return nil, fmt.Errorf("embedding API returned an empty embedding")
	}
	return values, nil
}

func generateVertexRAGEmbeddings(texts []string, setting RAGSetting, outputDimension int) ([][]float64, error) {
	projectID := strings.TrimSpace(setting.VertexProjectID)
	location := strings.TrimSpace(setting.VertexLocation)
	if !regexp.MustCompile(`^[a-z][a-z0-9-]{4,62}$`).MatchString(projectID) {
		return nil, fmt.Errorf("valid Vertex AI project ID is required (use the project ID, not project number)")
	}
	if !regexp.MustCompile(`^[a-z0-9-]+$`).MatchString(location) {
		return nil, fmt.Errorf("valid Vertex AI location is required")
	}
	model := strings.TrimPrefix(setting.EmbeddingModel, "models/")
	endpoint := vertexRAGEndpoint(projectID, location, model)
	results := make([][]float64, 0, len(texts))
	for _, text := range texts {
		bodyValue := map[string]any{"content": map[string]any{"parts": []map[string]string{{"text": text}}}}
		if outputDimension > 0 {
			bodyValue["output_dimensionality"] = outputDimension
		}
		body, _ := json.Marshal(bodyValue)
		request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Authorization", "Bearer "+setting.VertexAccessToken)
		response, err := ragHTTPClient.Do(request)
		if err != nil {
			return nil, err
		}
		responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 32*1024*1024))
		response.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, fmt.Errorf("Vertex AI embedding error %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
		}
		var decoded struct {
			Embedding struct {
				Values []float64 `json:"values"`
			} `json:"embedding"`
			Embeddings []struct {
				Values []float64 `json:"values"`
			} `json:"embeddings"`
		}
		if err := json.Unmarshal(responseBody, &decoded); err != nil {
			return nil, err
		}
		values := decoded.Embedding.Values
		if len(values) == 0 && len(decoded.Embeddings) > 0 {
			values = decoded.Embeddings[0].Values
		}
		if len(values) == 0 {
			return nil, fmt.Errorf("Vertex AI returned an empty embedding")
		}
		results = append(results, values)
	}
	return results, nil
}

func vertexRAGEndpoint(projectID, location, model string) string {
	host := "aiplatform." + location + ".rep.googleapis.com"
	if location == "global" {
		host = "aiplatform.googleapis.com"
	}
	return fmt.Sprintf("https://%s/v1/projects/%s/locations/%s/publishers/google/models/%s:embedContent", host, projectID, location, model)
}

func generateGeminiRAGEmbeddings(texts []string, setting RAGSetting, outputDimension int) ([][]float64, error) {
	model := strings.TrimPrefix(setting.EmbeddingModel, "models/")
	endpoint := fmt.Sprintf("%s/%s:embedContent", geminiEmbeddingBaseURL, model)
	results := make([][]float64, 0, len(texts))
	for _, text := range texts {
		bodyValue := map[string]any{"content": map[string]any{"parts": []map[string]string{{"text": text}}}}
		if outputDimension > 0 {
			bodyValue["output_dimensionality"] = outputDimension
		}
		body, _ := json.Marshal(bodyValue)
		request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("x-goog-api-key", setting.EmbeddingAPIKey)
		response, err := ragHTTPClient.Do(request)
		if err != nil {
			return nil, err
		}
		responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 32*1024*1024))
		response.Body.Close()
		if readErr != nil {
			return nil, readErr
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, fmt.Errorf("embedding API error %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
		}
		var decoded struct {
			Embedding struct {
				Values []float64 `json:"values"`
			} `json:"embedding"`
		}
		if err := json.Unmarshal(responseBody, &decoded); err != nil {
			return nil, err
		}
		results = append(results, decoded.Embedding.Values)
	}
	return results, nil
}

func (a *App) ragDirectory(name string, create bool) (string, error) {
	name = regexp.MustCompile(`[^a-zA-Z0-9._-]`).ReplaceAllString(name, "_")
	if name == "" {
		return "", fmt.Errorf("RAG setting name is required")
	}
	directory, err := a.directoryPath(filepath.ToSlash(filepath.Join(".llm-hub", "rag", name)), true)
	if err != nil {
		return "", err
	}
	if create {
		err = os.MkdirAll(directory, 0o755)
	}
	return directory, err
}

func (a *App) loadRAG(name string) (*RAGIndex, []float32, error) {
	directory, err := a.ragDirectory(name, false)
	if err != nil {
		return nil, nil, err
	}
	data, err := os.ReadFile(filepath.Join(directory, "index.json"))
	if os.IsNotExist(err) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}
	var index RAGIndex
	if err := json.Unmarshal(data, &index); err != nil {
		return nil, nil, err
	}
	vectorData, err := os.ReadFile(filepath.Join(directory, "vectors.bin"))
	if err != nil {
		return nil, nil, err
	}
	vectors := make([]float32, len(vectorData)/4)
	if err := binary.Read(bytes.NewReader(vectorData), binary.LittleEndian, &vectors); err != nil {
		return nil, nil, err
	}
	return &index, vectors, nil
}

func (a *App) saveRAG(name string, index *RAGIndex, vectors []float32) error {
	directory, err := a.ragDirectory(name, true)
	if err != nil {
		return err
	}
	indexData, err := json.Marshal(index)
	if err != nil {
		return err
	}
	var vectorData bytes.Buffer
	if err := binary.Write(&vectorData, binary.LittleEndian, vectors); err != nil {
		return err
	}
	if err := writeAtomic(filepath.Join(directory, "index.json"), indexData); err != nil {
		return err
	}
	return writeAtomic(filepath.Join(directory, "vectors.bin"), vectorData.Bytes())
}

func writeAtomic(path string, data []byte) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".rag-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(data); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	return replaceRAGFile(temporaryPath, path)
}
