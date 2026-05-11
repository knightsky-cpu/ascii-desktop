#!/usr/bin/env bash
set -euo pipefail

SCREENSHOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CELL_SIZE="8"
MAX_COLS="120"

if [[ $# -gt 0 && "$1" != -* ]]; then
    CELL_SIZE="$1"
    shift
fi
if [[ $# -gt 0 && "$1" != -* ]]; then
    MAX_COLS="$1"
    shift
fi

LATEST="$(
    find "$SCREENSHOT_DIR" \
        -maxdepth 1 \
        -type f \
        \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
        -printf '%T@ %p\n' |
    sort -nr |
    head -n 1 |
    cut -d' ' -f2-
)"

if [[ -z "$LATEST" ]]; then
    echo "No screenshot image found in: $SCREENSHOT_DIR" >&2
    echo "Save an image into this directory, then run this script again." >&2
    exit 1
fi

echo "Analyzing latest screenshot: $LATEST" >&2
"$SCREENSHOT_DIR/analyze-luminance.py" "$LATEST" --cell-size "$CELL_SIZE" --max-cols "$MAX_COLS" "$@"
