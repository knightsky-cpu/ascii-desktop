#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="original-grid-overlay@local"
SOURCE_DIR="$ROOT_DIR/extension/$UUID"
TARGET_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "Extension source not found: $SOURCE_DIR" >&2
    exit 1
fi

mkdir -p "$(dirname "$TARGET_DIR")"
rm -rf "$TARGET_DIR"
cp -a "$SOURCE_DIR" "$TARGET_DIR"

if [[ -d "$TARGET_DIR/schemas" ]]; then
    glib-compile-schemas --strict "$TARGET_DIR/schemas"
fi

echo "Installed $UUID to $TARGET_DIR"
echo "Use scripts/enable-original.sh to enable it. On Wayland, log out and back in if GNOME does not see it yet."
