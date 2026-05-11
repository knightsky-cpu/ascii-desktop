#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

mode="${1:-all}"
circle_images=(../screenshots/circle.png ../screenshots/circle5.png)

run_edges_raw_tight() {
  for img in "${circle_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "edges raw tight: $img"
    ./analyze-edges.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --edge-source raw \
      --thin-edges 1 \
      --min-component-size 8 \
      --full-output "${base}-edges-raw-tight.txt" \
      > "${base}-edges-raw-tight.log"
  done
}

run_edges_raw_strict() {
  for img in "${circle_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "edges raw strict: $img"
    ./analyze-edges.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --edge-source raw \
      --edge-threshold 0.30 \
      --cell-threshold 0.20 \
      --thin-edges 1 \
      --min-component-size 12 \
      --full-output "${base}-edges-raw-strict.txt" \
      > "${base}-edges-raw-strict.log"
  done
}

run_edges_raw_skeleton() {
  for img in "${circle_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "edges raw skeleton: $img"
    ./analyze-edges.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --edge-source raw \
      --thin-edges 1 \
      --skeletonize-edges 8 \
      --min-component-size 8 \
      --full-output "${base}-edges-raw-skeleton.txt" \
      > "${base}-edges-raw-skeleton.log"
  done
}

run_edges_ink() {
  for img in "${circle_images[@]}"; do
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

run_full_raw_strict() {
  for img in "${circle_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "full raw strict: $img"
    ./analyze-full.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --paper-background \
      --ramp fine20 \
      --edge-source raw \
      --edge-threshold 0.30 \
      --cell-threshold 0.20 \
      --thin-edges 1 \
      --min-component-size 12 \
      --full-output "${base}-full-raw-strict.txt" \
      > "${base}-full-raw-strict.log"
  done
}

run_full_raw_tight() {
  for img in "${circle_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "full raw tight: $img"
    ./analyze-full.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --paper-background \
      --ramp fine20 \
      --edge-source raw \
      --thin-edges 1 \
      --min-component-size 8 \
      --full-output "${base}-full-raw-tight.txt" \
      > "${base}-full-raw-tight.log"
  done
}

run_full_raw_skeleton() {
  for img in "${circle_images[@]}"; do
    [ -e "$img" ] || continue
    base="${img%.*}"
    echo "full raw skeleton: $img"
    ./analyze-full.py "$img" \
      --cell-size 8 \
      --max-cols 120 \
      --paper-background \
      --ramp fine20 \
      --edge-source raw \
      --thin-edges 1 \
      --skeletonize-edges 8 \
      --min-component-size 8 \
      --full-output "${base}-full-raw-skeleton.txt" \
      > "${base}-full-raw-skeleton.log"
  done
}

run_full_ink() {
  for img in "${circle_images[@]}"; do
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

case "$mode" in
  tight)
    run_edges_raw_tight
    ;;
  strict)
    run_edges_raw_strict
    ;;
  skeleton)
    run_edges_raw_skeleton
    ;;
  ink)
    run_edges_ink
    ;;
  full)
    run_full_raw_tight
    ;;
  full-strict)
    run_full_raw_strict
    ;;
  full-skeleton)
    run_full_raw_skeleton
    ;;
  full-ink)
    run_full_ink
    ;;
  all)
    run_edges_raw_tight
    run_edges_raw_strict
    run_edges_raw_skeleton
    run_edges_ink
    run_full_raw_tight
    run_full_raw_strict
    run_full_raw_skeleton
    run_full_ink
    ;;
  *)
    echo "usage: ./run-circle-comparison.sh [all|tight|strict|skeleton|ink|full|full-strict|full-skeleton|full-ink]" >&2
    exit 2
    ;;
esac
