#!/usr/bin/env bash
set -euo pipefail

SCREENSHOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="${1:-$SCREENSHOT_DIR/screenshot-$(date +%Y%m%d-%H%M%S).png}"

if command -v gnome-screenshot >/dev/null 2>&1; then
    gnome-screenshot -f "$OUTPUT"
elif command -v spectacle >/dev/null 2>&1; then
    spectacle -b -n -o "$OUTPUT"
elif command -v flameshot >/dev/null 2>&1; then
    flameshot full --path "$OUTPUT"
else
    echo "No supported screenshot command found." >&2
    echo "Install gnome-screenshot, or save a screenshot here manually." >&2
    echo "Recommended install command: sudo apt install gnome-screenshot" >&2
    echo "Manual path: save a PNG/JPG/WebP into $SCREENSHOT_DIR, then run ./analyze-latest-screenshot.sh" >&2
    exit 1
fi

if [[ ! -s "$OUTPUT" ]]; then
    echo "Screenshot command ran but did not create a non-empty file: $OUTPUT" >&2
    echo "On GNOME Wayland, use the desktop screenshot UI and save the file into $SCREENSHOT_DIR." >&2
    exit 1
fi

echo "Saved screenshot: $OUTPUT"
