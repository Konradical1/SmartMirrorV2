import dotenv from 'dotenv';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshCalendar } from './handlers/calendar.js';
import { refreshSpotify, startSpotifyPolling } from './handlers/spotify.js';
import { refreshTodos } from './handlers/todo.js';
import { refreshWeather } from './handlers/weather.js';
import { buildJarvisContext, buildNowContext } from './jarvis/context.js';
import {
  jarvisFailureSpeech,
  publicJarvisErrorMessage,
  runJarvisTurn,
} from './jarvis/pipeline.js';
import {
  getPromptHistory,
  forgetSession,
  forgetTopic,
  loadMemory,
  memoryStats,
  setAutoRewriteEnabled,
  showFixes,
  summarizeLongTermMemory,
} from './services/memoryService.js';
import { state } from './state.js';
import { logger } from './utils/logger.js';
import { broadcastOverlay, broadcastVoiceStatus, attachWebSocket } from './websocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(repoRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '1mb' }));

app.get('/health', (request, response) => {
  response.json({
    ok: true,
    service: 'smartmirror-v2-backend',
    scene: state.currentScene,
    now: new Date().toISOString(),
  });
});

app.get('/context', (request, response) => {
  response.json({
    ok: true,
    context: buildJarvisContext(),
  });
});

app.post('/jarvis-command', async (request, response) => {
  try {
    const input = String(request.body?.input || request.body?.text || request.body?.transcript || '').trim();
    const history = Array.isArray(request.body?.history) ? request.body.history : [];
    const sessionId = String(request.body?.sessionId || request.body?.session_id || '').trim();
    const result = await runJarvisTurn(input, { history, broadcast: true, sessionId });
    response.json({
      ok: true,
      sessionId: result.sessionId,
      speech: result.speech,
      intent: result.intent,
      params: result.params,
      data: result.data ?? null,
      ui: result.ui ?? null,
      fast: result.fast,
      displayMs: result.displayMs,
      speechDisplayMs: result.speechDisplayMs,
    });
  } catch (error) {
    logger.error(error.message);
    const failureSpeech = error.publicSpeech || jarvisFailureSpeech(error);
    broadcastOverlay(failureSpeech);
    response.status(error.status || 500).json({
      ok: false,
      speech: failureSpeech,
      error: publicJarvisErrorMessage(error),
    });
  }
});

app.get('/admin/memory', async (request, response) => {
  try {
    response.json({
      ok: true,
      stats: await memoryStats(),
      summary: await summarizeLongTermMemory(),
    });
  } catch (error) {
    response.status(error.status || 500).json({ ok: false, error: publicJarvisErrorMessage(error) });
  }
});

app.get('/admin/memory/fixes', async (request, response) => {
  try {
    response.json({ ok: true, fixes: await showFixes() });
  } catch (error) {
    response.status(error.status || 500).json({ ok: false, error: publicJarvisErrorMessage(error) });
  }
});

app.delete('/admin/memory/session/:sessionId', async (request, response) => {
  try {
    response.json({ ok: true, forgotten: await forgetSession(request.params.sessionId) });
  } catch (error) {
    response.status(error.status || 500).json({ ok: false, error: publicJarvisErrorMessage(error) });
  }
});

app.delete('/admin/memory/topic', async (request, response) => {
  try {
    response.json({ ok: true, forgotten: await forgetTopic(request.query.q || request.body?.query || request.body?.topic) });
  } catch (error) {
    response.status(error.status || 500).json({ ok: false, error: publicJarvisErrorMessage(error) });
  }
});

app.get('/admin/prompts/history', async (request, response) => {
  try {
    response.json({ ok: true, history: await getPromptHistory() });
  } catch (error) {
    response.status(error.status || 500).json({ ok: false, error: publicJarvisErrorMessage(error) });
  }
});

app.post('/admin/prompts/auto-rewrite', async (request, response) => {
  try {
    const enabled = request.body?.enabled ?? request.body?.autoRewriteEnabled ?? true;
    response.json({ ok: true, meta: await setAutoRewriteEnabled(enabled) });
  } catch (error) {
    response.status(error.status || 500).json({ ok: false, error: publicJarvisErrorMessage(error) });
  }
});

app.post('/voice-status', (request, response) => {
  const status = typeof request.body?.status === 'string' ? request.body.status.trim().toLowerCase() : '';
  const text = typeof request.body?.text === 'string' ? request.body.text : '';
  const phase = typeof request.body?.phase === 'string' ? request.body.phase.trim().toLowerCase() : '';
  const source = typeof request.body?.source === 'string' ? request.body.source.trim().toLowerCase() : '';
  const final = Boolean(request.body?.final);
  const displayMs = Number(request.body?.displayMs);
  const audioLevel = Number(request.body?.audioLevel);
  const allowedStatuses = new Set(['idle', 'wake_detected', 'listening', 'thinking', 'speaking', 'done', 'error']);

  if (!allowedStatuses.has(status)) {
    response.status(400).json({ ok: false, error: 'Invalid voice status.' });
    return;
  }

  broadcastVoiceStatus(status, text, {
    phase,
    source,
    final,
    ...(Number.isFinite(displayMs) && displayMs > 0 ? { displayMs } : {}),
    ...(Number.isFinite(audioLevel) ? { audioLevel: Math.max(0, Math.min(1, audioLevel)) } : {}),
  });
  response.json({ ok: true });
});

app.post('/context/refresh', async (request, response) => {
  try {
    const refreshed = await refreshMirrorContext();
    response.json({
      ok: true,
      refreshed,
      context: buildJarvisContext(),
    });
  } catch (error) {
    logger.error(error.message);
    response.status(error.status || 500).json({
      ok: false,
      error: error.publicMessage || error.message || 'Mirror context refresh failed.',
      context: buildJarvisContext(),
    });
  }
});

app.get('/time', (request, response) => {
  response.json({
    ok: true,
    time: buildNowContext(),
  });
});

attachWebSocket(server);

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    logger.error(
      `Port ${port} is already in use. Stop the process using it or start this backend on a different port, for example: PORT=3002 npm run backend`,
    );
    process.exit(1);
    return;
  }

  throw error;
});

server.listen(port, host, () => {
  logger.info(`SmartMirrorV2 backend listening on http://${host}:${port}`);
  warmContext();
  startSpotifyPolling();
});

function warmContext() {
  refreshMirrorContext().catch((error) => logger.error(error.message));

  setInterval(() => refreshWeather({}).catch((error) => logger.error(error.message)), 10 * 60 * 1000);
  setInterval(() => refreshCalendar({}).catch((error) => logger.error(error.message)), 5 * 60 * 1000);
  setInterval(() => refreshTodos().catch((error) => logger.error(error.message)), 60 * 1000);
}

async function refreshMirrorContext() {
  const tasks = {
    weather: () => refreshWeather({}),
    calendar: () => refreshCalendar({}),
    spotify: () => refreshSpotify(),
    todos: () => refreshTodos(),
    memory: () => loadMemory(),
  };

  const entries = await Promise.all(Object.entries(tasks).map(async ([key, task]) => {
    try {
      await task();
      return [key, { ok: true }];
    } catch (error) {
      logger.error(`${key} refresh failed: ${error.message}`);
      return [key, { ok: false, error: error.message }];
    }
  }));

  return Object.fromEntries(entries);
}
