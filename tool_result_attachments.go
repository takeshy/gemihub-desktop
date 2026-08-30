package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
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
	Path       string `json:"path"`
	FileName   string `json:"fileName"`
	Note       string `json:"note"`
	attachment ChatAttachment
}

func (r *PdfToolResult) toolAttachments() []ChatAttachment {
	if r == nil || r.attachment.Data == "" {
		return nil
	}
	return []ChatAttachment{r.attachment}
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

// readPdfToolResult loads a Workspace PDF as a native attachment. It returns an error
// when the file is too large to send whole, since there is no text-layer fallback here.
func readPdfToolResult(target, workspacePath string) (*PdfToolResult, error) {
	info, err := os.Stat(target)
	if err != nil {
		return nil, err
	}
	if info.Size() > maxNativePdfBytes {
		return nil, fmt.Errorf("%q is %d MB, too large to send to the model (limit %d MB). Ask the user to attach a smaller excerpt", workspacePath, info.Size()/(1024*1024), maxNativePdfBytes/(1024*1024))
	}
	bytes, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}
	name := filepath.Base(workspacePath)
	return &PdfToolResult{
		Path:     workspacePath,
		FileName: name,
		Note:     fmt.Sprintf("The PDF %q is attached to this tool result as a document. Read it directly.", workspacePath),
		attachment: ChatAttachment{
			Name:     name,
			MimeType: "application/pdf",
			Data:     base64.StdEncoding.EncodeToString(bytes),
		},
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
// one. A scan has no text layer, so the error says to attach the file instead.
func extractPdfToolText(target, workspacePath string) (string, error) {
	pages, err := pdfsplit.ExtractTextFile(target)
	if err != nil {
		return "", fmt.Errorf("extract text from %q: %w", workspacePath, err)
	}
	texts := make([]string, 0, len(pages))
	for _, page := range pages {
		if value := strings.TrimSpace(page.Text); value != "" {
			texts = append(texts, fmt.Sprintf("[Page %d]\n%s", page.Number, value))
		}
	}
	if len(texts) == 0 {
		return "", fmt.Errorf("%q has no extractable text layer (it is probably a scan). Ask the user to attach it to the message so the model can see the pages", workspacePath)
	}
	return strings.Join(texts, "\n\n"), nil
}
