# SmartMirror Deployment

Production runs the backend on Pinky and leaves the Raspberry Pi focused on display and voice.

## Pinky Backend

```bash
cd /home/pinky/SmartMirrorV2
deploy/scripts/install-pinky-backend.sh
```

Health checks:

```bash
systemctl status smartmirror-backend
curl http://127.0.0.1:3001/health
```

From the Pi:

```bash
curl http://192.168.4.41:3001/health
```

## Raspberry Pi Display And Voice

The Pi `.env` must point at Pinky:

```bash
SMARTMIRROR_BACKEND_URL=http://192.168.4.41:3001
SMARTMIRROR_BACKEND_WS=ws://192.168.4.41:3001
```

Install and start services:

```bash
cd /home/konrad/SmartMirrorV2
deploy/scripts/install-pi-services.sh
```

Checks:

```bash
systemctl status smartmirror-pi-display smartmirror-pi-voice
journalctl -fu smartmirror-pi-display
journalctl -fu smartmirror-pi-voice
```

## Cockpit Monitoring

Install Cockpit on both machines:

```bash
sudo apt install cockpit
sudo systemctl enable --now cockpit.socket
```

Open from the LAN:

- Pi: `https://192.168.4.195:9090`
- Pinky: `https://192.168.4.41:9090`

Live logs:

```bash
journalctl -fu smartmirror-backend
journalctl -fu smartmirror-pi-display
journalctl -fu smartmirror-pi-voice
```

Restart commands:

```bash
sudo systemctl restart smartmirror-backend
sudo systemctl restart smartmirror-pi-display
sudo systemctl restart smartmirror-pi-voice
```
