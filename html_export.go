package main

import (
	"fmt"
	"html"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/pkg/browser"
)

const htmlExportBaseMarker = "__LLM_HUB_SOURCE_BASE__"

func localDirectoryURL(path string) string {
	path = filepath.ToSlash(path)
	if len(path) >= 2 && path[1] == ':' {
		path = "/" + path
	}
	if !strings.HasSuffix(path, "/") {
		path += "/"
	}
	return (&url.URL{Scheme: "file", Path: path}).String()
}

func exportHTMLName(sourcePath string) string {
	name := filepath.Base(filepath.FromSlash(strings.TrimSpace(sourcePath)))
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	if stem == "" || stem == "." {
		stem = "document"
	}
	return filepath.ToSlash(filepath.Join("temporaries", stem+".html"))
}

// SaveHTMLExport writes browser-ready HTML under the working directory's
// temporaries folder. Relative images and links remain relative to the source
// Markdown file through the injected <base> URL.
func (a *App) SaveHTMLExport(sourcePath, htmlContent string) (string, error) {
	if strings.TrimSpace(sourcePath) == "" {
		return "", fmt.Errorf("source path is empty")
	}
	source, err := a.directoryPath(sourcePath, false)
	if err != nil {
		return "", err
	}
	baseURL := html.EscapeString(localDirectoryURL(filepath.Dir(source)))
	htmlContent = strings.ReplaceAll(htmlContent, htmlExportBaseMarker, baseURL)
	output := exportHTMLName(sourcePath)
	if err := a.WriteFile("workspace://"+output, htmlContent); err != nil {
		return "", err
	}
	return "workspace://" + output, nil
}

// OpenHTMLInBrowser opens a local HTML document in the user's default browser.
func (a *App) OpenHTMLInBrowser(path string) error {
	target, err := a.directoryPath(path, false)
	if err != nil {
		return err
	}
	ext := strings.ToLower(filepath.Ext(target))
	if ext != ".html" && ext != ".htm" {
		return fmt.Errorf("only HTML files can be opened in the browser")
	}
	return browser.OpenFile(target)
}
