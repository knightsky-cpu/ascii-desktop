#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

mode="${1:-all}"
shape_images=(
  ../screenshots/emptyshapes.png
  ../screenshots/shapes1.png
  ../screenshots/shapes2.png
  ../screenshots/shapes3d.png
  ../screenshots/geometricshapes.png
)

run_edges_ink() {
  for img in "${shape_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "edges ink: $img"
    ./analyze-edges.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --edge-source ink \
      --ink-threshold 0.75 \
      --ink-cell-threshold 0.08 \
      --skeletonize-edges 20 \
      --min-component-size 8 \
      --full-output "${base}-edges-ink.txt" \
      > "${base}-edges-ink.log"
  done
}

run_full_ink() {
  for img in "${shape_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "full ink: $img"
    ./analyze-full.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --paper-background \
      --ramp fine20 \
      --edge-source ink \
      --ink-threshold 0.75 \
      --ink-cell-threshold 0.08 \
      --skeletonize-edges 20 \
      --min-component-size 8 \
      --full-output "${base}-full-ink.txt" \
      > "${base}-full-ink.log"
  done
}

run_edges_hybrid() {
  for img in "${shape_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "edges hybrid: $img"
    ./analyze-edges.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --edge-source hybrid \
      --thin-edges 1 \
      --skeletonize-edges 20 \
      --min-component-size 8 \
      --ink-threshold 0.75 \
      --ink-cell-threshold 0.08 \
      --hybrid-ink-density-threshold 1.0 \
      --hybrid-max-ink-density 0.18 \
      --full-output "${base}-edges-hybrid.txt" \
      > "${base}-edges-hybrid.log"
  done
}

run_full_hybrid() {
  for img in "${shape_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "full hybrid: $img"
    ./analyze-full.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --paper-background \
      --ramp fine20 \
      --edge-source hybrid \
      --thin-edges 1 \
      --skeletonize-edges 20 \
      --min-component-size 8 \
      --ink-threshold 0.75 \
      --ink-cell-threshold 0.08 \
      --hybrid-ink-density-threshold 1.0 \
      --hybrid-max-ink-density 0.18 \
      --full-output "${base}-full-hybrid.txt" \
      > "${base}-full-hybrid.log"
  done
}

case "$mode" in
  edges)
    run_edges_ink
    ;;
  full)
    run_full_ink
    ;;
  hybrid)
    run_edges_hybrid
    ;;
  full-hybrid)
    run_full_hybrid
    ;;
  all)
    run_edges_ink
    run_full_ink
    ;;
  *)
    echo "usage: ./run-shape-ink-comparison.sh [all|edges|full|hybrid|full-hybrid]" >&2
    exit 2
    ;;
esac
