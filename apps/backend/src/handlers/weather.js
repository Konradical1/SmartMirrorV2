import { getWeather } from '../services/weatherService.js';
import { setLastIntent, setScene, updateContext } from '../state.js';
import { broadcastAction, broadcastData } from '../websocket.js';

export async function handleWeather(params = {}) {
  setScene('weather');
  setLastIntent('SHOW_WEATHER');
  broadcastAction('SHOW_WEATHER');
  const weather = await refreshWeather(params);
  return { ok: true, data: { weather }, ui: { scene: 'weather' } };
}

export async function refreshWeather(params = {}) {
  const weather = await getWeather(params);
  updateContext('weather', weather);
  broadcastData({ weather });
  return weather;
}
