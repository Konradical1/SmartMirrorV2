#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

if [ "$(id -un)" != "pinky" ]; then
  echo "Run this script on Pinky as the pinky user." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "Missing .env. Copy the Pi .env to /home/pinky/SmartMirrorV2/.env before installing." >&2
  exit 1
fi

npm --prefix apps/backend install

sudo install -m 0644 deploy/systemd/smartmirror-backend.service /etc/systemd/system/smartmirror-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now smartmirror-backend

echo "Backend service installed."
echo "Health check:"
echo "  curl http://127.0.0.1:3001/health"
echo "Logs:"
echo "  journalctl -fu smartmirror-backend"

