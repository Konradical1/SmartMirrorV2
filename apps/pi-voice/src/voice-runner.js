#!/usr/bin/env node

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';
import {
  appendHistoryLocal,
  pcmToWav,
  recordAudioWithOptions,
  speakWithTtsProvider,
  transcribeAudio,
  transcriptIsUsable,
  waitForWakeWordUtterance,
} from './voiceTools.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(repoRoot, '.env'), override: true });
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: false });

const args = process.argv.slice(2);
const once = args.includes('--once');
const noWake = args.includes('--no-wake');
const noPlay = args.includes('--no-play') || args.includes('--no-tts');
const backendBaseUrl = (process.env.SMARTMIRROR_BACKEND_URL || 'http://192.168.4.41:3001').replace(/\/$/, '');
const sttProvider = readFlag('--stt').value || process.env.STT_PROVIDER || 'deepgram';
const sttModel = readFlag('--stt-model').value || process.env.STT_MODEL || process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';
const ttsProvider = String(readFlag('--tts').value || process.env.TTS_PROVIDER || 'inworld').toLowerCase();
const voiceId = readFlag('--voice-id').value || (
  ttsProvider === 'inworld'
    ? process.env.INWORLD_VOICE_ID || 'Craig'
    : process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'
);
const recordMs = Number(
  readFlag('--record-ms').value
  || process.env.VOICE_CHAT_MAX_RECORD_MS
  || process.env.VOICE_CHAT_RECORD_MS
  || process.env.VOICE_RECORD_MS
  || 20000,
);
const frameMs = Number(process.env.VOICE_FRAME_MS || 80);
const legacySilenceFrames = readFlag('--silence-frames').value || process.env.VOICE_CHAT_SILENCE_FRAMES || process.env.VOICE_SILENCE_FRAMES || '';
const endSilenceMs = Number(
  readFlag('--end-silence-ms').value
  || process.env.VOICE_CHAT_END_SILENCE_MS
  || (legacySilenceFrames ? Number(legacySilenceFrames) * frameMs : '')
  || 700,
);
const quickEndSilenceMs = Number(readFlag('--quick-end-silence-ms').value || process.env.VOICE_CHAT_QUICK_END_SILENCE_MS || 520);
const quickEndAfterSpeechMs = Number(readFlag('--quick-end-after-speech-ms').value || process.env.VOICE_CHAT_QUICK_END_AFTER_SPEECH_MS || 1000);
const noSpeechTimeoutMs = Number(readFlag('--no-speech-timeout-ms').value || process.env.VOICE_CHAT_NO_SPEECH_TIMEOUT_MS || 4500);
const silenceThreshold = Number(readFlag('--silence-threshold').value || process.env.VOICE_CHAT_SILENCE_RMS || 0.012);
const conversationSilenceMs = Number(
  readFlag('--conversation-silence-ms').value
  || process.env.VOICE_CONVERSATION_SILENCE_MS
  || 5000,
);
const audioLevelUpdateMs = Number(process.env.VOICE_AUDIO_LEVEL_UPDATE_MS || 90);
let lastAudioLevelSentAt = 0;

const wakeOnlyPrompts = [
  'Ah, great. What do you want?',
  'Yes, Konrad?',
  'I am listening.',
  'What do you need?',
  'Go ahead.',
  'At your service.',
  'I heard you.',
  'Yes?',
  'What can I do?',
  'Ready.',
  'Standing by.',
  'Tell me.',
  'I am here.',
  'What is the move?',
  'How can I help?',
  'Yes, sir?',
  'Right here.',
  'What would you like?',
  'I have you.',
  'Go for it.',
  'What are we doing?',
  'Say the word.',
  'What is next?',
  'Listening now.',
  'How may I assist?',
  'All right, what do you need?',
  'Yes, Konrad. What would you like?',
];

logger.info(`backend ${backendBaseUrl}`);
logger.info(`mode ${noWake ? 'continuous' : 'wake-word'}`);
logger.info(`stt ${sttProvider} ${sttModel}`);
logger.info(`tts ${noPlay ? 'disabled' : `${ttsProvider} ${voiceId}`}`);
logger.info(`chat listening max ${recordMs}ms, end silence ${endSilenceMs}ms, quick ${quickEndSilenceMs}ms`);
logger.info(`conversation silence ${conversationSilenceMs}ms`);

while (true) {
  try {
    if (noWake) {
      await runConversationSession();
    } else {
      await postVoiceStatus('idle', '');
      const wakeTurn = await waitForWakeWordUtterance({
        onWake: () => postVoiceStatus('wake_detected', 'Jarvis'),
      });
      await runConversationSession({ initialPcm: wakeTurn.pcm, source: 'wake' });
    }
  } catch (error) {
    logger.error(error.message);
    await postVoiceStatus('error', error.message);
  }

  if (once || noWake) break;
}

async function runConversationSession({ initialPcm = null, source = '' } = {}) {
  let history = [];
  let silenceStartedAt = null;
  let queuedTurn = initialPcm?.length ? { pcm: initialPcm, source: source || 'wake' } : null;
  let turnCount = 0;
  let promptedForWakeOnly = false;

  logger.info(`conversation session started${source ? ` (${source})` : ''}`);

  while (true) {
    const turnLabel = `turn ${++turnCount}`;
    let pcm = null;
    let queuedSource = '';

    if (queuedTurn?.pcm?.length) {
      pcm = queuedTurn.pcm;
      queuedSource = queuedTurn.source || '';
      queuedTurn = null;
      logger.info(`${turnLabel} audio ${pcm.length} bytes (${queuedSource || 'queued'})`);
    } else {
      await postVoiceStatus('listening', '');
      logger.info(`${turnLabel} listening until ${endSilenceMs}ms silence after speech`);
      pcm = await recordAudioWithOptions(recordMs, {
        endSilenceMs,
        quickEndSilenceMs,
        quickEndAfterSpeechMs,
        noSpeechTimeoutMs,
        silenceThreshold,
        onAudioChunk: (chunk) => publishAudioLevel('listening', chunk),
      });
      logger.info(`${turnLabel} audio ${pcm.length} bytes`);
    }

    const wav = await pcmToWav(pcm);
    const transcriptResult = await transcribeAudio(wav, {
      provider: sttProvider,
      sttModel,
      elevenLabsSttModel: sttModel,
    });
    const rawTranscript = String(transcriptResult.text || '').trim();
    const transcript = stripWakeInvocation(rawTranscript);

    const usableTranscript = transcript && transcriptIsUsable({ ...transcriptResult, text: transcript });
    if (!usableTranscript) {
      if (!promptedForWakeOnly && queuedSource === 'wake' && isWakeOnlyInvocation(rawTranscript)) {
        promptedForWakeOnly = true;
        silenceStartedAt = null;
        await playWakeOnlyPrompt();
        continue;
      }

      silenceStartedAt ||= Date.now();
      const elapsed = Date.now() - silenceStartedAt;
      logger.info(`${turnLabel} silence ${elapsed}ms`);
      if (elapsed >= conversationSilenceMs) {
        await postVoiceStatus('done', '');
        logger.info(`${turnLabel} conversation idle timeout`);
        return;
      }
      if (once) return;
      continue;
    }

    logger.info(`${turnLabel} you ${transcript}`);
    if (rawTranscript !== transcript) logger.info(`${turnLabel} raw ${rawTranscript}`);
    await postVoiceStatus('listening', transcript, {
      phase: 'final',
      source: transcriptResult.source || sttProvider,
      final: true,
    });
    await postVoiceStatus('thinking', transcript);

    const result = await postJarvisCommand(transcript, history);
    logger.info(`${turnLabel} intent ${result.intent}`);
    logger.info(`${turnLabel} params ${JSON.stringify(result.params || {})}`);
    logger.info(`${turnLabel} jarvis ${result.speech || '[empty]'}`);

    if (result.ok) history = appendHistoryLocal(history, transcript, result.speech);
    silenceStartedAt = null;

    if (result.speech) {
      await postVoiceStatus('speaking', result.speech, {
        displayMs: result.speechDisplayMs || result.displayMs,
      });
      if (!noPlay) {
        await speakWithTtsProvider(result.speech, {
          play: true,
          provider: ttsProvider,
          voiceId,
          onAudioChunk: (chunk) => publishAudioLevel('speaking', chunk, result.speech),
        });
      }
    }

    if (shouldEndConversation(result.intent, transcript)) {
      await postVoiceStatus('done', result.speech || 'Done');
      logger.info(`${turnLabel} conversation closed`);
      return;
    }

    silenceStartedAt = null;
    await postVoiceStatus('done', result.speech || '');
    if (once) return;
  }
}

async function postJarvisCommand(input, history = []) {
  const response = await fetch(`${backendBaseUrl}/jarvis-command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, history }),
  });

  const text = await response.text();
  const payload = parseJson(text) || {};
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || payload.speech || text || `HTTP ${response.status}`);
  }
  return payload;
}

async function postVoiceStatus(status, text = '', meta = {}) {
  try {
    await fetch(`${backendBaseUrl}/voice-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, text, ...meta }),
    });
  } catch (error) {
    logger.warn(`voice-status failed: ${error.message}`);
  }
}

async function playWakeOnlyPrompt() {
  const prompt = selectWakeOnlyPrompt();
  const configuredDisplayMs = Number(process.env.VOICE_WAKE_PROMPT_DISPLAY_MS || 2800);
  logger.info(`wake prompt ${prompt}`);
  await postVoiceStatus('speaking', prompt, {
    displayMs: Number.isFinite(configuredDisplayMs) ? Math.max(2200, configuredDisplayMs) : 2800,
  });

  if (!noPlay) {
    await speakWithTtsProvider(prompt, {
      play: true,
      provider: ttsProvider,
      voiceId,
      onAudioChunk: (chunk) => publishAudioLevel('speaking', chunk, prompt),
    });
  }

  await postVoiceStatus('listening', '');
}

function selectWakeOnlyPrompt() {
  const configured = String(process.env.VOICE_WAKE_PROMPTS || '')
    .split('|')
    .map((prompt) => prompt.trim())
    .filter(Boolean);
  const prompts = configured.length ? configured : wakeOnlyPrompts;
  return prompts[Math.floor(Math.random() * prompts.length)];
}

function publishAudioLevel(status, chunk, text = '') {
  const now = Date.now();
  if (now - lastAudioLevelSentAt < audioLevelUpdateMs) return;
  lastAudioLevelSentAt = now;
  postVoiceStatus(status, text, {
    audioLevel: pcmLevel(chunk),
  });
}

function pcmLevel(chunk) {
  if (!chunk?.length) return 0;
  let sumSquares = 0;
  const samples = Math.floor(chunk.length / 2);
  if (!samples) return 0;
  for (let index = 0; index < chunk.length - 1; index += 2) {
    const sample = chunk.readInt16LE(index) / 32768;
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / samples);
  return Math.max(0, Math.min(1, (rms - 0.004) / 0.055));
}

function readFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return { present: false, value: '' };
  const next = args[index + 1];
  if (!next || next.startsWith('--')) return { present: true, value: '' };
  return { present: true, value: next };
}

function stripWakeInvocation(text) {
  return String(text || '')
    .replace(/^\s*(?:(?:hey|hi|hello|okay|ok)[\s,]+)?jarvis\b[\s,.:;-]*/i, '')
    .trim();
}

function isWakeOnlyInvocation(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  return !stripWakeInvocation(raw);
}

function shouldEndConversation(intent, transcript) {
  return String(intent || '').trim().toUpperCase() === 'END_CONVERSATION'
    || /\b(goodbye|bye|done with you|that'?s all|that is all|all set|we'?re done|we are done|you can stop|stop conversation)\b/i.test(String(transcript || ''));
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
