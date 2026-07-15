package main

// OpenDeveloperTools maps the familiar browser shortcut to the native
// WebView developer-tools accelerator enabled in desktop builds.
func (a *App) OpenDeveloperTools() bool {
	return triggerDeveloperTools()
}
