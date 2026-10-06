#!/bin/sh
# Run from the project root on macOS after darwin:build.
set -eu
if [ "$(uname -s)" != Darwin ]; then
  echo 'macOS packaging requires a Mac host.' >&2
  exit 1
fi
arch=${1:-arm64}
case "$arch" in arm64|amd64) ;; *) echo 'Unsupported architecture.' >&2; exit 1 ;; esac
version=$(plutil -extract info.version raw -o - wails.json)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/gemihub-package.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM
app="$work_dir/GemiHub Desktop.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
install -m 755 bin/gemihub-desktop "$app/Contents/MacOS/gemihub-desktop"
cp THIRD_PARTY_NOTICES.md "$app/Contents/Resources/"
cat > "$app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>GemiHub Desktop</string>
<key>CFBundleDisplayName</key><string>GemiHub Desktop</string>
<key>CFBundleIdentifier</key><string>takeshy.gemihub-desktop</string>
<key>CFBundleExecutable</key><string>gemihub-desktop</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$version</string>
<key>CFBundleVersion</key><string>$version</string>
<key>CFBundleIconFile</key><string>appicon.icns</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
EOF
plutil -lint "$app/Contents/Info.plist"
iconset="$work_dir/appicon.iconset"
mkdir -p "$iconset"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" build/appicon.png --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" build/appicon.png --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$iconset" -o "$app/Contents/Resources/appicon.icns"
codesign --force --sign - "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --sequesterRsrc --keepParent "$app" "bin/gemihub-desktop-darwin-$arch.app.zip"
