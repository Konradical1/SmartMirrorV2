const weatherTemplates = [
  "It's {temp} now. High {high}, low {low}. Manageable, somehow.",
  "{temp} degrees. High {high}, low {low}. The atmosphere has filed its report.",
  "Currently {temp}. High {high}, low {low}. Try to remain composed.",
  "It's {temp} outside. High {high}, low {low}. A triumph of basic forecasting.",
  "{temp} now, topping at {high} and dipping to {low}. Dress like you have survival instincts.",
  "Right now, {temp}. High {high}, low {low}. Weather continues its little performance.",
  "{temp} degrees at the moment. High {high}, low {low}. Not catastrophic. Not praise-worthy.",
  "It's {temp}, with a high of {high} and low of {low}. Nature remains indecisive.",
  "Currently {temp}, sir. High {high}, low {low}. I assume you'll blame the sky.",
  "{temp} now. High {high}, low {low}. The day has modest ambitions.",
  "It's {temp}. High {high}, low {low}. Perfectly adequate, which is generous.",
  "{temp} degrees now. High {high}, low {low}. Somehow, this required satellites.",
  "Current temp is {temp}. High {high}, low {low}. You're welcome for the miracle of numbers.",
  "{temp} right now, with {high} and {low} as the day's boundaries. Thrilling stuff.",
  "It's {temp} at the moment. High {high}, low {low}. The sky has chosen average.",
  "{temp} now. High {high}, low {low}. Bring judgment, maybe a jacket.",
  "Currently {temp}. High {high}, low {low}. Outside remains technically available.",
  "{temp} degrees. High {high}, low {low}. A weather report, not a life plan.",
  "It's {temp}; high {high}, low {low}. The forecast is behaving, suspiciously.",
  "{temp} now. High {high}, low {low}. That's the situation, grimly summarized.",
  "It's {temp}, partly cloudy. High {high}, low {low}. The sun is negotiating.",
  "{temp} degrees and partly cloudy. High {high}, low {low}. The clouds are freelancing.",
  "Currently {temp}, with some clouds loitering. High {high}, low {low}.",
  "It's {temp}; high {high}, low {low}. Partly cloudy, because commitment is difficult.",
];

const temperatureTemplates = [
  "It's {temp} degrees right now.",
  "{temp} degrees. Try not to make it a personality trait.",
  "Currently {temp}, sir.",
  "It's {temp}. A number, delivered with dignity.",
  "{temp} degrees at the moment. Riveting, but useful.",
  "Right now, {temp} degrees.",
];

const timeTemplates = [
  "It's {time}.",
  "{time}, sir.",
  "It's {time}. Somehow, still today.",
  "{time}. Time continues its little march.",
  "Currently {time}. A bold development.",
  "It's {time}. Try to use it responsibly.",
  "{time}. Chronology remains undefeated.",
  "The time is {time}.",
];

export function fastSpeechFor(route, toolResult, context) {
  const spotifySpeech = spotifyControlSpeech(route, toolResult, context);
  if (spotifySpeech) return spotifySpeech;

  if (route.intent === 'RUN_SMART_HOME_ROUTINE') {
    return smartHomeSpeech(route.params?.routine);
  }

  if (route.intent === 'SCREEN_ON' || route.intent === 'MIRROR_SCREEN_ON') {
    return 'Mirror on.';
  }

  if (route.intent === 'SCREEN_OFF' || route.intent === 'MIRROR_SCREEN_OFF') {
    return 'Mirror off.';
  }

  if (route.intent === 'GOODNIGHT' || route.intent === 'GOOD_NIGHT') {
    return goodnightSpeech(toolResult);
  }

  if (route.intent === 'SHOW_TIME') {
    return fill(pick(timeTemplates), context.now);
  }

  if (route.intent === 'END_CONVERSATION') {
    return 'Done.';
  }

  if (route.intent === 'SHOW_WEATHER') {
    const weather = toolResult?.data?.weather || context.weather;
    if (!weather) return 'Jarvis response failed: weather data missing.';

    const today = weather.forecast?.[0] || {};
    const pool = route.reason === 'temperature' ? temperatureTemplates : weatherTemplates;
    return fill(pick(pool), {
      temp: weather.temperature,
      high: today.high ?? weather.high ?? weather.temperature,
      low: today.low ?? weather.low ?? weather.temperature,
      condition: weather.condition || '',
      location: shortLocation(weather.location),
    });
  }

  return '';
}

function goodnightSpeech(toolResult = {}) {
  const routines = toolResult?.data?.goodnight?.routines || [];
  const failed = routines.filter((routine) => !routine.ok);

  if (failed.length) {
    return 'Screen off. The room tried to cooperate; inspect the smart home routine.';
  }

  return pick([
    'Goodnight. Lights off, fan on, mirror asleep.',
    'Night mode engaged. Try not to negotiate with tomorrow.',
    'Goodnight. Darkness, airflow, silence. Very civilized.',
  ]);
}

function spotifyControlSpeech(route, toolResult, context) {
  const intent = route?.intent;
  const spotify = toolResult?.data?.spotify || context?.spotify || {};
  const track = spotifyTrack(spotify);

  if (intent === 'SHOW_SPOTIFY') {
    return track ? `Now playing ${track}.` : 'Nothing is playing on Spotify.';
  }

  if (intent === 'SPOTIFY_NEXT') {
    return track ? `Alright, sir. Skipped. Now playing ${track}.` : 'Alright, sir. Skipped.';
  }

  if (intent === 'SPOTIFY_PREVIOUS') {
    return track ? `Back. Now playing ${track}.` : 'Back.';
  }

  if (intent === 'SPOTIFY_PAUSE') {
    return 'Paused.';
  }

  if (intent === 'SPOTIFY_PLAY') {
    return track ? `Playing ${track}.` : 'Playing.';
  }

  return '';
}

function spotifyTrack(spotify = {}) {
  if (!spotify.title) return '';
  return spotify.artist ? `${spotify.title} by ${spotify.artist}` : spotify.title;
}

function smartHomeSpeech(routine) {
  const templates = {
    brightlights: [
      'Lights up. Subtlety has left the room.',
      'Brightened. Retinas, brace yourselves.',
      'Lights brightened. Very dramatic.',
      'Done. The room has chosen ambition.',
      'Bright lights engaged. Try not to interrogate anyone.',
      'There. Illumination, because apparently we needed clarity.',
    ],
    dim: [
      'Dimmed. Mood restored.',
      'Lights dimmed. Cinema mode, basically.',
      'Done. The room is less judgmental now.',
      'Dimmed. Your atmosphere budget remains intact.',
      'Lights lowered. Very mysterious of us.',
      'There. Softer lighting, fewer harsh truths.',
    ],
    lightsOff: [
      'Lights off. Stealth mode, allegedly.',
      'Done. Darkness has been professionally installed.',
      'Lights are off. Try not to trip heroically.',
      'Done. The room has committed to the bit.',
      'Lights out. Very minimalist.',
      'There. Visibility has been cancelled.',
    ],
    fanOn: [
      'Fan on. Atmospheric management begins.',
      'Done. The breeze department is online.',
      'Fan engaged. Tiny weather system activated.',
      'There. Air is now doing something useful.',
      'Fan on. Civilization advances.',
      'Done. Your personal wind machine lives.',
    ],
    fanOff: [
      'Fan off. The breeze has been fired.',
      'Done. Air movement suspended.',
      'Fan stopped. Peace and stillness, for now.',
      'There. The wind machine has been silenced.',
      'Fan off. Drama reduced by twelve percent.',
      'Done. The atmosphere will have to manage itself.',
    ],
  };

  return pick(templates[routine] || ['Done. Smart home obeyed, suspiciously.']);
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function fill(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function shortLocation(location) {
  return String(location || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !['US', 'United States'].includes(part))
    .join(', ');
}
