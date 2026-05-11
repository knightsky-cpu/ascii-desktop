#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="ascii-overlay@local"
MODE_FILE="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/ascii-overlay-luminance-mode"

gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
"$ROOT_DIR/scripts/installascii.sh"
mkdir -p "$(dirname "$MODE_FILE")"
printf 'fine20\n' > "$MODE_FILE"
gnome-extensions enable "$UUID"
gnome-extensions info "$UUID"
