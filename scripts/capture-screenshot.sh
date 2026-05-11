#!/usr/bin/env bash
set -euo pipefail

OUTPUT="${1:-/tmp/ascii-desktop-capture.png}"

mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT"

if command -v gnome-screenshot >/dev/null 2>&1; then
    gnome-screenshot -f "$OUTPUT"
elif command -v spectacle >/dev/null 2>&1; then
    spectacle -b -n -o "$OUTPUT"
elif command -v flameshot >/dev/null 2>&1; then
    flameshot full --path "$OUTPUT"
else
    gdbus call \
        --session \
        --dest org.gnome.Shell.Screenshot \
        --object-path /org/gnome/Shell/Screenshot \
        --method org.gnome.Shell.Screenshot.Screenshot \
        false \
        false \
        "$OUTPUT"
fi

if [[ ! -s "$OUTPUT" ]]; then
    echo "Screenshot did not create a non-empty file: $OUTPUT" >&2
    echo "On GNOME Wayland, use the desktop screenshot UI and save the file manually." >&2
    exit 1
fi

echo "$OUTPUT"
