# Agent Instructions

## Windows ARM64 build

When asked to build the Windows ARM64 executable, run the following Wails
command from the project root in the WSL host environment, outside the sandbox:

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.10.2 build \
  -devtools -clean -nopackage -platform windows/arm64 \
  -o gemihub-desktop-windows-arm64.exe
```

Do not invoke Windows PowerShell for this build. The output is written to
`build/bin/gemihub-desktop-windows-arm64.exe`.
