# SmartMirrorV2

SmartMirrorV2 splits the mirror into two lightweight roles:

- `apps/backend`: runs integrations, Jarvis routing, LLM calls, and shared state. Deploy this on `pinky@192.168.4.41`.
- `apps/pi-display`: native Qt Quick/QML fullscreen UI for the Raspberry Pi mirror.
- `apps/pi-voice`: Raspberry Pi wake-word, microphone capture, and speaker playback.

The Pi can still run the backend locally for testing. Production should run backend work on the garage i5 and keep the Pi focused on display/audio.

## Main Commands

Backend:

```bash
npm run backend
```

Pi display:

```bash
npm run pi
```

Pi voice:

```bash
npm run pi:voice
```

Local all-on-Pi testing:

```bash
npm run backend
npm run pi
```

In another terminal:

```bash
npm run pi:voice
```

Fast text test:

```bash
npm run test:chat -- --text "what's the weather"
npm run test:chat -- --text "what time is it"
```

Weather and time use deterministic fast routing and do not call the LLM.
