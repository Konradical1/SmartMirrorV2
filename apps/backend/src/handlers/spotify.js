import { getNowPlaying, runSpotifyCommand } from '../services/spotifyService.js';
import { setLastIntent, setScene, state, updateContext } from '../state.js';
import { broadcastAction, broadcastData } from '../websocket.js';
import { logger } from '../utils/logger.js';

let spotifyPollTimer;
const spotifyControlHistory = [];

export async function refreshSpotify() {
  const spotify = await getNowPlaying();
  if (spotify) {
    updateContext('spotify', spotify);
    broadcastData({ spotify });
  }
  return spotify;
}

export function startSpotifyPolling() {
  scheduleSpotifyPoll(2500);
}

export async function handleSpotify(params = {}) {
  setScene('spotify');
  setLastIntent('SHOW_SPOTIFY');
  broadcastAction('SHOW_SPOTIFY');
  const spotify = await refreshSpotify();
  return { ok: true, data: { spotify }, ui: { scene: 'spotify' } };
}

export async function handleSpotifyControl(intent, params = {}) {
  await runSpotifyCommand(intent, params);
  setScene('spotify');
  setLastIntent(intent);
  broadcastAction(intent);
  const spotify = await refreshSpotifyAfterControl(intent);
  const controlContext = recordSpotifyControl(intent, spotify);
  setTimeout(() => refreshSpotify().catch((error) => logger.error(error.message)), 1600);
  setTimeout(() => scheduleSpotifyPoll(2500), 1700);
  return { ok: true, data: { spotify, controlContext }, ui: { scene: 'spotify' } };
}

async function refreshSpotifyAfterControl(intent) {
  if (intent !== 'SPOTIFY_NEXT' && intent !== 'SPOTIFY_PREVIOUS') return state.context.spotify;

  await wait(650);
  let spotify = await refreshSpotify();
  if (spotify?.title) return spotify;

  await wait(850);
  spotify = await refreshSpotify();
  return spotify || state.context.spotify;
}

function scheduleSpotifyPoll(delayMs = nextSpotifyDelay()) {
  clearTimeout(spotifyPollTimer);
  spotifyPollTimer = setTimeout(async () => {
    try {
      await refreshSpotify();
    } catch (error) {
      logger.error(error.message);
    }
    scheduleSpotifyPoll();
  }, delayMs);
}

function nextSpotifyDelay() {
  const spotify = state.context.spotify;
  if (!spotify?.isPlaying || !spotify.durationMs || spotify.progressMs === undefined) return 5000;
  const liveProgressMs = Math.min(spotify.durationMs, spotify.progressMs + Math.max(0, Date.now() - (spotify.receivedAt || Date.now())));
  const remainingMs = spotify.durationMs - liveProgressMs;
  if (remainingMs <= 1000) return 700;
  if (remainingMs <= 5000) return 900;
  if (remainingMs <= 12000) return 1800;
  return 5000;
}

function recordSpotifyControl(intent, spotify) {
  const now = Date.now();
  const previous = spotifyControlHistory.at(-1);
  spotifyControlHistory.push({
    intent,
    title: spotify?.title || '',
    artist: spotify?.artist || '',
    at: now,
  });

  while (spotifyControlHistory.length && now - spotifyControlHistory[0].at > 45_000) {
    spotifyControlHistory.shift();
  }

  const recent = spotifyControlHistory.filter((entry) => entry.intent === 'SPOTIFY_NEXT' || entry.intent === 'SPOTIFY_PREVIOUS');
  const backAndForth = Boolean(
    previous
      && now - previous.at < 15_000
      && ((previous.intent === 'SPOTIFY_NEXT' && intent === 'SPOTIFY_PREVIOUS')
        || (previous.intent === 'SPOTIFY_PREVIOUS' && intent === 'SPOTIFY_NEXT')),
  );

  return {
    rapidSkips: recent.length,
    backAndForth,
    previousIntent: previous?.intent || null,
    previousTrack: previous?.title ? `${previous.title} by ${previous.artist || 'Unknown artist'}` : null,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
