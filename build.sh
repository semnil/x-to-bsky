#!/usr/bin/env bash
# build.sh — Package the extension into a zip for Chrome sideloading or Web Store upload
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Read version from manifest
VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
OUT="x-to-bsky-v${VERSION}.zip"

# Clean previous build
rm -f "$OUT"

# Package — include only the required files
zip -r "$OUT" \
  manifest.json \
  background.js \
  lib.js \
  shared.js \
  content.js \
  content.css \
  popup.html \
  popup.js \
  options.html \
  options.js \
  icons/*.png \
  --exclude 'icons/*.html' 'icons/*.svg'

echo ""
echo "=== Built: $OUT ==="
echo ""
echo "Install (developer mode):"
echo "  1. chrome://extensions を開く"
echo "  2. 「デベロッパー モード」を ON"
echo "  3. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを指定"
echo ""
echo "Or load the zip:"
echo "  1. $OUT を展開"
echo "  2. 展開したフォルダを上記の手順で読み込む"
