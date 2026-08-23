param(
    [ValidateSet("amd64", "arm64")]
    [string]$Arch = "amd64"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$config = Get-Content (Join-Path $root "wails.json") -Raw | ConvertFrom-Json
$version = "$($config.info.version).0"
$msixArch = if ($Arch -eq "amd64") { "x64" } else { "arm64" }
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("gemihub-desktop-msix-" + [guid]::NewGuid())
$assets = Join-Path $stage "Assets"
$output = Join-Path $root "bin\gemihub-desktop-windows-$Arch.msix"

New-Item -ItemType Directory -Force $assets | Out-Null
try {
    Copy-Item (Join-Path $root "bin\gemihub-desktop.exe") (Join-Path $stage "gemihub-desktop.exe")
    Copy-Item (Join-Path $PSScriptRoot "Assets\*") $assets

    $manifest = Get-Content (Join-Path $PSScriptRoot "AppxManifest.xml") -Raw
    $manifest = $manifest.Replace("@VERSION@", $version).Replace("@ARCH@", $msixArch)
    Set-Content (Join-Path $stage "AppxManifest.xml") $manifest -Encoding utf8

    $makeAppxCommand = Get-Command MakeAppx.exe -ErrorAction SilentlyContinue
    $makeAppxPath = if ($makeAppxCommand) { $makeAppxCommand.Source } else { $null }
    if (-not $makeAppxPath) {
        $makeAppxFile = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\MakeAppx.exe" |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($makeAppxFile) { $makeAppxPath = $makeAppxFile.FullName }
    }
    if (-not $makeAppxPath) { throw "MakeAppx.exe was not found. Install the Windows SDK." }

    New-Item -ItemType Directory -Force (Split-Path $output) | Out-Null
    & $makeAppxPath pack /d $stage /p $output /o
    if ($LASTEXITCODE -ne 0) { throw "MakeAppx.exe failed with exit code $LASTEXITCODE" }
    Write-Host "Built $output"
}
finally {
    Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
}
