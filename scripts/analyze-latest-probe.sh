#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROBE_DIR="${TMPDIR:-/tmp}"
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
    find "$PROBE_DIR" \
        -maxdepth 1 \
        -type f \
        -name 'ascii-overlay-probe-*.png' \
        -printf '%T@ %p\n' |
    sort -nr |
    head -n 1 |
    cut -d' ' -f2-
)"

if [[ -z "$LATEST" ]]; then
    echo "No ASCII overlay probe image found in: $PROBE_DIR" >&2
    echo "Press Ctrl+Alt+Comma while the extension is active, then run this script again." >&2
    exit 1
fi

echo "Analyzing latest live probe: $LATEST" >&2
"$ROOT_DIR/scripts/analyze-luminance.py" "$LATEST" --cell-size "$CELL_SIZE" --max-cols "$MAX_COLS" "$@"
