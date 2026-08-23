package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	app := NewApp()
	webviewUserDataPath := ""
	if configDir, err := os.UserConfigDir(); err == nil {
		webviewUserDataPath = filepath.Join(configDir, appID, "webview")
	}

	wailsApp := application.New(application.Options{
		Name:        appName,
		Description: "GemiHub-compatible local desktop workspace",
		Icon:        appIcon,
		Windows: application.WindowsOptions{
			WebviewUserDataPath: webviewUserDataPath,
		},
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(assets),
		},
	})
	app.application = wailsApp
	wailsApp.RegisterService(application.NewService(app))

	window := wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            appName,
		Width:            1200,
		Height:           820,
		BackgroundType:   application.BackgroundTypeSolid,
		BackgroundColour: application.NewRGBA(20, 23, 29, 255),
		EnableFileDrop:   true,
		URL:              "/",
	})
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		details := event.Context().DropTargetDetails()
		x, y := 0, 0
		if details != nil {
			x, y = details.X, details.Y
		}
		wailsApp.Event.Emit("wails:file-drop", map[string]any{
			"x": x, "y": y, "paths": event.Context().DroppedFiles(),
		})
	})

	if err := wailsApp.Run(); err != nil {
		log.Fatal(err)
	}
}
