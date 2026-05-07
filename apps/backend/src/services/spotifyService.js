import fetch from 'node-fetch';

function basicAuth(id, secret) {
  return Buffer.from(`${id}:${secret}`).toString('base64');
}

export async function getSpotifyAccessToken() {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN, SPOTIFY_TOKEN } = process.env;
  if (SPOTIFY_TOKEN) return SPOTIFY_TOKEN;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) return null;

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth(SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) throw new Error(`Spotify token failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

export async function getNowPlaying() {
  const token = await getSpotifyAccessToken();
  if (!token) return null;

  const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 204) return { isPlaying: false };
  if (!response.ok) throw new Error(`Spotify now playing failed: ${response.status} ${await response.text()}`);

  const data = await response.json();
  const item = data.item;
  if (!item) return { isPlaying: false };

  const durationMs = item.duration_ms || 1;
  const progressMs = data.progress_ms || 0;

  return {
    isPlaying: Boolean(data.is_playing),
    service: 'Spotify',
    title: item.name || 'Unknown',
    artist: item.artists?.map((artist) => artist.name).join(', ') || item.show?.publisher || 'Unknown artist',
    progress: Math.round((progressMs / durationMs) * 100),
    progressMs,
    durationMs,
    receivedAt: Date.now(),
    elapsed: formatDuration(progressMs),
    duration: formatDuration(durationMs),
    albumArt: item.album?.images?.[0]?.url || item.images?.[0]?.url || '',
  };
}

export async function runSpotifyCommand(intent) {
  const token = await getSpotifyAccessToken();
  if (!token) throw new Error('Spotify is not configured.');

  const command = {
    SPOTIFY_NEXT: { url: 'https://api.spotify.com/v1/me/player/next', method: 'POST' },
    SPOTIFY_PREVIOUS: { url: 'https://api.spotify.com/v1/me/player/previous', method: 'POST' },
    SPOTIFY_PAUSE: { url: 'https://api.spotify.com/v1/me/player/pause', method: 'PUT' },
    SPOTIFY_PLAY: { url: 'https://api.spotify.com/v1/me/player/play', method: 'PUT' },
  }[intent];

  if (!command) return false;

  const response = await fetch(command.url, {
    method: command.method,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.ok) return true;
  if (response.status === 404) throw new Error('Spotify has no active playback device.');
  throw new Error(`Spotify command failed: ${response.status} ${await response.text()}`);
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
