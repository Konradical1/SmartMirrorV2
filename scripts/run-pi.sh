#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

pidfile="${SMARTMIRROR_PI_PIDFILE:-/tmp/smartmirror-v2-pi.pid}"
binary="apps/pi-display/build/smartmirror-pi-display"

cleanup() {
  local pid="${child_pid:-}"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
}
trap cleanup EXIT INT TERM

if [ -x "$binary" ]; then
  if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ] && [ -z "${QT_QPA_PLATFORM:-}" ]; then
    desktop_display="${SMARTMIRROR_PI_DISPLAY:-:0}"
    desktop_number="${desktop_display#:}"
    desktop_number="${desktop_number%%.*}"
    desktop_socket="/tmp/.X11-unix/X${desktop_number}"

    if [ -S "$desktop_socket" ]; then
      export DISPLAY="$desktop_display"
      export QT_QPA_PLATFORM=xcb
      if [ -z "${XAUTHORITY:-}" ] && [ -f "$HOME/.Xauthority" ]; then
        export XAUTHORITY="$HOME/.Xauthority"
      fi
    else
      missing_groups=()
      for group in video render input; do
        if getent group "$group" >/dev/null 2>&1 && ! id -nG | tr ' ' '\n' | grep -qx "$group"; then
          missing_groups+=("$group")
        fi
      done

      if [ "${#missing_groups[@]}" -gt 0 ]; then
        printf 'Current login session is missing display device groups: %s\n' "${missing_groups[*]}" >&2
        printf 'Log out and back in, or reboot the Pi, then run npm run pi again.\n' >&2
        exit 1
      fi

      export QT_QPA_PLATFORM=eglfs
      export QT_QPA_EGLFS_INTEGRATION=eglfs_kms
      export QT_QPA_EGLFS_ALWAYS_SET_MODE=1
    fi
  fi

  "$binary" &
  child_pid=$!
  printf '%s
' "$child_pid" > "$pidfile"
  wait "$child_pid"
  exit $?
fi

echo "Pi display has not been built yet."
echo "Run: cmake -S apps/pi-display -B apps/pi-display/build -G Ninja && cmake --build apps/pi-display/build"
exit 1
