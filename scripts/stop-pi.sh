#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

pidfile="${SMARTMIRROR_PI_PIDFILE:-/tmp/smartmirror-v2-pi.pid}"
binary="apps/pi-display/build/smartmirror-pi-display"
patterns=(
  "$PWD/$binary"
  "$binary"
  "scripts/run-pi.sh"
)

pids=()
if [ -f "$pidfile" ]; then
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    pids+=("$pid")
  fi
fi

for pattern in "${patterns[@]}"; do
  while IFS= read -r pid; do
    [ -n "$pid" ] && pids+=("$pid")
  done < <(pgrep -f -- "$pattern" 2>/dev/null || true)
done

if [ "${#pids[@]}" -eq 0 ]; then
  rm -f "$pidfile"
  echo "SmartMirror Pi UI is not running."
  exit 0
fi

mapfile -t unique_pids < <(printf '%s
' "${pids[@]}" | awk '!seen[$0]++')
for pid in "${unique_pids[@]}"; do
  [ "$pid" = "$$" ] && continue
  kill -TERM "$pid" 2>/dev/null || true
done

sleep 2
for pid in "${unique_pids[@]}"; do
  [ "$pid" = "$$" ] && continue
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
done

rm -f "$pidfile"
echo "Stopped SmartMirror Pi UI."
