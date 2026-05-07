#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export SMARTMIRROR_BACKEND_URL="${SMARTMIRROR_BACKEND_URL:-http://127.0.0.1:3001}"
export SMARTMIRROR_BACKEND_WS="${SMARTMIRROR_BACKEND_WS:-ws://127.0.0.1:3001}"

npm --prefix apps/backend run start &
backend_pid=$!

cleanup() {
  kill "$backend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 1
scripts/run-pi.sh
