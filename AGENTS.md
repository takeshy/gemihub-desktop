# Agent Instructions

## Windows ARM64 build

When asked to build the Windows ARM64 executable, run the following Wails v3
commands from the project root in the WSL host environment, outside the sandbox:

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.12
wails3 task windows:build ARCH=arm64
```

Do not invoke Windows PowerShell for the executable build. The output is written
to `bin/gemihub-desktop.exe`. The Store-ready MSIX is built on a Windows host or
CI with `wails3 task windows:msix ARCH=arm64`.
