#!/usr/bin/env bash
set -euo pipefail

UUID="ascii-overlay@local"

gnome-extensions enable "$UUID"
gnome-extensions info "$UUID"
