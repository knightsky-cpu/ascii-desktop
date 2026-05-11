#!/usr/bin/env bash
set -euo pipefail

ORIGINAL_UUID="original-grid-overlay@local"
ASCII_UUID="ascii-overlay@local"

if gnome-extensions info "$ASCII_UUID" >/dev/null 2>&1; then
    gnome-extensions disable "$ASCII_UUID" >/dev/null 2>&1 || true
fi

gnome-extensions enable "$ORIGINAL_UUID"
gnome-extensions info "$ORIGINAL_UUID"
