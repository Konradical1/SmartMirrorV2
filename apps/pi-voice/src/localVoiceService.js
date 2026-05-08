import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import Mic from 'mic';
import WavEncoder from 'wav-encoder';
import fetch from 'node-fetch';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const SAMPLE_WIDTH_BYTES = 2;
let cachedAudioDevice;
let cachedVoiceRuntimeConfig = null;

/**
 * Record audio from microphone for specified duration
 * @param {number} durationMs - Duration to record in milliseconds
 * @returns {Promise<Buffer>} Raw PCM audio buffer
 */
export async function recordAudio(durationMs = 10000) {
  return recordAudioWithOptions(durationMs, {});
}

export async function waitForWakeWord(options = {}) {
  const result = await waitForWakeWordUtterance(options);
  return result.wake;
}

export async function waitForWakeWordUtterance(options = {}) {
  return new Promise((resolve, reject) => {
    const config = voiceRuntimeConfig();
    const pythonBin = resolveVoicePython();
    const detectorPath = path.resolve(__dirname, '../scripts/openwakeword-stdin-detector.py');
    const timeoutMs = Number(options.timeoutMs || process.env.VOICE_WAKE_TIMEOUT_MS || 0);
    const frameMs = Number(options.frameMs || config.frameMs);
    const frameBytes = Math.floor(SAMPLE_RATE * frameMs / 1000 * SAMPLE_WIDTH_BYTES);
    const preRollMs = Number(options.preRollMs || config.wakePreRollMs);
    const maxCaptureMs = Number(options.maxCaptureMs || config.wakeMaxCaptureMs);
    const minCaptureMs = Number(options.minCaptureMs || config.wakeMinCaptureMs);
    const silenceMs = Number(options.silenceMs || config.wakeSilenceMs);
    const silenceThreshold = Number(options.silenceThreshold || config.wakeSilenceThreshold);
    const preRollFrameCount = Math.max(1, Math.ceil(preRollMs / frameMs));
    const maxCaptureFrames = Math.max(1, Math.ceil(maxCaptureMs / frameMs));
    const minCaptureFrames = Math.max(1, Math.ceil(minCaptureMs / frameMs));
    const silenceFrameLimit = Math.max(1, Math.ceil(silenceMs / frameMs));
    let settled = false;
    let timeout = null;
    let pending = Buffer.alloc(0);
    let awake = false;
    let wakeEvent = null;
    let capturedFrames = [];
    let preRollFrames = [];
    let silenceFrames = 0;
    let fastTranscriber = createFastTranscriber({
      onPartial: options.onInterimTranscript,
      onFinal: options.onFastFinalTranscript,
      warm: true,
    });

    logger.info('Listening for wake word...');

    const detector = spawn(pythonBin, [detectorPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(options.threshold ? { VOICE_WAKE_THRESHOLD: String(options.threshold) } : {}),
      },
    });

    const micInstance = new Mic({
      rate: SAMPLE_RATE,
      channels: CHANNELS,
      exitOnSilence: 0,
      debug: false,
      device: resolveAudioInputDevice(options.device),
    });
    const micStream = micInstance.getAudioStream();

    function finish(error, payload) {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener?.('abort', abortHandler);
      try {
        micInstance.stop();
      } catch {
        // Already stopped.
      }
      try {
        detector.stdin.end();
      } catch {
        // Detector may already be gone.
      }
      if (!detector.killed) detector.kill();
      fastTranscriber?.close();
      if (error) reject(error);
      else resolve(payload);
    }

    function abortHandler() {
      finish(new Error('Wake word wait aborted.'));
    }

    function finishCapture() {
      finish(null, {
        wake: wakeEvent,
        pcm: Buffer.concat(capturedFrames),
      });
    }

    function processFrame(frame) {
      if (!awake) {
        preRollFrames.push(frame);
        if (preRollFrames.length > preRollFrameCount) preRollFrames.shift();
      } else {
        capturedFrames.push(frame);
        fastTranscriber?.push(frame);
        silenceFrames = frameRms(frame) < silenceThreshold ? silenceFrames + 1 : 0;

        if (
          capturedFrames.length >= maxCaptureFrames
          || (capturedFrames.length >= minCaptureFrames && silenceFrames >= silenceFrameLimit)
        ) {
          finishCapture();
        }
      }
    }

    let stdoutBuffer = '';
    detector.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.type === 'ready') {
          logger.info(`Wake listener ready: ${event.model} threshold ${event.threshold}`);
        } else if (event.type === 'wake') {
          logger.info(`Wake detected: ${event.model} score ${Number(event.score).toFixed(3)}`);
          awake = true;
          wakeEvent = event;
          capturedFrames = [...preRollFrames];
          silenceFrames = 0;
          options.onWake?.(event);
          for (const frame of capturedFrames) fastTranscriber.push(frame);
        } else if (event.type === 'error') {
          finish(new Error(`Wake word detector failed: ${event.error}`));
        }
      }
    });

    detector.stderr.on('data', (chunk) => {
      const lines = chunk.toString('utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const visibleLines = lines.filter((line) => !shouldSuppressWakeDetectorWarning(line));
      if (visibleLines.length) logger.warn(`Wake detector: ${visibleLines.join('\n')}`);
    });

    detector.stdin.on('error', (error) => {
      if (!settled && error.code !== 'EPIPE') finish(error);
    });

    detector.on('error', (error) => finish(error));
    detector.on('exit', (code) => {
      if (!settled && code !== 0) finish(new Error(`Wake word detector exited with code ${code}`));
    });

    micStream.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= frameBytes) {
        const frame = pending.subarray(0, frameBytes);
        pending = pending.subarray(frameBytes);
        processFrame(frame);
      }

      if (detector.stdin.writable) {
        detector.stdin.write(chunk);
      }
    });

    micStream.on('error', (error) => finish(error));
    micInstance.start();

    if (options.signal?.aborted) {
      abortHandler();
      return;
    }
    options.signal?.addEventListener?.('abort', abortHandler, { once: true });

    if (timeoutMs > 0) {
      timeout = setTimeout(() => finish(new Error(`Wake word timed out after ${timeoutMs}ms`)), timeoutMs);
    }
  });
}

function shouldSuppressWakeDetectorWarning(line) {
  return line.includes('[W:onnxruntime:Default, device_discovery.cc')
    || line.includes('Specified provider \'CUDAExecutionProvider\' is not in available provider names')
    || line === 'warnings.warn(';
}

function frameRms(frame) {
  let sumSquares = 0;
  const samples = Math.floor(frame.length / 2);
  if (!samples) return 0;
  for (let index = 0; index < frame.length; index += 2) {
    const sample = frame.readInt16LE(index) / 32768;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples);
}

export function createFastTranscriber({
  onPartial,
  onFinal,
  enabled = process.env.VOICE_FAST_STT !== 'false',
  warm = false,
} = {}) {
  if (!warm && !onPartial && !onFinal) return nullTranscriber();
  if (!enabled) return nullTranscriber();

  const provider = (process.env.VOICE_FAST_STT || 'vosk').trim().toLowerCase();
  if (provider !== 'vosk') {
    logger.warn(`Unsupported fast STT provider "${provider}". Interim transcript disabled.`);
    return nullTranscriber();
  }

  const pythonBin = resolveVoicePython();
  const scriptPath = path.resolve(__dirname, '../scripts/vosk-stream-stt.py');
  let proc = null;
  let ready = false;
  let disabled = false;
  let stdoutBuffer = '';

  function disable(reason = '') {
    if (disabled) return;
    disabled = true;
    if (reason) logger.warn(reason);
    try {
      proc?.stdin.end();
    } catch {
      // Already closed.
    }
    if (proc && !proc.killed) proc.kill();
  }

  try {
    proc = spawn(pythonBin, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
  } catch (error) {
    logger.warn(`Fast STT unavailable: ${error.message}`);
    return nullTranscriber();
  }

  proc.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event.type === 'ready') {
        ready = true;
        logger.info('Fast STT ready: Vosk');
      } else if (event.type === 'partial' && event.text) {
        onPartial?.(event.text);
      } else if (event.type === 'final' && event.text) {
        onFinal?.(event.text);
      } else if (event.type === 'error') {
        disable(`Fast STT disabled: ${event.error}`);
      }
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8').trim();
    if (text) logger.warn(`Fast STT: ${text}`);
  });

  proc.stdin.on('error', (error) => {
    if (error.code !== 'EPIPE') disable(`Fast STT failed: ${error.message}`);
  });

  proc.on('error', (error) => disable(`Fast STT failed: ${error.message}`));
  proc.on('exit', (code) => {
    if (!disabled && code && !ready) disable(`Fast STT exited before ready with code ${code}`);
  });

  return {
    push(chunk) {
      if (!disabled && proc?.stdin.writable) proc.stdin.write(chunk);
    },
    close() {
      disable();
    },
  };
}

function nullTranscriber() {
  return {
    push() {},
    close() {},
  };
}

function voiceRuntimeConfig() {
  cachedVoiceRuntimeConfig ||= {
    frameMs: Number(process.env.VOICE_FRAME_MS || 80),
    wakePreRollMs: Number(process.env.VOICE_PRE_ROLL_MS || 1200),
    wakeMaxCaptureMs: Number(process.env.VOICE_WAKE_UTTERANCE_MAX_MS || 20000),
    wakeMinCaptureMs: Number(process.env.VOICE_WAKE_UTTERANCE_MIN_MS || 700),
    wakeSilenceMs: Number(process.env.VOICE_WAKE_UTTERANCE_SILENCE_MS || 900),
    wakeSilenceThreshold: Number(process.env.VOICE_WAKE_SILENCE_RMS || 0.012),
    recordEndSilenceMs: Number(process.env.VOICE_CHAT_END_SILENCE_MS || process.env.VOICE_END_SILENCE_MS || 700),
    recordQuickEndSilenceMs: Number(process.env.VOICE_CHAT_QUICK_END_SILENCE_MS || process.env.VOICE_QUICK_END_SILENCE_MS || 520),
    recordQuickEndAfterSpeechMs: Number(process.env.VOICE_CHAT_QUICK_END_AFTER_SPEECH_MS || process.env.VOICE_QUICK_END_AFTER_SPEECH_MS || 1000),
    recordMinSpeechMs: Number(process.env.VOICE_MIN_SPEECH_MS || 160),
    recordPreRollMs: Number(process.env.VOICE_RECORD_PRE_ROLL_MS || 400),
    recordSilenceThreshold: Number(process.env.VOICE_CHAT_SILENCE_RMS || process.env.VOICE_SILENCE_RMS || 0.012),
  };
  return cachedVoiceRuntimeConfig;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 0, label = 'request') {
  const timeout = Number(timeoutMs);
  const upstreamSignal = options.signal;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeout);
  if (upstreamSignal?.aborted) abort();
  upstreamSignal?.addEventListener?.('abort', abort, { once: true });

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted && !upstreamSignal?.aborted) {
      throw new Error(`${label} timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener?.('abort', abort);
  }
}

/**
 * Record audio from microphone with explicit options.
 * @param {number} durationMs - Maximum duration in milliseconds
 * @param {Object} options - Recording options
 * @returns {Promise<Buffer>} Raw PCM audio buffer
 */
export async function recordAudioWithOptions(durationMs = 10000, options = {}) {
  return new Promise((resolve, reject) => {
    const config = voiceRuntimeConfig();
    const chunks = [];
    const frameMs = Number(options.frameMs ?? config.frameMs);
    const frameBytes = Math.max(2, Math.floor(SAMPLE_RATE * frameMs / 1000 * SAMPLE_WIDTH_BYTES));
    const maxRecordMs = Number(options.maxRecordMs ?? options.recordMs ?? process.env.VOICE_RECORD_MS ?? durationMs);
    const noSpeechTimeoutMs = Number(options.noSpeechTimeoutMs ?? process.env.VOICE_NO_SPEECH_TIMEOUT_MS ?? 4500);
    const endSilenceMs = Number(
      options.endSilenceMs
      ?? (options.silenceFrames != null ? Number(options.silenceFrames) * frameMs : undefined)
      ?? config.recordEndSilenceMs,
    );
    const quickEndSilenceMs = Number(options.quickEndSilenceMs ?? config.recordQuickEndSilenceMs);
    const quickEndAfterSpeechMs = Number(options.quickEndAfterSpeechMs ?? config.recordQuickEndAfterSpeechMs);
    const minSpeechMs = Number(options.minSpeechMs ?? config.recordMinSpeechMs);
    const preRollMs = Number(options.preRollMs ?? config.recordPreRollMs);
    const silenceThreshold = Number(options.silenceThreshold ?? config.recordSilenceThreshold);
    const endSilenceFrames = Math.max(1, Math.ceil(endSilenceMs / frameMs));
    const quickEndSilenceFrames = Math.max(1, Math.ceil(quickEndSilenceMs / frameMs));
    const quickEndAfterSpeechFrames = Math.max(1, Math.ceil(quickEndAfterSpeechMs / frameMs));
    const minSpeechFrames = Math.max(1, Math.ceil(minSpeechMs / frameMs));
    const preRollFrameCount = Math.max(0, Math.ceil(preRollMs / frameMs));
    let pending = Buffer.alloc(0);
    let preRollFrames = [];
    let speechStarted = false;
    let speechFrames = 0;
    let trailingSilenceFrames = 0;
    let settled = false;
    let maxTimeout = null;
    let noSpeechTimeout = null;

    logger.info('Starting microphone recording...');

    const homebrewRec = '/opt/homebrew/bin/rec';
    const intelRec = '/usr/local/bin/rec';
    const recPrefix = fs.existsSync(homebrewRec) ? '/opt/homebrew/bin' : fs.existsSync(intelRec) ? '/usr/local/bin' : null;
    if (recPrefix && !process.env.PATH?.includes(recPrefix)) {
      process.env.PATH = `${recPrefix}:${process.env.PATH || ''}`;
    }

    const micInstance = new Mic({
      rate: SAMPLE_RATE,
      channels: CHANNELS,
      exitOnSilence: 0,
      debug: false,
      device: resolveAudioInputDevice(options.device),
    });

    const micStream = micInstance.getAudioStream();

    function stopRecording(reason) {
      if (settled) return;
      settled = true;
      logger.info(`Stopping microphone recording: ${reason}`);
      try {
        micInstance.stop();
      } catch {
        // Already stopped.
      }
    }

    function processFrame(frame) {
      if (settled) return;
      const rms = frameRms(frame);
      const hasSpeech = rms >= silenceThreshold;

      if (!speechStarted) {
        if (hasSpeech) {
          speechStarted = true;
          speechFrames = 1;
          chunks.push(...preRollFrames, frame);
          preRollFrames = [];
          if (noSpeechTimeout) {
            clearTimeout(noSpeechTimeout);
            noSpeechTimeout = null;
          }
        } else if (preRollFrameCount > 0) {
          preRollFrames.push(frame);
          if (preRollFrames.length > preRollFrameCount) preRollFrames.shift();
        }
        return;
      }

      chunks.push(frame);
      if (hasSpeech) {
        speechFrames += 1;
        trailingSilenceFrames = 0;
        return;
      }

      trailingSilenceFrames += 1;
      const requiredSilenceFrames = speechFrames >= quickEndAfterSpeechFrames
        ? quickEndSilenceFrames
        : endSilenceFrames;
      if (speechFrames >= minSpeechFrames && trailingSilenceFrames >= requiredSilenceFrames) {
        const silenceMs = requiredSilenceFrames * frameMs;
        stopRecording(`${silenceMs}ms silence after speech`);
      }
    }
    
    micStream.on('data', (chunk) => {
      if (settled) return;
      options.onAudioChunk?.(chunk);
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= frameBytes) {
        const frame = Buffer.from(pending.subarray(0, frameBytes));
        pending = pending.subarray(frameBytes);
        processFrame(frame);
      }
    });

    micStream.on('error', (err) => {
      logger.error('Recording error:', err.message);
      if (maxTimeout) clearTimeout(maxTimeout);
      if (noSpeechTimeout) clearTimeout(noSpeechTimeout);
      try {
        micInstance.stop();
      } catch {
        // Already stopped.
      }
      reject(err);
    });

    micInstance.start();

    maxTimeout = setTimeout(() => {
      stopRecording(`${maxRecordMs}ms safety limit`);
    }, maxRecordMs);

    if (noSpeechTimeoutMs > 0) {
      noSpeechTimeout = setTimeout(() => {
        stopRecording(`${noSpeechTimeoutMs}ms without speech`);
      }, noSpeechTimeoutMs);
    }

    micStream.on('end', () => {
      if (maxTimeout) clearTimeout(maxTimeout);
      if (noSpeechTimeout) clearTimeout(noSpeechTimeout);
      const audioBuffer = Buffer.concat(chunks);
      logger.info(`Recording complete: ${audioBuffer.length} bytes`);
      resolve(audioBuffer);
    });
  });
}

function resolveVoicePython() {
  if (process.env.VOICE_PYTHON) return process.env.VOICE_PYTHON;
  const venvPython = path.resolve(__dirname, '../.venv-voice/bin/python');
  if (fs.existsSync(venvPython)) return venvPython;
  return 'python3';
}

function resolveAudioInputDevice(overrideDevice = '') {
  const explicitDevice = normalizeAudioDevice(overrideDevice);
  if (explicitDevice) return explicitDevice;

  const configuredDevice = normalizeAudioDevice(process.env.AUDIO_DEVICE);
  if (configuredDevice) return configuredDevice;

  if (cachedAudioDevice !== undefined) return cachedAudioDevice;

  const usbDevice = detectUsbCaptureDevice();
  cachedAudioDevice = usbDevice;

  if (usbDevice) {
    logger.info(`Using USB audio input device: ${usbDevice}`);
  } else {
    logger.warn('No non-Rode USB capture device found; using the system default audio input.');
  }

  return usbDevice || undefined;
}

function normalizeAudioDevice(value) {
  const device = String(value ?? '').trim();
  if (!device || device.toLowerCase() === 'auto') return '';
  return device;
}

function detectUsbCaptureDevice() {
  const result = spawnSync('arecord', ['-l'], { encoding: 'utf8' });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (output && !/no soundcards found/i.test(output)) {
    const device = detectUsbCaptureDeviceFromArecord(output);
    if (device) return device;
  }

  return detectUsbCaptureDeviceFromProc();
}

function detectUsbCaptureDeviceFromArecord(output) {
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^card\s+(\d+):.*\[(.+?)\].*device\s+(\d+):/i);
    if (!match) continue;
    const cardName = normalizeAudioLabel(match[2]);
    const fullLine = normalizeAudioLabel(line);
    if (isRodeAudioLabel(cardName) || isRodeAudioLabel(fullLine)) continue;
    if (cardName.includes('usb') || fullLine.includes('usb')) {
      return `plughw:${match[1]},${match[3]}`;
    }
  }

  return '';
}

function detectUsbCaptureDeviceFromProc() {
  let pcmOutput = '';
  try {
    pcmOutput = fs.readFileSync('/proc/asound/pcm', 'utf8');
  } catch {
    return '';
  }

  for (const line of pcmOutput.split(/\r?\n/)) {
    if (!/\bcapture\b/i.test(line)) continue;

    const match = line.match(/^(\d+)-(\d+):/);
    if (!match) continue;

    const cardNumber = Number(match[1]);
    const deviceNumber = Number(match[2]);
    const cardDir = `/proc/asound/card${cardNumber}`;
    const cardId = readTrimmedFile(path.join(cardDir, 'id'));
    const usbId = readTrimmedFile(path.join(cardDir, 'usbid'));
    const fullLabel = normalizeAudioLabel(`${line} ${cardId}`);

    if (!usbId) continue;
    if (isRodeAudioLabel(fullLabel)) continue;

    if (/^[A-Za-z0-9_]+$/.test(cardId)) {
      return `plughw:CARD=${cardId},DEV=${deviceNumber}`;
    }
    return `plughw:${cardNumber},${deviceNumber}`;
  }

  return '';
}

function readTrimmedFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function isRodeAudioLabel(value) {
  const label = normalizeAudioLabel(value);
  return label.includes('rode') || label.includes('videomic');
}

function normalizeAudioLabel(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Transcribe audio using ElevenLabs Scribe batch STT.
 * @param {Buffer} audioBuffer - WAV-formatted audio buffer
 * @param {string} model - ElevenLabs STT model
 * @returns {Promise<Object>} Transcription result
 */
export async function transcribeWithElevenLabs(audioBuffer, model = process.env.ELEVENLABS_STT_MODEL || 'scribe_v2') {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not set in environment');
  }

  logger.info(`Transcribing with ElevenLabs STT (${model})...`);

  const formData = new FormData();
  formData.append('model_id', model);
  formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');

  const language = process.env.STT_LANGUAGE || process.env.ELEVENLABS_STT_LANGUAGE || 'en';
  if (language) {
    formData.append('language_code', language);
  }

  const response = await fetchWithTimeout('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
  }, Number(process.env.STT_TIMEOUT_MS || 3000), 'ElevenLabs STT');

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs STT error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const transcript = normalizeTranscriptText(result.text);
  logger.info(`Transcript: "${transcript}"`);

  return {
    text: transcript,
    source: 'elevenlabs',
    noSpeechProb: transcript ? 0 : 1,
    avgLogprob: 0,
    words: result.words || [],
    raw: result,
  };
}

/**
 * Transcribe audio using Deepgram STT.
 * @param {Buffer} audioBuffer - WAV-formatted audio buffer
 * @param {Object} options - Transcription options
 * @returns {Promise<Object>} Transcription result
 */
export async function transcribeWithDeepgram(audioBuffer, options = {}) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY not set in environment');
  }

  const baseUrl = process.env.DEEPGRAM_BASE_URL || 'https://api.deepgram.com';
  const model = resolveDeepgramModel(options.sttModel || process.env.DEEPGRAM_MODEL || process.env.STT_MODEL) || 'nova-2';
  const language = options.language || process.env.STT_LANGUAGE || process.env.DEEPGRAM_LANGUAGE || 'en';
  const params = new URLSearchParams({
    model,
    language,
    smart_format: 'true',
    punctuate: 'true',
  });

  logger.info(`Transcribing with Deepgram STT (${model})...`);

  const response = await fetchWithTimeout(`${baseUrl.replace(/\/$/, '')}/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'audio/wav',
    },
    body: audioBuffer,
  }, Number(process.env.STT_TIMEOUT_MS || 3000), 'Deepgram STT');

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Deepgram STT error: ${response.status} ${errorText || response.statusText}`);
  }

  const result = await response.json();
  const transcript = normalizeTranscriptText(
    result?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '',
  );
  const words = result?.results?.channels?.[0]?.alternatives?.[0]?.words || [];
  logger.info(`Transcript: "${transcript}"`);

  return {
    text: transcript,
    source: 'deepgram',
    noSpeechProb: transcript ? 0 : 1,
    avgLogprob: 0,
    words,
    raw: result,
  };
}

/**
 * Convert raw PCM buffer to WAV format
 * @param {Buffer} audioBuffer - Raw PCM audio buffer
 * @param {number} sampleRate - Sample rate (default 16000)
 * @returns {Promise<Buffer>} WAV-formatted audio buffer
 */
export async function pcmToWav(audioBuffer, sampleRate = 16000) {
  const audioData = new Float32Array(audioBuffer.length / 2);
  for (let i = 0; i < audioBuffer.length; i += 2) {
    audioData[i / 2] = audioBuffer.readInt16LE(i) / 32768;
  }

  const encoded = await WavEncoder.encode({
    sampleRate,
    channelData: [audioData],
  });

  return Buffer.from(encoded);
}

/**
 * Transcribe audio using local Whisper (via subprocess)
 * @param {Buffer} audioBuffer - WAV-formatted audio buffer
 * @param {string} model - Whisper model size (tiny, base, small, medium)
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeWithWhisper(audioBuffer, model = 'base') {
  return new Promise(async (resolve, reject) => {
    try {
      // Write audio to temporary file
      const tempDir = path.resolve(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFile = path.join(tempDir, `audio-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, audioBuffer);

      logger.info(`Transcribing with Whisper (${model})...`);

      const venvWhisper = path.resolve(__dirname, '../../.venv-voice/bin/whisper');
      const envWhisper = process.env.WHISPER_BIN?.trim();
      let whisperBin = null;

      if (envWhisper && fs.existsSync(envWhisper)) {
        whisperBin = envWhisper;
      } else if (fs.existsSync(venvWhisper)) {
        whisperBin = venvWhisper;
      } else {
        const whichResult = spawnSync('which', ['whisper'], { encoding: 'utf-8' });
        if (whichResult.status === 0) {
          whisperBin = 'whisper';
        }
      }

      if (!whisperBin) {
        fs.unlinkSync(tempFile);
        throw new Error('Whisper CLI not found. Install openai-whisper in .venv-voice or set WHISPER_BIN.');
      }

      // Call whisper via subprocess
      const whisper = spawn(whisperBin, [tempFile, '--model', model, '--output_format', 'json', '--output_dir', tempDir, '--language', 'en', '--no_speech_threshold', '0.6'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      whisper.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisper.on('error', (err) => {
        fs.unlinkSync(tempFile);
        logger.error('Whisper spawn error:', err.message);
        reject(err);
      });

      whisper.on('close', (code) => {
        if (code !== 0) {
          fs.unlinkSync(tempFile);
          logger.error('Whisper error:', stderr);
          reject(new Error(`Whisper failed: ${stderr}`));
          return;
        }

        try {
          const jsonFile = `${tempFile.replace('.wav', '.json')}`;
          const result = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
          const transcript = result.text || '';

          // Cleanup
          fs.unlinkSync(tempFile);
          fs.unlinkSync(jsonFile);

          logger.info(`Transcript: "${transcript}"`);
          resolve(transcript.trim());
        } catch (err) {
          logger.error('Failed to parse Whisper output:', err.message);
          reject(err);
        }
      });
    } catch (err) {
      logger.error('Transcription setup error:', err.message);
      reject(err);
    }
  });
}

/**
 * Transcribe audio using faster-whisper (via subprocess)
 * @param {Buffer} audioBuffer - WAV-formatted audio buffer
 * @param {string} model - faster-whisper model name
 * @param {Object} options - Options
 * @returns {Promise<Object>} Transcription result
 */
export async function transcribeWithFasterWhisper(audioBuffer, model = 'small', options = {}) {
  return new Promise(async (resolve, reject) => {
    let tempFile = null;
    try {
      const tempDir = path.resolve(__dirname, '../../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      tempFile = path.join(tempDir, `audio-${Date.now()}.wav`);
      fs.writeFileSync(tempFile, audioBuffer);

      logger.info(`Transcribing with faster-whisper (${model})...`);

      const pythonBin = resolveVoicePython();
      const scriptPath = path.resolve(__dirname, '../scripts/faster-whisper-transcribe.py');
      const language = options.language || process.env.STT_LANGUAGE || process.env.FASTER_WHISPER_LANGUAGE || 'en';
      const device = options.device || process.env.FASTER_WHISPER_DEVICE || 'auto';
      const computeType = options.computeType || process.env.FASTER_WHISPER_COMPUTE_TYPE || '';

      const args = [scriptPath, '--audio', tempFile, '--model', model];
      if (language) args.push('--language', language);
      if (device) args.push('--device', device);
      if (computeType) args.push('--compute-type', computeType);

      const proc = spawn(pythonBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      const cleanup = () => {
        if (tempFile) {
          try {
            fs.unlinkSync(tempFile);
          } catch {
            // Already removed.
          }
        }
      };

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        cleanup();
        reject(err);
      });

      proc.on('close', (code) => {
        cleanup();
        if (code !== 0) {
          reject(new Error(`faster-whisper failed: ${stderr || stdout}`));
          return;
        }

        try {
          const payload = JSON.parse(stdout || '{}');
          const transcript = normalizeTranscriptText(payload.text || '');
          logger.info(`Transcript: "${transcript}"`);
          resolve({
            text: transcript,
            source: 'faster-whisper',
            noSpeechProb: transcript ? 0 : 1,
            avgLogprob: 0,
            words: payload.words || [],
            raw: payload,
          });
        } catch (err) {
          reject(new Error(`faster-whisper parse error: ${err.message}`));
        }
      });
    } catch (err) {
      if (tempFile) {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // Already removed.
        }
      }
      logger.error('Transcription setup error:', err.message);
      reject(err);
    }
  });
}

function normalizeTranscriptText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function resolveFasterWhisperModel(value) {
  const model = String(value || '').trim();
  if (!model) return '';
  if (/scribe|elevenlabs|openai|gpt|turbo/i.test(model)) return '';
  return model;
}

function resolveDeepgramModel(value) {
  const model = String(value || '').trim();
  if (!model) return '';
  if (/scribe|elevenlabs|whisper|gpt|turbo/i.test(model)) return '';
  return model;
}

function shouldIgnoreTranscript(result) {
  const text = normalizeTranscriptText(result?.text);
  if (!text) {
    return true;
  }

  if (/^[\s\.,!?-]+$/.test(text)) {
    return true;
  }

  if (isBracketedNonSpeech(text)) {
    return true;
  }

  const wordCount = text.split(' ').filter(Boolean).length;
  if (wordCount <= 1 && text.length <= 2) {
    return true;
  }

  const noSpeechProb = Number(result?.noSpeechProb);
  const avgLogprob = Number(result?.avgLogprob);

  if (Number.isFinite(noSpeechProb) && noSpeechProb > 0.7) {
    return true;
  }

  if (Number.isFinite(avgLogprob) && avgLogprob < -1.0 && wordCount <= 4) {
    return true;
  }

  return false;
}

function isBracketedNonSpeech(text) {
  const value = normalizeTranscriptText(text).toLowerCase();
  return /^(?:\[[^\]]+\]|\([^)]+\))(?:\s*(?:\[[^\]]+\]|\([^)]+\)))*$/.test(value);
}

/**
 * Transcribe audio using the configured provider.
 * @param {Buffer} audioBuffer - WAV-formatted audio buffer
 * @param {Object} options - Transcription options
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioBuffer, options = {}) {
  const provider = (options.provider || process.env.STT_PROVIDER || 'elevenlabs').toLowerCase();
  const model = options.sttModel || process.env.STT_MODEL || 'whisper-large-v3-turbo';

  if (provider === 'deepgram' || provider === 'dg') {
    return transcribeWithDeepgram(audioBuffer, options);
  }

  if (provider === 'faster-whisper' || provider === 'faster_whisper' || provider === 'fasterwhisper') {
    const resolved = resolveFasterWhisperModel(options.sttModel || process.env.STT_MODEL);
    const fwModel = resolved || process.env.FASTER_WHISPER_MODEL || process.env.WHISPER_MODEL || 'small';
    return transcribeWithFasterWhisper(audioBuffer, fwModel, options);
  }

  if (provider === 'whisper' || provider === 'local-whisper') {
    return { text: await transcribeWithWhisper(audioBuffer, model), source: 'whisper' };
  }

  if (provider === 'elevenlabs' || provider === 'scribe') {
    const elevenLabsModel = options.elevenLabsSttModel
      || process.env.ELEVENLABS_STT_MODEL
      || (options.sttModel && !/^whisper/i.test(options.sttModel) ? options.sttModel : null)
      || 'scribe_v2';
    return transcribeWithElevenLabs(audioBuffer, elevenLabsModel);
  }

  logger.warn(`Unknown STT provider "${provider}", falling back to local Whisper.`);
  return { text: await transcribeWithWhisper(audioBuffer, process.env.WHISPER_MODEL || 'tiny.en'), source: 'whisper' };
}

/**
 * Determine whether a transcript should be ignored for conversational voice turns.
 * @param {Object} result - Transcript result
 * @returns {boolean}
 */
export function transcriptIsUsable(result) {
  return !shouldIgnoreTranscript(result);
}

/**
 * Synthesize speech using ElevenLabs API
 * @param {string} text - Text to synthesize
 * @param {string} voiceId - ElevenLabs voice ID
 * @returns {Promise<Buffer>} Audio buffer
 */
export async function synthesizeWithElevenLabs(text, voiceId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not set in environment');
  }

  logger.info(`Synthesizing with ElevenLabs (voice: ${voiceId})...`);

  try {
    const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=4&output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }, Number(process.env.TTS_TIMEOUT_MS || 3500), 'ElevenLabs TTS');

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${error}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    logger.info(`TTS complete: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (err) {
    logger.error('TTS synthesis error:', err.message);
    throw err;
  }
}

/**
 * Synthesize speech using Inworld TTS API.
 * @param {string} text - Text to synthesize
 * @param {string} voiceId - Inworld voice ID
 * @returns {Promise<Buffer>} Audio buffer
 */
export async function synthesizeWithInworld(text, voiceId = process.env.INWORLD_VOICE_ID || 'Dennis', options = {}) {
  const apiKey = process.env.INWORLD_API_KEY;
  if (!apiKey) {
    throw new Error('INWORLD_API_KEY not set in environment');
  }

  const payload = buildInworldTtsPayload(text, voiceId);
  logger.info(`Synthesizing with Inworld TTS (voice: ${voiceId}, model: ${payload.modelId})...`);

  const response = await fetchWithTimeout('https://api.inworld.ai/tts/v1/voice', {
    method: 'POST',
    signal: options.signal,
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, Number(process.env.TTS_TIMEOUT_MS || 3500), 'Inworld TTS');

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Inworld TTS API error: ${response.status} ${error}`);
  }

  const result = await response.json();
  const audioContent = result?.audioContent || result?.result?.audioContent;
  if (!audioContent) {
    throw new Error('Inworld TTS response missing audioContent.');
  }

  const audioBuffer = Buffer.from(audioContent, 'base64');
  logger.info(`Inworld TTS complete: ${audioBuffer.length} bytes`);
  return audioBuffer;
}

export async function streamWithInworld(text, voiceId = process.env.INWORLD_VOICE_ID || 'Dennis', options = {}) {
  const apiKey = process.env.INWORLD_API_KEY;
  if (!apiKey) {
    throw new Error('INWORLD_API_KEY not set in environment');
  }

  const response = await fetchWithTimeout('https://api.inworld.ai/tts/v1/voice:stream', {
    method: 'POST',
    signal: options.signal,
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildInworldTtsPayload(text, voiceId)),
  }, Number(process.env.TTS_TIMEOUT_MS || 3500), 'Inworld TTS stream');

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Inworld TTS stream API error: ${response.status} ${error}`);
  }

  if (!response.body) {
    throw new Error('Inworld TTS stream response body missing.');
  }

  return Readable.from(decodeInworldNdjsonAudio(response.body));
}

/**
 * Stream ElevenLabs audio directly to the speaker for lower latency.
 * @param {string} text - Text to synthesize
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {Object} options - Options
 * @returns {Promise<Buffer|void>} Audio buffer if play is false, otherwise void
 */
export async function speakWithElevenLabs(text, voiceId, options = {}) {
  const { play = true, signal, onAudioChunk } = options;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not set in environment');
  }

  const response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=4&output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    signal,
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  }, Number(process.env.TTS_TIMEOUT_MS || 3500), 'ElevenLabs TTS');

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} ${error}`);
  }

  if (!play) {
    return Buffer.from(await response.arrayBuffer());
  }

  return playAudioStream(response.body, {
    label: 'ElevenLabs',
    signal,
    missingBodyMessage: 'ElevenLabs response body missing',
    onAudioChunk,
  });
}

/**
 * Synthesize and play speech using Inworld TTS.
 * @param {string} text - Text to synthesize
 * @param {string} voiceId - Inworld voice ID
 * @param {Object} options - Options
 * @returns {Promise<Buffer|Object>} Audio buffer if play is false, otherwise playback result
 */
export async function speakWithInworld(text, voiceId = process.env.INWORLD_VOICE_ID || 'Dennis', options = {}) {
  const { play = true, signal, onAudioChunk } = options;
  if (!play) {
    return synthesizeWithInworld(text, voiceId, { signal });
  }

  const audioStream = await streamWithInworld(text, voiceId, { signal });
  return playAudioStream(audioStream, {
    label: 'Inworld',
    signal,
    missingBodyMessage: 'Inworld audio stream missing',
    onAudioChunk,
  });
}

export async function speakWithTtsProvider(text, options = {}) {
  const provider = String(options.provider || process.env.TTS_PROVIDER || process.env.VOICE_TTS_PROVIDER || 'elevenlabs').toLowerCase();

  if (provider === 'inworld') {
    const voiceId = options.voiceId || process.env.INWORLD_VOICE_ID || 'Dennis';
    return speakWithInworld(text, voiceId, options);
  }

  if (provider === 'elevenlabs') {
    const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    return speakWithElevenLabs(text, voiceId, options);
  }

  logger.warn(`Unknown TTS provider "${provider}", falling back to ElevenLabs.`);
  const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  return speakWithElevenLabs(text, voiceId, options);
}

function playAudioStream(audioStream, { label = 'TTS', signal, missingBodyMessage = 'TTS response body missing', onAudioChunk } = {}) {
  return new Promise((resolve, reject) => {
    try {
      logger.info(`Playing ${label} audio...`);

      const ffmpeg = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', 'pipe:0',
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        'pipe:1',
      ]);

      const player = startPcmPlayer();
      const prerollMs = Number(process.env.AUDIO_PLAYBACK_PREROLL_MS || 250);
      const prerollBytes = Math.max(4096, Math.floor(16000 * 2 * Math.max(0, prerollMs) / 1000));
      let bufferedBytes = 0;
      let bufferedChunks = [];
      let playerStarted = false;

      if (!audioStream) {
        reject(new Error(missingBodyMessage));
        return;
      }

      let settled = false;
      const cleanup = () => {
        signal?.removeEventListener?.('abort', abortPlayback);
      };
      const settle = (err, result) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      };
      const abortPlayback = () => {
        logger.info(`${label} playback interrupted.`);
        try {
          audioStream.unpipe?.(ffmpeg.stdin);
        } catch {
          // Already closed.
        }
        try {
          ffmpeg.stdin.end?.();
        } catch {
          // Already closed.
        }
        try {
          audioStream.destroy?.();
        } catch {
          // Already stopped.
        }
        try {
          player.stdin?.end?.();
        } catch {
          // Already closed.
        }
        try {
          if (!player.killed) player.kill('SIGTERM');
        } catch {
          // Already stopped.
        }
        try {
          if (!ffmpeg.killed) ffmpeg.kill('SIGTERM');
        } catch {
          // Already stopped.
        }
        setTimeout(() => {
          try {
            if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
          } catch {
            // Already stopped.
          }
        }, 250);
        settle(null, { interrupted: true });
      };

      function startPlayerIfNeeded() {
        if (playerStarted) return;
        playerStarted = true;
        for (const chunk of bufferedChunks) {
          if (!player.stdin.writable) break;
          player.stdin.write(chunk);
        }
        bufferedChunks = [];
      }

      audioStream.on('error', (err) => {
        if (settled || signal?.aborted) return;
        logger.error(`${label} stream error:`, err.message);
        settle(err);
      });

      if (signal?.aborted) {
        abortPlayback();
        return;
      }
      signal?.addEventListener?.('abort', abortPlayback, { once: true });

      audioStream.pipe(ffmpeg.stdin);
      ffmpeg.stdout.on('data', (chunk) => {
        if (settled || signal?.aborted) return;
        onAudioChunk?.(chunk);
        if (!playerStarted) {
          bufferedChunks.push(chunk);
          bufferedBytes += chunk.length;
          if (bufferedBytes < prerollBytes) return;
          startPlayerIfNeeded();
          return;
        }

        if (player.stdin.writable) {
          player.stdin.write(chunk);
        }
      });

      ffmpeg.stdin.on('error', (err) => {
        if (settled || signal?.aborted || err.code === 'EPIPE') return;
        logger.error('ffmpeg stdin error:', err.message);
        settle(err);
      });

      ffmpeg.stdout.on('error', (err) => {
        if (settled || signal?.aborted) return;
        logger.error('ffmpeg stdout error:', err.message);
        settle(err);
      });

      ffmpeg.on('error', (err) => {
        if (settled || signal?.aborted) return;
        logger.error('ffmpeg error:', err.message);
        settle(err);
      });

      ffmpeg.stdout.on('end', () => {
        if (!playerStarted) startPlayerIfNeeded();
        try {
          player.stdin.end();
        } catch {
          // Already closed.
        }
      });

      player.stdin.on('error', (err) => {
        if (settled || signal?.aborted || err.code === 'EPIPE') return;
        logger.error(`${label} player stdin error:`, err.message);
        settle(err);
      });

      player.on('error', (err) => {
        if (settled || signal?.aborted) return;
        logger.error(`${label} player error:`, err.message);
        settle(err);
      });

      player.on('close', (code) => {
        if (settled) return;
        if (!signal?.aborted && code && code !== 0) {
          settle(new Error(`${label} player exited with code ${code}`));
          return;
        }
        settle(null, { interrupted: Boolean(signal?.aborted) });
      });
    } catch (err) {
      logger.error(`${label} playback setup error:`, err.message);
      reject(err);
    }
  });
}

function startPcmPlayer() {
  const command = process.env.AUDIO_PLAYBACK_COMMAND?.trim();
  if (command) {
    return spawn(command, {
      shell: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
  }

  if (process.platform === 'linux') {
    const device = resolvePlaybackOutputDevice();
    const args = ['-q'];
    if (device) args.push('-D', device);

    const bufferTimeUs = Number(process.env.AUDIO_PLAYBACK_BUFFER_TIME_US || 50000);
    const periodTimeUs = Number(process.env.AUDIO_PLAYBACK_PERIOD_TIME_US || 12500);
    if (Number.isFinite(bufferTimeUs) && bufferTimeUs > 0) args.push('--buffer-time', String(Math.round(bufferTimeUs)));
    if (Number.isFinite(periodTimeUs) && periodTimeUs > 0) args.push('--period-time', String(Math.round(periodTimeUs)));

    args.push('-t', 'raw', '-f', 'S16_LE', '-r', '16000', '-c', '1');
    return spawn('aplay', args, {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
  }

  return spawn('sox', ['-q', '-t', 'raw', '-r', '16000', '-e', 'signed-integer', '-b', '16', '-c', '1', '-', '-d'], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
}

function buildInworldTtsPayload(text, voiceId) {
  const modelId = process.env.INWORLD_TTS_MODEL_ID || 'inworld-tts-2';
  const audioEncoding = String(process.env.INWORLD_TTS_AUDIO_ENCODING || 'MP3').toUpperCase();
  const sampleRateHertz = Number(process.env.INWORLD_TTS_SAMPLE_RATE || 48000);
  const bitRate = Number(process.env.INWORLD_TTS_BIT_RATE || 128000);
  const deliveryMode = process.env.INWORLD_TTS_DELIVERY_MODE || 'BALANCED';

  const audioConfig = {
    audioEncoding,
    ...(Number.isFinite(sampleRateHertz) && sampleRateHertz > 0 ? { sampleRateHertz } : {}),
    ...(audioEncoding === 'MP3' && Number.isFinite(bitRate) && bitRate > 0 ? { bitRate } : {}),
  };

  return {
    text,
    voiceId,
    modelId,
    audioConfig,
    deliveryMode,
    applyTextNormalization: process.env.INWORLD_TTS_TEXT_NORMALIZATION || 'ON',
  };
}

function resolvePlaybackOutputDevice() {
  const configured = String(process.env.AUDIO_PLAYBACK_DEVICE || '').trim();
  if (configured && configured.toLowerCase() !== 'auto') {
    return configured;
  }

  if (process.platform !== 'linux') return '';

  const detected = detectPlaybackOutputDevice();
  return detected || '';
}

function detectPlaybackOutputDevice() {
  const result = spawnSync('aplay', ['-l'], { encoding: 'utf8' });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (!output || /no soundcards found/i.test(output)) return '';

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^card\s+(\d+):.*\[(.+?)\].*device\s+(\d+):/i);
    if (!match) continue;

    const cardLabel = normalizeAudioLabel(match[2]);
    const fullLine = normalizeAudioLabel(line);
    if (cardLabel.includes('headphone') || fullLine.includes('headphone') || cardLabel.includes('analog') || fullLine.includes('analog') || cardLabel.includes('bcm2835') || fullLine.includes('bcm2835')) {
      return `plughw:${match[1]},${match[3]}`;
    }
  }

  return '';
}

async function* decodeInworldNdjsonAudio(stream) {
  let buffered = '';

  for await (const chunk of stream) {
    buffered += chunk.toString('utf8');
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || '';

    for (const line of lines) {
      const audio = parseInworldAudioLine(line);
      if (audio?.length) yield audio;
    }
  }

  const audio = parseInworldAudioLine(buffered);
  if (audio?.length) yield audio;
}

function parseInworldAudioLine(line) {
  const value = String(line || '').trim();
  if (!value) return null;

  let event;
  try {
    event = JSON.parse(value);
  } catch (error) {
    throw new Error(`Inworld TTS stream parse error: ${error.message}`);
  }

  if (event.error) {
    const message = event.error.message || JSON.stringify(event.error);
    throw new Error(`Inworld TTS stream error: ${message}`);
  }

  const audioContent = event?.result?.audioContent || event?.audioContent;
  return audioContent ? Buffer.from(audioContent, 'base64') : null;
}

/**
 * Play audio through speakers
 * @param {Buffer} audioBuffer - MP3 audio buffer (from ElevenLabs)
 * @returns {Promise<void>}
 */
export async function playAudio(audioBuffer) {
  return playAudioStream(Readable.from(audioBuffer), { label: 'Audio' });
}
