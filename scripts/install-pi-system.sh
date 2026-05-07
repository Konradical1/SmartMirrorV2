#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Installing Raspberry Pi system packages for SmartMirrorV2..."
sudo apt update
sudo apt install -y \
  cmake ninja-build build-essential \
  qt6-base-dev qt6-declarative-dev qt6-declarative-dev-tools \
  qt6-websockets-dev \
  qml6-module-qtquick qml6-module-qtquick-window \
  qml6-module-qtquick-layouts qml6-module-qtwebsockets \
  ffmpeg sox alsa-utils python3-venv

echo
echo "Ensuring ${USER} can access Pi display and input devices..."
sudo usermod -aG video,render,input "$USER"

echo
echo "Building Qt display..."
cmake -S apps/pi-display -B apps/pi-display/build -G Ninja
cmake --build apps/pi-display/build --parallel 1

echo
echo "Done. Start the display with:"
echo "  log out and back in, or reboot the Pi, if this user was just added to groups"
echo "  cd /home/konrad/SmartMirrorV2"
echo "  npm run pi"
