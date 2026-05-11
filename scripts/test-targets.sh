#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

preview_cols="${PREVIEW_COLS:-90}"
preview_rows="${PREVIEW_ROWS:-45}"
mode="${1:-full}"

targets=(
  ../screenshots/circle.png
  ../screenshots/circle5.png
  ../screenshots/emptyshapes.png
  ../screenshots/shapes1.png
  ../screenshots/shapes2.png
  ../screenshots/shapes3d.png
  ../screenshots/geometricshapes.png
)

run_edges() {
  local source="$1"
  local img="$2"
  local base="${img%.*}"
  local output="${base}-edges-${source}.txt"
  local log="${base}-edges-${source}.log"

  echo
  echo "================================================================================"
  echo "=== ${source}: ${img} ==="
  echo "================================================================================"

  case "$source" in
    ink)
      ./analyze-edges.py "$img" \
        --cell-size 8 \
        --max-cols "$preview_cols" \
        --max-rows "$preview_rows" \
        --edge-source ink \
        --ink-threshold 0.75 \
        --ink-cell-threshold 0.08 \
        --skeletonize-edges 20 \
        --min-component-size 8 \
        --full-output "$output" \
        | tee "$log"
      ;;
    raw-tight)
      ./analyze-edges.py "$img" \
        --cell-size 8 \
        --max-cols "$preview_cols" \
        --max-rows "$preview_rows" \
        --edge-source raw \
        --thin-edges 1 \
        --min-component-size 8 \
        --full-output "$output" \
        | tee "$log"
      ;;
    hybrid)
      ./analyze-edges.py "$img" \
        --cell-size 8 \
        --max-cols "$preview_cols" \
        --max-rows "$preview_rows" \
        --edge-source hybrid \
        --thin-edges 1 \
        --skeletonize-edges 20 \
        --min-component-size 8 \
        --ink-threshold 0.75 \
        --ink-cell-threshold 0.08 \
        --hybrid-ink-density-threshold 1.0 \
        --hybrid-max-ink-density 0.18 \
        --full-output "$output" \
        | tee "$log"
      ;;
    *)
      echo "unknown edge source: $source" >&2
      exit 2
      ;;
  esac
}

run_full() {
  local source="$1"
  local img="$2"
  local base="${img%.*}"
  local output="${base}-full-${source}.txt"
  local log="${base}-full-${source}.log"

  echo
  echo "================================================================================"
  echo "=== full ${source}: ${img} ==="
  echo "================================================================================"

  case "$source" in
    ink)
      ./analyze-full.py "$img" \
        --cell-size 8 \
        --max-cols "$preview_cols" \
        --max-rows "$preview_rows" \
        --paper-background \
        --ramp fine20 \
        --edge-source ink \
        --ink-threshold 0.75 \
        --ink-cell-threshold 0.08 \
        --skeletonize-edges 20 \
        --min-component-size 8 \
        --full-output "$output" \
        | tee "$log"
      ;;
    raw-tight)
      ./analyze-full.py "$img" \
        --cell-size 8 \
        --max-cols "$preview_cols" \
        --max-rows "$preview_rows" \
        --paper-background \
        --ramp fine20 \
        --edge-source raw \
        --thin-edges 1 \
        --min-component-size 8 \
        --full-output "$output" \
        | tee "$log"
      ;;
    *)
      echo "unknown full source: $source" >&2
      exit 2
      ;;
  esac
}

run_target_edges() {
  local img="$1"
  run_edges ink "$img"
  run_edges raw-tight "$img"
}

run_target_full() {
  local img="$1"
  run_full ink "$img"
  run_full raw-tight "$img"
}

case "$mode" in
  edges)
    for img in "${targets[@]}"; do
      [ -e "$img" ] || { echo "skip missing target: $img" >&2; continue; }
      run_target_edges "$img"
    done
    ;;
  full)
    for img in "${targets[@]}"; do
      [ -e "$img" ] || { echo "skip missing target: $img" >&2; continue; }
      run_target_full "$img"
    done
    ;;
  all)
    for img in "${targets[@]}"; do
      [ -e "$img" ] || { echo "skip missing target: $img" >&2; continue; }
      run_target_edges "$img"
      run_target_full "$img"
    done
    ;;
  *)
    echo "usage: ./test-targets.sh [full|edges|all]" >&2
    exit 2
    ;;
esac
