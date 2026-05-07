#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and fill it in before installing services." >&2
  exit 1
fi

if ! grep -qx 'SMARTMIRROR_BACKEND_URL=http://192.168.4.41:3001' .env; then
  echo "Pi .env must contain SMARTMIRROR_BACKEND_URL=http://192.168.4.41:3001" >&2
  exit 1
fi

if ! grep -qx 'SMARTMIRROR_BACKEND_WS=ws://192.168.4.41:3001' .env; then
  echo "Pi .env must contain SMARTMIRROR_BACKEND_WS=ws://192.168.4.41:3001" >&2
  exit 1
fi

npm --prefix apps/pi-voice install

sudo install -m 0644 deploy/systemd/smartmirror-pi-display.service /etc/systemd/system/smartmirror-pi-display.service
sudo install -m 0644 deploy/systemd/smartmirror-pi-voice.service /etc/systemd/system/smartmirror-pi-voice.service
sudo systemctl daemon-reload
sudo systemctl enable --now smartmirror-pi-display smartmirror-pi-voice

echo "Pi services installed."
echo "Logs:"
echo "  journalctl -fu smartmirror-pi-display"
echo "  journalctl -fu smartmirror-pi-voice"

