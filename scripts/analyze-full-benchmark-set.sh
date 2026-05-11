#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCREENSHOT_DIR="$ROOT_DIR/screenshots"
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

if [[ ! -d "$SCREENSHOT_DIR" ]]; then
    echo "Screenshot directory does not exist: $SCREENSHOT_DIR" >&2
    exit 1
fi

mapfile -t IMAGES < <(
    find "$SCREENSHOT_DIR" \
        -maxdepth 1 \
        -type f \
        \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) \
        -printf '%f\n' |
    sort
)

if [[ "${#IMAGES[@]}" -eq 0 ]]; then
    echo "No benchmark images found in: $SCREENSHOT_DIR" >&2
    exit 1
fi

for image in "${IMAGES[@]}"; do
    output="${SCREENSHOT_DIR}/${image%.*}-full.txt"
    echo "===== ${image} -> ${output#$ROOT_DIR/} ====="
    "$ROOT_DIR/scripts/analyze-full.py" \
        "$SCREENSHOT_DIR/$image" \
        --cell-size "$CELL_SIZE" \
        --max-cols "$MAX_COLS" \
        --full-output "$output" \
        "$@"
    echo
done
