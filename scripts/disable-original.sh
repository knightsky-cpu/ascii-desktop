#!/usr/bin/env bash
set -euo pipefail

UUID="original-grid-overlay@local"

gnome-extensions disable "$UUID"
gnome-extensions info "$UUID"
