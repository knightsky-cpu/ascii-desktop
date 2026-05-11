#!/usr/bin/env bash
set -euo pipefail

UUID="ascii-overlay@local"

gnome-extensions disable "$UUID"
gnome-extensions info "$UUID"
