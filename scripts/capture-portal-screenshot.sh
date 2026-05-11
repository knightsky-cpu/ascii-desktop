#!/usr/bin/env bash
set -euo pipefail

OUTPUT="${1:-/tmp/ascii-desktop-capture.png}"
TIMEOUT_SECONDS="${2:-120}"
INTERACTIVE="${3:-true}"

if [[ "$INTERACTIVE" != "true" && "$INTERACTIVE" != "false" ]]; then
    echo "interactive must be true or false" >&2
    exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT"

MONITOR_LOG="$(mktemp)"
trap 'rm -f "$MONITOR_LOG"' EXIT

echo "Starting portal response monitor..." >&2
dbus-monitor \
    --session \
    "type='signal',sender='org.freedesktop.portal.Desktop',interface='org.freedesktop.portal.Request',member='Response'" >"$MONITOR_LOG" &
MONITOR_PID="$!"

echo "Requesting portal screenshot; approve any desktop prompt if shown..." >&2
REQUEST_OUTPUT="$(
    timeout "$TIMEOUT_SECONDS" gdbus call \
        --session \
        --dest org.freedesktop.portal.Desktop \
        --object-path /org/freedesktop/portal/desktop \
        --method org.freedesktop.portal.Screenshot.Screenshot \
        "" \
        "{'interactive': <$INTERACTIVE>}"
)"

REQUEST_PATH="$(printf '%s\n' "$REQUEST_OUTPUT" | grep -o "/org/freedesktop/portal/desktop/request/[^']*" | head -n 1)"

if [[ -z "$REQUEST_PATH" ]]; then
    echo "Could not parse portal request path from: $REQUEST_OUTPUT" >&2
    kill "$MONITOR_PID" 2>/dev/null || true
    wait "$MONITOR_PID" 2>/dev/null || true
    exit 1
fi

echo "Waiting for portal response on $REQUEST_PATH..." >&2

URI=""
for _ in $(seq 1 "$((TIMEOUT_SECONDS * 10))"); do
    if grep -q "$REQUEST_PATH" "$MONITOR_LOG"; then
        URI="$(grep -A 20 "$REQUEST_PATH" "$MONITOR_LOG" | grep -o "file://[^' >)]*" | tail -n 1 || true)"
        break
    fi
    sleep 0.1
done

kill "$MONITOR_PID" 2>/dev/null || true
wait "$MONITOR_PID" 2>/dev/null || true

if [[ -z "$URI" ]]; then
    echo "Portal screenshot did not return a file URI. It may have been cancelled, denied, or timed out." >&2
    echo "Portal monitor log:" >&2
    cat "$MONITOR_LOG" >&2
    exit 1
fi

SOURCE_PATH="$(python3 - "$URI" <<'PY'
import sys
from urllib.parse import unquote, urlparse

parsed = urlparse(sys.argv[1])
if parsed.scheme != "file":
    raise SystemExit(f"unsupported URI scheme: {parsed.scheme}")
print(unquote(parsed.path))
PY
)"

if [[ ! -s "$SOURCE_PATH" ]]; then
    echo "Portal returned missing or empty screenshot: $SOURCE_PATH" >&2
    exit 1
fi

cp "$SOURCE_PATH" "$OUTPUT"
echo "$OUTPUT"
