#!/usr/bin/env bash
set -euo pipefail

journalctl --user -f -o cat /usr/bin/gnome-shell
