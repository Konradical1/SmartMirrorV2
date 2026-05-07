import { loadMemorySync } from '../services/memoryService.js';
import { state } from '../state.js';

export function buildJarvisContext() {
  return {
    now: buildNowContext(),
    scene: state.currentScene,
    lastIntent: state.lastIntent,
    weather: state.context.weather,
    calendar: state.context.calendar,
    spotify: state.context.spotify,
    todos: state.context.todos,
    memory: loadMemorySync(),
  };
}

export function buildNowContext() {
  const timezone = process.env.WEATHER_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const now = new Date();
  return {
    iso: now.toISOString(),
    timezone,
    day: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }),
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: timezone }),
    time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone }),
  };
}
