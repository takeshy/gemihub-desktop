package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const maxPluginInstallBytes = 64 * 1024 * 1024
const maxPluginAssetBytes = 256 * 1024 * 1024

var managedPluginIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
var managedPluginVersionPattern = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$`)

type managedPluginAsset struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	SHA256 string `json:"sha256,omitempty"`
}

type managedPluginManifest struct {
	ID      string               `json:"id"`
	Version string               `json:"version"`
	Assets  []managedPluginAsset `json:"assets,omitempty"`
}

type managedPluginInstall struct {
	ID      string `json:"id"`
	Repo    string `json:"repo"`
	Version string `json:"version"`
}

func safeManagedPluginID(id string) bool {
	return managedPluginIDPattern.MatchString(id) && id != "." && id != ".."
}

func safePluginRelativePath(path string) bool {
	if path == "" || filepath.IsAbs(path) || strings.Contains(path, "\\") {
		return false
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(path)))
	return clean == path && clean != "." && clean != ".." && !strings.HasPrefix(clean, "../")
}

// InstallPluginFiles atomically replaces a managed plugin with an already
// validated and host-patched file set. Network and unified-diff handling live
// in the frontend so External Skills and plugins share exactly the same patch rules.
func (a *App) InstallPluginFiles(pluginID string, files map[string]string, installJSON string) error {
	a.pluginMu.Lock()
	defer a.pluginMu.Unlock()
	if !safeManagedPluginID(pluginID) {
		return fmt.Errorf("invalid plugin id")
	}
	if len(files) == 0 || len(files) > 128 {
		return fmt.Errorf("invalid plugin file count")
	}
	if _, ok := files["manifest.json"]; !ok {
		return fmt.Errorf("manifest.json is required")
	}
	if _, ok := files["main.js"]; !ok {
		return fmt.Errorf("main.js is required")
	}
	var manifest managedPluginManifest
	if err := json.Unmarshal([]byte(files["manifest.json"]), &manifest); err != nil || manifest.ID != pluginID || !managedPluginVersionPattern.MatchString(manifest.Version) {
		return fmt.Errorf("manifest id or version is invalid")
	}
	total := len(installJSON)
	for name, content := range files {
		if !safePluginRelativePath(name) || name == "install.json" {
			return fmt.Errorf("unsafe plugin file path: %s", name)
		}
		total += len(content)
		if total > maxPluginInstallBytes {
			return fmt.Errorf("plugin install exceeds size limit")
		}
	}
	var install managedPluginInstall
	if err := json.Unmarshal([]byte(installJSON), &install); err != nil {
		return fmt.Errorf("invalid install metadata: %w", err)
	}
	if install.ID != pluginID || install.Repo == "" || install.Version != manifest.Version {
		return fmt.Errorf("install metadata id mismatch")
	}

	pluginsDir, err := a.directoryPath(".llm-hub/plugins", true)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(pluginsDir, 0o755); err != nil {
		return err
	}
	stage, err := os.MkdirTemp(pluginsDir, "."+pluginID+"-stage-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	for name, content := range files {
		target := filepath.Join(stage, filepath.FromSlash(name))
		if err := requirePathInside(stage, target); err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(stage, "install.json"), []byte(installJSON), 0o644); err != nil {
		return err
	}

	target := filepath.Join(pluginsDir, pluginID)
	backup := filepath.Join(pluginsDir, "."+pluginID+"-backup")
	os.RemoveAll(backup)
	hadTarget := false
	if _, err := os.Lstat(target); err == nil {
		hadTarget = true
		previousJSON, metadataErr := os.ReadFile(filepath.Join(target, "install.json"))
		if metadataErr != nil {
			return fmt.Errorf("manually installed plugin already exists")
		}
		var previous managedPluginInstall
		if json.Unmarshal(previousJSON, &previous) != nil || previous.ID != pluginID || previous.Repo != install.Repo {
			return fmt.Errorf("plugin repository does not match the installed plugin")
		}
		if err := os.Rename(target, backup); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.Rename(stage, target); err != nil {
		if hadTarget {
			_ = os.Rename(backup, target)
		}
		return err
	}
	if hadTarget {
		_ = os.RemoveAll(backup)
	}
	if cache, err := a.directoryPath(".llm-hub/cache/plugins/"+pluginID, true); err == nil {
		_ = os.RemoveAll(cache)
	}
	return nil
}

// UninstallPlugin removes only manager-installed plugins. Manually placed
// plugins have no install.json and remain protected from the UI.
func (a *App) UninstallPlugin(pluginID string) error {
	a.pluginMu.Lock()
	defer a.pluginMu.Unlock()
	if !safeManagedPluginID(pluginID) {
		return fmt.Errorf("invalid plugin id")
	}
	target, err := a.directoryPath(".llm-hub/plugins/"+pluginID, false)
	if err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(target, "install.json")); err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("manually installed plugins cannot be uninstalled here")
		}
		return err
	}
	if err := os.RemoveAll(target); err != nil {
		return err
	}
	for _, relative := range []string{".llm-hub/cache/plugins/" + pluginID, ".llm-hub/plugin-data/" + pluginID + ".json"} {
		if path, pathErr := a.directoryPath(relative, true); pathErr == nil {
			_ = os.RemoveAll(path)
		}
	}
	return nil
}

func rejectPrivatePluginAssetHost(host string) error {
	lower := strings.ToLower(strings.TrimSuffix(host, "."))
	if lower == "localhost" || lower == "metadata.google.internal" || strings.HasSuffix(lower, ".internal") {
		return fmt.Errorf("asset URL points to a private or internal host")
	}
	addresses, err := net.LookupIP(lower)
	if err != nil {
		return err
	}
	for _, address := range addresses {
		if address.IsLoopback() || address.IsPrivate() || address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() || address.IsUnspecified() {
			return fmt.Errorf("asset URL resolves to a private or internal address")
		}
	}
	return nil
}

func validatePluginAssetURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil {
		return nil, fmt.Errorf("asset requires a valid HTTPS URL")
	}
	if err := rejectPrivatePluginAssetHost(parsed.Hostname()); err != nil {
		return nil, err
	}
	return parsed, nil
}

// FetchPluginAsset downloads a manifest-declared external asset on first use,
// verifies its optional SHA-256, and caches it by plugin version.
func (a *App) FetchPluginAsset(pluginID string, name string) (string, error) {
	a.pluginMu.Lock()
	defer a.pluginMu.Unlock()
	if !safeManagedPluginID(pluginID) || !safePluginRelativePath(name) || strings.Contains(name, "/") || strings.HasPrefix(name, ".") {
		return "", fmt.Errorf("invalid plugin asset name")
	}
	manifestPath, err := a.directoryPath(".llm-hub/plugins/"+pluginID+"/manifest.json", false)
	if err != nil {
		return "", err
	}
	content, err := os.ReadFile(manifestPath)
	if err != nil {
		return "", err
	}
	var manifest managedPluginManifest
	if err := json.Unmarshal(content, &manifest); err != nil || manifest.ID != pluginID || !managedPluginVersionPattern.MatchString(manifest.Version) {
		return "", fmt.Errorf("invalid plugin manifest")
	}
	var declared *managedPluginAsset
	for index := range manifest.Assets {
		if manifest.Assets[index].Name == name {
			declared = &manifest.Assets[index]
			break
		}
	}
	if declared == nil {
		return "", fmt.Errorf("asset is not declared in manifest")
	}
	cacheRelative := ".llm-hub/cache/plugins/" + pluginID + "/" + manifest.Version + "/" + name
	cachePath, err := a.directoryPath(cacheRelative, true)
	if err != nil {
		return "", err
	}
	if cached, readErr := os.ReadFile(cachePath); readErr == nil {
		if declared.SHA256 == "" || strings.EqualFold(declared.SHA256, sha256Hex(cached)) {
			return base64.StdEncoding.EncodeToString(cached), nil
		}
		_ = os.Remove(cachePath)
	}
	assetURL, err := validatePluginAssetURL(declared.URL)
	if err != nil {
		return "", err
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, assetURL.String(), nil)
	if err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 5 * time.Minute, Transport: publicNetworkTransport(), CheckRedirect: func(next *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return fmt.Errorf("too many redirects")
		}
		_, redirectErr := validatePluginAssetURL(next.URL.String())
		return redirectErr
	}}
	response, err := client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("asset download failed: HTTP %d", response.StatusCode)
	}
	bytes, err := io.ReadAll(io.LimitReader(response.Body, maxPluginAssetBytes+1))
	if err != nil {
		return "", err
	}
	if len(bytes) > maxPluginAssetBytes {
		return "", fmt.Errorf("plugin asset exceeds size limit")
	}
	if declared.SHA256 != "" && !strings.EqualFold(declared.SHA256, sha256Hex(bytes)) {
		return "", fmt.Errorf("plugin asset SHA-256 mismatch")
	}
	if err := os.MkdirAll(filepath.Dir(cachePath), 0o755); err != nil {
		return "", err
	}
	tmp, err := os.CreateTemp(filepath.Dir(cachePath), ".asset-*.tmp")
	if err != nil {
		return "", err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(bytes); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(tmpPath, cachePath); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(bytes), nil
}

func sha256Hex(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}
