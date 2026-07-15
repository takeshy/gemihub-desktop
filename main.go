package main

import (
	"embed"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	windowsoptions "github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:dist
var assets embed.FS

func main() {
	app := NewApp()
	webviewUserDataPath := ""
	if configDir, err := os.UserConfigDir(); err == nil {
		webviewUserDataPath = filepath.Join(configDir, appID, "webview")
	}

	err := wails.Run(&options.App{
		Title:  appName,
		Width:  1200,
		Height: 820,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 20, G: 23, B: 29, A: 1},
		Windows: &windowsoptions.Options{
			WebviewUserDataPath: webviewUserDataPath,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}
