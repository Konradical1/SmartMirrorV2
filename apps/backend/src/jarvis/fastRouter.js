const WEATHER_LOCATION_PATTERN = /\b(?:in|for|at)\s+([a-z][a-z\s,'.-]{1,48})$/i;

export function matchFastIntent(input = '') {
  const text = normalizeCommandText(input);
  if (!text) return null;

  const smartHomeRoute = matchSmartHomeIntent(text);
  if (smartHomeRoute) return smartHomeRoute;

  if (isConversationEndRequest(text)) {
    return { intent: 'END_CONVERSATION', params: {}, fast: true, reason: 'conversation-end' };
  }

  if (isMemoryRequest(text)) {
    return { intent: 'SHOW_MEMORY', params: {}, fast: true, reason: 'memory' };
  }

  if (isTimeRequest(text)) {
    return { intent: 'SHOW_TIME', params: {}, fast: true, reason: 'time' };
  }

  if (isWeatherRequest(text)) {
    return {
      intent: 'SHOW_WEATHER',
      params: weatherParams(input),
      fast: true,
      reason: isTemperatureOnlyRequest(text) ? 'temperature' : 'weather',
    };
  }

  return null;
}

export function normalizeCommandText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s'.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTimeRequest(text) {
  return /^(what\s+)?time\s+is\s+it$/.test(text)
    || /^what\s+is\s+the\s+(current\s+)?time$/.test(text)
    || /^what'?s\s+the\s+time$/.test(text)
    || /^what'?s\s+the\s+current\s+time$/.test(text)
    || /^current\s+time$/.test(text)
    || /^time$/.test(text)
    || /^tell\s+me\s+the\s+time$/.test(text);
}

function isWeatherRequest(text) {
  if (/^(weather|forecast|temperature|temp)$/.test(text)) return true;
  return /\b(weather|forecast|temperature|temp|degrees|how hot|how cold|outside|rain|snow|partly cloudy|cloudy)\b/.test(text)
    && !/\b(calendar|song|music|todo|task|email)\b/.test(text);
}

function matchSmartHomeIntent(text) {
  const command = stripCommandFillers(text);
  const hasLight = /\b(lights?|lamps?|lighting|room)\b/.test(command);
  const hasFan = /\b(fan|air|breeze)\b/.test(command);

  if (hasFan && /\b(on|start|run|enable|activate|power on|turn on|switch on|kick on)\b/.test(command)) {
    return smartHomeRoute('fanOn', 'fan-on');
  }

  if (hasFan && /\b(off|stop|disable|deactivate|power off|turn off|switch off|shut off|kill)\b/.test(command)) {
    return smartHomeRoute('fanOff', 'fan-off');
  }

  if (
    hasLight
    && /\b(off|out|dark|blackout|shut off|turn off|switch off|power off|kill)\b/.test(command)
  ) {
    return smartHomeRoute('lightsOff', 'lights-off');
  }

  if (
    command === 'dim'
    || command === 'dimmer'
    || /\b(dim|dimmer|dimmed|lower|reduce|soften|turn down|lights down|make it darker|make the room darker|less bright)\b/.test(command)
  ) {
    return smartHomeRoute('dim', 'dim-lights');
  }

  if (
    command === 'bright'
    || command === 'brighter'
    || (hasLight && /\b(on|turn on|switch on|power on)\b/.test(command))
    || /\b(bright|brighten|brighter|raise|increase|turn up|lights up|full brightness|make it brighter|make the room brighter|more light)\b/.test(command)
  ) {
    return smartHomeRoute('brightlights', 'bright-lights');
  }

  return null;
}

function smartHomeRoute(routine, reason) {
  return {
    intent: 'RUN_SMART_HOME_ROUTINE',
    params: { routine },
    fast: true,
    reason,
  };
}

function stripCommandFillers(text) {
  return String(text || '')
    .replace(/\b(?:please|would you|could you|can you|jarvis|hey jarvis|okay jarvis|ok jarvis|for me|right now|now)\b/g, ' ')
    .replace(/\b(?:the|my|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTemperatureOnlyRequest(text) {
  return /\b(temp|temperature|how hot|how cold|degrees)\b/.test(text)
    && !/\b(weather|forecast|high|low|condition|rain|snow)\b/.test(text.replace(/temperature/g, ''));
}

function weatherParams(input) {
  const match = String(input || '').trim().match(WEATHER_LOCATION_PATTERN);
  if (!match?.[1]) return {};

  const location = match[1]
    .replace(/\b(today|tomorrow|right now|now|please|sir)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return location ? { location } : {};
}

function isConversationEndRequest(text) {
  return /\b(goodbye|bye|done with you|that's all|that is all|all set|we're done|we are done|you can stop|stop listening|stop conversation)\b/.test(text)
    || /\b(i am|i'm|im)\s+good(?:\s+now)?\b/.test(text);
}

function isMemoryRequest(text) {
  return /\bwhat do you know about me\b/.test(text)
    || /\bwhat do you remember about me\b/.test(text)
    || /\bwhat do you remember\b/.test(text)
    || /\bwhat have you (saved|stored) about me\b/.test(text)
    || /\bshow (my )?memory\b/.test(text)
    || /\bread (my )?memory\b/.test(text)
    || /\bmy memory\b/.test(text)
    || /\bwhat(?:'s| is) in (my )?memory\b/.test(text);
}
