#!/bin/bash
# Opens Better Clover KDS fullscreen and keeps the HDMI display awake.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -n "${DISPLAY:-}" ] && command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset -dpms || true
  xset s noblank || true
fi

export KDS_PORT="${KDS_PORT:-8787}"
exec npm start --prefix desktop -- --kiosk
