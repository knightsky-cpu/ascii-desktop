#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCREENSHOT_DIR="$ROOT_DIR/screenshots"
CELL_SIZE="8"

if [[ $# -gt 0 && "$1" != -* ]]; then
    CELL_SIZE="$1"
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

printf "%-24s %8s %8s %8s %8s %8s %8s\n" \
    "image" "space%" "mid%" "bright%" "hash%" "cells" "size"

for image in "${IMAGES[@]}"; do
    "$ROOT_DIR/scripts/analyze-luminance.py" \
        "$SCREENSHOT_DIR/$image" \
        --cell-size "$CELL_SIZE" \
        --max-cols 0 \
        "$@" |
    awk -v image="$image" '
        /^source=/ {
            split($1, source, "=")
            size = source[2]
        }
        /^cells=/ {
            split($1, cells_pair, "=")
            cells = cells_pair[2]
        }
        /^  '\''space'\''/ { space = $3 }
        /^  '\''c'\''/ { mid += $3 }
        /^  '\''o'\''/ { mid += $3 }
        /^  '\''P'\''/ { mid += $3 }
        /^  '\''O'\''/ { mid += $3 }
        /^  '\''\?'\''/ { bright += $3 }
        /^  '\''@'\''/ { bright += $3 }
        /^  '\''#'\''/ { bright += $3; hash = $3 }
        END {
            printf "%-24s %8.2f %8.2f %8.2f %8.2f %8s %8s\n",
                image, space, mid, bright, hash, cells, size
        }
    '
done
