#!/usr/bin/env bash
set -euo pipefail

UUID="ascii-overlay@local"
MODE_FILE="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/ascii-overlay-luminance-mode"

gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
rm -f "$MODE_FILE"
gnome-extensions info "$UUID"
