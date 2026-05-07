# Backend Setup

Target machine: `pinky@192.168.4.41`

## Install

```bash
cd ~/SmartMirrorV2
cp .env.example .env
npm --prefix apps/backend install
```

Fill in `.env` with provider keys for Spotify, Google Calendar, Notion, weather, and the selected LLM provider.

## Run

```bash
npm run backend
```

Health check:

```bash
curl http://192.168.4.41:3001/health
```

Fast-path check:

```bash
npm run test:chat -- --text "what's the weather"
npm run test:chat -- --text "what time is it"
```

## Backend Responsibilities

- Weather, calendar, Spotify, Notion/todos, memory
- LLM routing and response generation for non-fast-path requests
- WebSocket state stream for the Pi display
- HTTP command API for the Pi voice runner

Weather and time bypass the LLM.
