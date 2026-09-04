package main

import (
	"encoding/base64"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	pdfsplit "github.com/takeshy/minipdfsplit"
)

// pdfDelivery says how a PDF read by a file tool reaches the model. Providers whose
// request builder has no document part fall back to the extracted text layer, which
// loses layout and scanned pages but is still readable.
type pdfDelivery int

const (
	pdfExtractText pdfDelivery = iota
	pdfAttach
)

// Base64 of a PDF inflates by 4/3 and providers cap a whole request near 32 MB.
const maxNativePdfBytes = 15 * 1024 * 1024

// PdfToolResult is a read_file result whose document reaches the model as a native
// attachment. The payload is unexported so it never lands in the tool result JSON;
// the provider loop lifts it out with toolResultAttachments and sends it separately.
type PdfToolResult struct {
	Path        string `json:"path"`
	FileName    string `json:"fileName"`
	Note        string `json:"note"`
	StartPage   int    `json:"startPage,omitempty"`
	EndPage     int    `json:"endPage,omitempty"`
	attachments []ChatAttachment
}

func (r *PdfToolResult) toolAttachments() []ChatAttachment {
	if r == nil {
		return nil
	}
	return r.attachments
}

// pdfPageRange is the inclusive 1-based page selection a file tool call asked for.
// Zero means "not given": Start defaults to the first page, End to the last.
type pdfPageRange struct {
	Start int
	End   int
}

func (r pdfPageRange) isSet() bool { return r.Start > 0 || r.End > 0 }

// resolve clamps the range to a document of totalPages pages. A start past the end
// is an error since the caller asked for pages that do not exist.
func (r pdfPageRange) resolve(totalPages int, workspacePath string) (int, int, error) {
	from := r.Start
	if from < 1 {
		from = 1
	}
	if from > totalPages {
		return 0, 0, fmt.Errorf("startPage %d exceeds the %d pages of %q", from, totalPages, workspacePath)
	}
	to := r.End
	if to < 1 || to > totalPages {
		to = totalPages
	}
	return from, to, nil
}

// pdfPageRangeFromArgs reads startPage and endPage from tool arguments. Models send
// numbers, but some quote them, so numeric strings are accepted too.
func pdfPageRangeFromArgs(args map[string]any) (pdfPageRange, error) {
	page := func(key string) (int, error) {
		raw, present := args[key]
		if !present || raw == nil {
			return 0, nil
		}
		var value float64
		switch typed := raw.(type) {
		case float64:
			value = typed
		case string:
			trimmed := strings.TrimSpace(typed)
			if trimmed == "" {
				return 0, nil
			}
			parsed, err := strconv.ParseFloat(trimmed, 64)
			if err != nil {
				return 0, fmt.Errorf("%s must be a positive integer", key)
			}
			value = parsed
		default:
			return 0, fmt.Errorf("%s must be a positive integer", key)
		}
		if value != math.Trunc(value) || value < 1 {
			return 0, fmt.Errorf("%s must be a positive integer", key)
		}
		return int(value), nil
	}
	start, err := page("startPage")
	if err != nil {
		return pdfPageRange{}, err
	}
	end, err := page("endPage")
	if err != nil {
		return pdfPageRange{}, err
	}
	if start > 0 && end > 0 && start > end {
		return pdfPageRange{}, fmt.Errorf("startPage must be less than or equal to endPage")
	}
	return pdfPageRange{Start: start, End: end}, nil
}

// pdfPagesAttachmentName names the excerpt pulled out of a PDF so that the same
// range read twice in a round dedupes, while different ranges stay distinct.
func pdfPagesAttachmentName(fileName string, from, to int) string {
	stem := strings.TrimSuffix(fileName, filepath.Ext(fileName))
	return fmt.Sprintf("%s (pages %d-%d).pdf", stem, from, to)
}

type toolResultAttacher interface {
	toolAttachments() []ChatAttachment
}

func toolResultAttachments(result any) []ChatAttachment {
	if carrier, ok := result.(toolResultAttacher); ok {
		return carrier.toolAttachments()
	}
	return nil
}

// One PDF read twice in a round only needs to be uploaded once.
func dedupeToolAttachments(attachments []ChatAttachment) []ChatAttachment {
	if len(attachments) < 2 {
		return attachments
	}
	seen := map[string]bool{}
	deduped := make([]ChatAttachment, 0, len(attachments))
	for _, attachment := range attachments {
		if seen[attachment.Name] {
			continue
		}
		seen[attachment.Name] = true
		deduped = append(deduped, attachment)
	}
	return deduped
}

// readPdfToolResult loads a Workspace PDF as a native attachment. With a page range
// only those pages are sent, as one excerpt PDF, which also lets a file that is too
// large whole be read a few pages at a time. It returns an error when the selection
// is still too large to send, since there is no text-layer fallback here.
func readPdfToolResult(target, workspacePath string, pages pdfPageRange) (*PdfToolResult, error) {
	name := filepath.Base(workspacePath)
	if pages.isSet() {
		return readPdfPagesToolResult(target, workspacePath, name, pages)
	}
	info, err := os.Stat(target)
	if err != nil {
		return nil, err
	}
	if info.Size() > maxNativePdfBytes {
		return nil, fmt.Errorf("%q is %d MB, too large to send to the model (limit %d MB). Read it a few pages at a time with startPage and endPage, or ask the user to attach a smaller excerpt", workspacePath, info.Size()/(1024*1024), maxNativePdfBytes/(1024*1024))
	}
	bytes, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}
	return &PdfToolResult{
		Path:     workspacePath,
		FileName: name,
		Note:     fmt.Sprintf("The PDF %q is attached to this tool result as a document. Read it directly.", workspacePath),
		attachments: []ChatAttachment{{
			Name:     name,
			MimeType: "application/pdf",
			Data:     base64.StdEncoding.EncodeToString(bytes),
		}},
	}, nil
}

func readPdfPagesToolResult(target, workspacePath, name string, pages pdfPageRange) (*PdfToolResult, error) {
	bytes, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}
	totalPages, err := pdfsplit.PageCount(bytes)
	if err != nil {
		return nil, fmt.Errorf("read the pages of %q: %w", workspacePath, err)
	}
	from, to, err := pages.resolve(totalPages, workspacePath)
	if err != nil {
		return nil, err
	}
	excerpt, err := pdfsplit.ExtractPages(bytes, from, to)
	if err != nil {
		return nil, fmt.Errorf("extract pages %d-%d of %q: %w", from, to, workspacePath, err)
	}
	if len(excerpt) > maxNativePdfBytes {
		return nil, fmt.Errorf("pages %d-%d of %q are too large to send to the model (limit %d MB). Read a narrower page range", from, to, workspacePath, maxNativePdfBytes/(1024*1024))
	}
	return &PdfToolResult{
		Path:      workspacePath,
		FileName:  name,
		Note:      fmt.Sprintf("Pages %d-%d of the %d-page PDF %q are attached to this tool result as a document. Read it directly.", from, to, totalPages, workspacePath),
		StartPage: from,
		EndPage:   to,
		attachments: []ChatAttachment{{
			Name:     pdfPagesAttachmentName(name, from, to),
			MimeType: "application/pdf",
			Data:     base64.StdEncoding.EncodeToString(excerpt),
		}},
	}, nil
}

// openAIFileContentPart builds the Chat Completions "file" content part, which takes a
// base64 payload through file_data. Responses uses input_file with the same data URL.
func openAIFileContentPart(attachment ChatAttachment) map[string]any {
	return map[string]any{"type": "file", "file": map[string]any{
		"filename":  attachment.Name,
		"file_data": "data:" + attachment.MimeType + ";base64," + attachment.Data,
	}}
}

// extractPdfToolText reads a PDF's text layer, labelled by page so the model can cite
// one. A page range keeps only those pages. A scan has no text layer, so the error
// says to attach the file instead.
func extractPdfToolText(target, workspacePath string, pages pdfPageRange) (string, error) {
	extracted, err := pdfsplit.ExtractTextFile(target)
	if err != nil {
		return "", fmt.Errorf("extract text from %q: %w", workspacePath, err)
	}
	from, to := 1, len(extracted)
	if pages.isSet() {
		if from, to, err = pages.resolve(len(extracted), workspacePath); err != nil {
			return "", err
		}
	}
	texts := make([]string, 0, to-from+1)
	for _, page := range extracted {
		if page.Number < from || page.Number > to {
			continue
		}
		if value := strings.TrimSpace(page.Text); value != "" {
			texts = append(texts, fmt.Sprintf("[Page %d]\n%s", page.Number, value))
		}
	}
	if len(texts) == 0 {
		if pages.isSet() {
			return "", fmt.Errorf("pages %d-%d of %q have no extractable text layer (they are probably scanned). Ask the user to attach the file to the message so the model can see the pages", from, to, workspacePath)
		}
		return "", fmt.Errorf("%q has no extractable text layer (it is probably a scan). Ask the user to attach it to the message so the model can see the pages", workspacePath)
	}
	return strings.Join(texts, "\n\n"), nil
}
