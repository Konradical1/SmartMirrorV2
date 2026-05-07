# Raspberry Pi Setup

The Pi runs the display, wake word, microphone, and speaker. Backend work should run on `pinky@192.168.4.41` in production.

## Install System Packages

```bash
sudo apt update
sudo apt install -y \
  build-essential cmake ninja-build \
  qt6-base-dev qt6-declarative-dev qt6-declarative-dev-tools \
  qt6-websockets-dev \
  qml6-module-qtquick qml6-module-qtquick-window \
  qml6-module-qtquick-layouts qml6-module-qtwebsockets \
  ffmpeg sox alsa-utils python3-venv
```

## Install Node Packages

```bash
cd ~/SmartMirrorV2
cp .env.example .env
npm --prefix apps/pi-voice install
```

Set backend URLs in `.env`:

```bash
SMARTMIRROR_BACKEND_URL=http://192.168.4.41:3001
SMARTMIRROR_BACKEND_WS=ws://192.168.4.41:3001
```

For local testing on the Pi:

```bash
SMARTMIRROR_BACKEND_URL=http://127.0.0.1:3001
SMARTMIRROR_BACKEND_WS=ws://127.0.0.1:3001
```

## Python Voice Environment

```bash
cd ~/SmartMirrorV2/apps/pi-voice
python3 -m venv .venv-voice
.venv-voice/bin/pip install -r ../../../SmartMirror/mirror-server/requirements-voice.txt
```

## Build Display

```bash
cd ~/SmartMirrorV2
cmake -S apps/pi-display -B apps/pi-display/build -G Ninja
cmake --build apps/pi-display/build
```

## Display Permissions

The fullscreen Pi display uses Qt's direct DRM/KMS backend when it is not running inside a desktop session. Make sure your user can access the display devices:

```bash
sudo usermod -aG video,render,input "$USER"
```

Then log out and back in, or reboot the Pi, before starting the display.

## Run Display

```bash
npm run pi
```

When the Pi desktop is already visible, `npm run pi` targets the existing `:0` display from SSH and opens the mirror fullscreen there.

For kiosk/fullscreen deployment without desktop interaction, run the display under the Pi's direct Qt platform setup. Stop the desktop first, or boot to console, then run:

```bash
QT_QPA_PLATFORM=eglfs npm run pi
```

## Run Voice

```bash
npm run pi:voice
```

The microphone and speaker stay on the Pi. The Pi sends the transcript to the backend and plays the returned Jarvis speech.

Set `AUDIO_DEVICE=auto` in `.env` to prefer a non-Rode USB capture device when one is connected. If you need to pin a specific ALSA input, use a value like `plughw:CARD=CMTECK,DEV=0` or `plughw:2,0`.
