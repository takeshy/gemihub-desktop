//go:build windows

package main

import "syscall"

const (
	virtualKeyControl = 0x11
	virtualKeyShift   = 0x10
	virtualKeyF12     = 0x7B
	keyEventKeyUp     = 0x0002
)

var keybdEvent = syscall.NewLazyDLL("user32.dll").NewProc("keybd_event")

func triggerDeveloperTools() bool {
	// Wails 2.10.2 opens WebView2 DevTools for Ctrl+Shift+F12. Inject that
	// accelerator while this application still owns keyboard focus.
	keybdEvent.Call(virtualKeyControl, 0, 0, 0)
	keybdEvent.Call(virtualKeyShift, 0, 0, 0)
	keybdEvent.Call(virtualKeyF12, 0, 0, 0)
	keybdEvent.Call(virtualKeyF12, 0, keyEventKeyUp, 0)
	keybdEvent.Call(virtualKeyShift, 0, keyEventKeyUp, 0)
	keybdEvent.Call(virtualKeyControl, 0, keyEventKeyUp, 0)
	return true
}
