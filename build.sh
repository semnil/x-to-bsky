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

# Files to include in the package
FILES=(
  manifest.json
  background.js
  lib.js
  shared.js
  content.js
  content.css
  popup.html
  popup.js
  options.html
  options.js
  icons/icon16.png
  icons/icon48.png
  icons/icon128.png
  _locales/ja/messages.json
  _locales/en/messages.json
)

# Package — use zip if available, otherwise fall back to Python
if command -v zip &>/dev/null; then
  zip "$OUT" "${FILES[@]}"
else
  python3 -c "
import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sys.argv[2:]:
        z.write(f)
" "$OUT" "${FILES[@]}" 2>/dev/null ||
  python -c "
import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sys.argv[2:]:
        z.write(f)
" "$OUT" "${FILES[@]}"
fi

echo ""
echo "=== Built: $OUT ==="
echo ""
echo "Install (developer mode):"
echo "  1. Open chrome://extensions"
echo "  2. Turn on \"Developer mode\""
echo "  3. Click \"Load unpacked\" and select this folder"
echo ""
echo "Or load the zip:"
echo "  1. Extract $OUT"
echo "  2. Load the extracted folder with the steps above"
