import { executeIntent } from '../intents/executeIntent.js';
import { llmJson, llmText } from '../llm/client.js';
import { logger } from '../utils/logger.js';
import { broadcastAction, broadcastOverlay } from '../websocket.js';
import { buildJarvisContext } from './context.js';
import { matchFastIntent } from './fastRouter.js';
import { responsePrompt, routerPrompt } from './prompts.js';
import { fastSpeechFor } from './responseTemplates.js';

export async function routeJarvisIntent(input, history = []) {
  const fastRoute = matchFastIntent(input);
  if (fastRoute) return fastRoute;

  if (isMemoryRequest(input)) {
    return {
      intent: 'SHOW_MEMORY',
      params: {},
      fast: true,
      reason: 'memory',
    };
  }

  let routed;
  try {
    routed = await llmJson({
      purpose: 'intent',
      maxTokens: Number(process.env.JARVIS_ROUTER_MAX_TOKENS || 180),
      temperature: Number(process.env.JARVIS_ROUTER_TEMPERATURE || process.env.LLM_TEMPERATURE || 0.15),
      messages: [
        { role: 'system', content: routerPrompt },
        ...historyToMessages(history).slice(-8),
        { role: 'user', content: input },
      ],
    });
  } catch (error) {
    logger.warn(`Intent router fallback: ${publicJarvisErrorMessage(error)}`);
    routed = {
      intent: 'DISPLAY_MESSAGE',
      params: { text: input },
    };
  }

  return {
    intent: routed.intent || 'DISPLAY_MESSAGE',
    params: routed.intent === 'DISPLAY_MESSAGE' ? { text: input } : routed.params || {},
    fast: false,
  };
}

export async function runJarvisTurn(input, {
  history = [],
  route = null,
  broadcast = true,
} = {}) {
  const userInput = String(input || '').trim();
  if (!userInput) throw new Error('No input text received.');

  const routed = route || await routeJarvisIntent(userInput, history);
  logger.info(`Intent: ${routed.intent}${routed.fast ? ' fast' : ''}`);
  logger.info(`Params: ${JSON.stringify(routed.params || {})}`);

  const toolResult = await executeIntent(routed.intent, routed.params || {});
  const context = buildJarvisContext();
  const speech = routed.fast
    ? fastSpeechFor(routed, toolResult, context)
    : await composeJarvisResponse({
      userInput,
      route: routed,
      toolResult,
      context,
      history,
    });

  const display = jarvisDisplayTiming(speech, {
    intent: routed.intent,
    hasToolScene: Boolean(toolResult.ui?.scene && toolResult.ui.scene !== 'idle'),
  });
  const ui = {
    ...(toolResult.ui || {}),
    speechDisplayMs: display.speechDisplayMs,
    displayMs: display.sceneDisplayMs,
  };

  if (broadcast) {
    if (toolResult.ui?.scene && toolResult.ui.scene !== 'idle' && routed.intent !== 'DISPLAY_MESSAGE') {
      broadcastAction(routed.intent, toolResult.data ?? {}, speech, { ui, displayMs: display.sceneDisplayMs });
    } else if (speech) {
      broadcastOverlay(speech, { displayMs: display.speechDisplayMs });
    }
  }

  return {
    ok: true,
    input: userInput,
    route: routed,
    intent: routed.intent,
    params: routed.params || {},
    data: toolResult.data ?? null,
    ui,
    fast: Boolean(routed.fast),
    displayMs: display.sceneDisplayMs,
    speechDisplayMs: display.speechDisplayMs,
    speech,
  };
}

export function jarvisDisplayTiming(speech = '', { intent = '', hasToolScene = false } = {}) {
  const text = String(speech || '').trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charCount = text.length;
  const speechDisplayMs = clampDuration(1200 + Math.max(wordCount * 330, charCount * 42), 3200, 18000);
  const toolExtraMs = hasToolScene || /^SHOW_|TODO|SPOTIFY|CALENDAR|WEATHER/.test(String(intent || '')) ? 4200 : 1400;
  const sceneDisplayMs = clampDuration(speechDisplayMs + toolExtraMs, 7000, 26000);
  return { speechDisplayMs, sceneDisplayMs };
}

export async function composeJarvisResponse({
  userInput = '',
  route,
  toolResult,
  context = buildJarvisContext(),
  history = [],
} = {}) {
  const directSpeech = fastSpeechFor(route, toolResult, context);
  if (directSpeech) return directSpeech;

  if (route?.intent === 'IDLE') return '';
  if (route?.intent === 'DISPLAY_MESSAGE' && isSimpleGreeting(userInput)) return 'Hello.';
  if (route?.intent === 'DISPLAY_MESSAGE' && isCasualGreeting(userInput)) return casualGreetingResponse(userInput);

  try {
    const payload = {
      userInput,
      route,
      toolResult,
      context,
      responseRequirements: responseRequirements(route, toolResult, userInput),
    };

    let content = await llmText({
      purpose: 'response',
      maxTokens: Number(process.env.JARVIS_RESPONSE_MAX_TOKENS || 100),
      temperature: Number(process.env.JARVIS_RESPONSE_TEMPERATURE || 0.65),
      messages: [
        { role: 'system', content: responsePrompt },
        ...historyToMessages(history).slice(-8),
        { role: 'user', content: JSON.stringify(payload) },
      ],
    });

    let speech = cleanSpeech(content);
    let failureReason = speechFailureReason(speech, route, toolResult, userInput);
    if (failureReason === 'response used banned generic filler') {
      const stripped = stripBannedFiller(speech);
      if (stripped && stripped !== speech) {
        speech = stripped;
        failureReason = speechFailureReason(speech, route, toolResult, userInput);
      }
    }

    if (failureReason) {
      content = await llmText({
        purpose: 'response-retry',
        maxTokens: Number(process.env.JARVIS_RESPONSE_MAX_TOKENS || 100),
        temperature: Math.min(0.4, Number(process.env.JARVIS_RESPONSE_TEMPERATURE || 0.65)),
        messages: [
          {
            role: 'system',
            content: `${responsePrompt}\n\nYour previous response failed because: ${failureReason}. Rewrite it and satisfy responseRequirements exactly. Do not use the bare generic failure line.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              ...payload,
              invalidResponse: speech,
            }),
          },
        ],
      });
      speech = cleanSpeech(content);
      failureReason = speechFailureReason(speech, route, toolResult, userInput);
      if (failureReason === 'response used banned generic filler') {
        const stripped = stripBannedFiller(speech);
        if (stripped && stripped !== speech) {
          speech = stripped;
          failureReason = speechFailureReason(speech, route, toolResult, userInput);
        }
      }
    }

    if (failureReason) {
      if (route?.intent === 'DISPLAY_MESSAGE') {
        logger.warn(`DISPLAY_MESSAGE fallback: ${failureReason}`);
        return fallbackDisplayMessage(userInput || displayMessageText(route, toolResult));
      }
      throw new Error(failureReason);
    }

    return speech;
  } catch (error) {
    logger.error(`Jarvis response failed: ${error.message}`);
    if (route?.intent === 'DISPLAY_MESSAGE') return fallbackDisplayMessage(userInput);
    return jarvisFailureSpeech(error, { route });
  }
}

export function jarvisFailureSpeech(error, { route } = {}) {
  const scope = route?.intent ? ` for ${route.intent}` : '';
  const reason = stripTerminalPunctuation(publicJarvisErrorMessage(error));
  return `Jarvis response failed${scope}: ${reason}.`;
}

export function publicJarvisErrorMessage(error) {
  const message = sanitizeErrorMessage(error?.publicMessage || error?.message || '');
  return message || 'unknown error';
}

export function appendHistory(history, userInput, speech, maxTurns = Number(process.env.VOICE_CHAT_HISTORY_TURNS || 6)) {
  const next = [...history, { role: 'user', content: userInput }, { role: 'assistant', content: speech }];
  return next.slice(Math.max(0, next.length - maxTurns * 2));
}

function historyToMessages(history = []) {
  return history
    .filter((entry) => entry?.role && typeof entry.content === 'string')
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: entry.content,
    }));
}

function cleanSpeech(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:text)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function stripBannedFiller(text) {
  return String(text || '')
    .replace(/\bwhat['’]s on your mind\??/gi, '')
    .replace(/\bperfect weather\b/gi, '')
    .replace(/\bvibes\b/gi, '')
    .replace(/\bcasual stroll\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeErrorMessage(message) {
  let safe = String(message || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]{8,}/gi, 'sk-[redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-token]');

  for (const [key, value] of Object.entries(process.env)) {
    if (!/(KEY|TOKEN|SECRET|PASSWORD)/i.test(key)) continue;
    if (!value || value.length < 8) continue;
    safe = safe.split(value).join(`[redacted ${key}]`);
  }

  return safe.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function stripTerminalPunctuation(message) {
  return String(message || 'unknown error').replace(/[.!?]+$/g, '');
}

function clampDuration(value, min, max) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0) return min;
  return Math.min(max, Math.max(min, Math.round(duration)));
}

function isSimpleGreeting(text) {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening)(?:,?\s+jarvis)?[.!? ]*$/i.test(String(text || '').trim());
}

function fallbackDisplayMessage(text) {
  if (isSimpleGreeting(text)) return 'Hello.';
  if (isCasualGreeting(text)) return casualGreetingResponse(text);
  const value = normalizeCommandText(text);
  if (/^(what|huh|pardon|say that again)$/.test(value)) {
    return 'I am here.';
  }
  if (/\b(paragraph|tell me|give me)\b/.test(value)) {
    return 'Working on it.';
  }
  return 'Naturally.';
}

function isCasualGreeting(text) {
  const value = normalizeCommandText(text);
  return /\b(how are you|how's it going|how is it going|what's up|whats up|sup|howdy)\b/.test(value);
}

function casualGreetingResponse(text) {
  const value = normalizeCommandText(text);
  if (/\b(how are you|how's it going|how is it going)\b/.test(value)) {
    return 'Operational. Barely charming, but functional.';
  }
  return 'Naturally.';
}

function normalizeCommandText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayMessageText(route = {}, toolResult = {}) {
  return route.params?.text
    || route.params?.message
    || toolResult.data?.message
    || '';
}

function responseRequirements(route = {}, toolResult = {}, userInput = '') {
  const intent = route?.intent;
  const data = toolResult?.data || {};

  if (intent === 'DISPLAY_MESSAGE') {
    return [
      'Answer the user conversationally from userInput.',
      'For a simple greeting, greet back briefly without asking a generic follow-up question.',
      'DISPLAY_MESSAGE does not require external tool data.',
      'Do not say "Jarvis response failed." unless response generation actually failed.',
    ];
  }

  if (intent === 'SHOW_TIME') {
    return [
      `Say the current time exactly as: ${data.time?.time || data.time || 'context.now.time'}`,
      'Do not say you cannot provide the current time.',
    ];
  }

  if (intent === 'SHOW_WEATHER' && data.weather) {
    const high = data.weather.forecast?.[0]?.high;
    const low = data.weather.forecast?.[0]?.low;
    const locationInstruction = hasExplicitWeatherLocation(route)
      ? `Mention requested location briefly: ${shortWeatherLocation(data.weather.location)}`
      : 'For the home/default location, prefer "where you are" or "where you\'re at" over the full location name.';
    const conditionInstruction = isTemperatureOnlyRequest(userInput)
      ? ['Only answer the current temperature. Do not mention condition, high, or low.']
      : [`Mention condition: ${data.weather.condition}`];
    const rangeInstruction = isTemperatureOnlyRequest(userInput)
      ? []
      : [
          ...(high !== undefined ? [`Mention today\'s high: ${high}`] : []),
          ...(low !== undefined ? [`Mention today\'s low: ${low}`] : []),
        ];

    return [
      locationInstruction,
      `Mention current temperature: ${data.weather.temperature}`,
      ...conditionInstruction,
      ...rangeInstruction,
      'Do not mention feels-like temperature, wind, humidity, pressure, or extra weather measurements unless the user explicitly asked.',
      'Do not use the symbols "°F" or "F", and do not say "Fahrenheit". Say "degrees" or use plain numbers.',
    ];
  }

  if (intent === 'SHOW_SPOTIFY' || intent === 'SPOTIFY_NEXT' || intent === 'SPOTIFY_PREVIOUS') {
    return [
      'Mention the track title and artist if present.',
      'Do not mention progress, elapsed time, or duration.',
    ];
  }

  if (intent === 'SPOTIFY_PAUSE' || intent === 'SPOTIFY_PLAY') {
    return ['Confirm the music control action briefly.'];
  }

  if (intent === 'SHOW_MEMORY') {
    return [
      'Use the provided saved facts.',
      'Do not answer generically.',
    ];
  }

  if (intent === 'END_CONVERSATION') {
    return ['Close the conversation briefly and naturally.'];
  }

  return [];
}

function speechFailureReason(speech, route = {}, toolResult = {}, userInput = '') {
  const text = String(speech || '').trim();
  if (!text) return 'empty response';
  if (/^jarvis response failed\.?$/i.test(text)) return 'response model returned the generic fallback';
  if (/\bresponse requirements not followed\b/i.test(text)) return 'response mentioned internal requirements';
  if (/\bwhat['’]s on your mind\??/i.test(text)) return 'response used banned generic filler';
  if (/\b(perfect weather|vibes|casual stroll)\b/i.test(text)) return 'response used banned generic filler';
  if (isSimpleGreeting(displayMessageText(route, toolResult)) && text.includes('?')) {
    return 'simple greeting response asked a generic follow-up question';
  }

  const intent = route?.intent;
  const data = toolResult?.data || {};

  if (intent === 'SHOW_WEATHER' && data.weather) {
    if (hasExplicitWeatherLocation(route)) {
      const location = shortWeatherLocation(data.weather.location);
      if (location && !text.toLowerCase().includes(location.toLowerCase())) {
        return `missing weather location ${location}`;
      }
    }

    const high = data.weather.forecast?.[0]?.high;
    const low = data.weather.forecast?.[0]?.low;
    if (!isTemperatureOnlyRequest(userInput) && high !== undefined && !text.includes(String(high))) {
      return `missing weather high ${high}`;
    }
    if (!isTemperatureOnlyRequest(userInput) && low !== undefined && !text.includes(String(low))) {
      return `missing weather low ${low}`;
    }
    if (data.weather.temperature !== undefined && !text.includes(String(data.weather.temperature))) {
      return `missing current temperature ${data.weather.temperature}`;
    }
    if (/\b(feels like|wind|winds|windy|humidity|pressure|mph|farenheit|fahrenheit)\b|°f|\d+\s*f\b/i.test(text)) {
      return 'weather response mentioned banned extra measurement or Fahrenheit marker';
    }
  }

  if ((intent === 'SHOW_SPOTIFY' || intent === 'SPOTIFY_NEXT' || intent === 'SPOTIFY_PREVIOUS') && /\b(progress|elapsed|duration|\d+:\d+)\b/i.test(text)) {
    return 'Spotify response included progress or duration';
  }

  return '';
}

function conversationEndSpeech(text) {
  return /\b(goodbye|bye)\b/i.test(String(text || '')) ? 'Goodbye, sir.' : 'Done, sir.';
}

function isMemoryRequest(text) {
  const value = normalizeCommandText(text);
  return /\bwhat do you know about me\b/.test(value)
    || /\bwhat do you remember about me\b/.test(value)
    || /\bwhat do you remember\b/.test(value)
    || /\bwhat have you (saved|stored) about me\b/.test(value)
    || /\bshow (my )?memory\b/.test(value)
    || /\bread (my )?memory\b/.test(value)
    || /\bmy memory\b/.test(value)
    || /\bwhat(?:'s| is) in (my )?memory\b/.test(value);
}

function isTemperatureOnlyRequest(text) {
  const value = String(text || '').toLowerCase();
  return /\b(temp|temperature|how hot|how cold|degrees)\b/.test(value)
    && !/\b(weather|forecast|high|low|condition|rain|snow|wind|humidity)\b/.test(value.replace(/temperature/g, ''));
}

function hasExplicitWeatherLocation(route = {}) {
  const params = route?.params || {};
  return Boolean(params.location || params.place || params.city);
}

function shortWeatherLocation(location) {
  return String(location || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !['US', 'United States'].includes(part))
    .join(', ');
}
