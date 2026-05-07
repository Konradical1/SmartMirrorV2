import fetch from 'node-fetch';

const latitude = process.env.WEATHER_LATITUDE || '39.0714';
const longitude = process.env.WEATHER_LONGITUDE || '-84.3505';
const timezone = process.env.WEATHER_TIMEZONE || 'America/New_York';
const location = process.env.WEATHER_LOCATION || 'Anderson Township, Ohio';
const cache = new Map();

export async function getWeather(params = {}) {
  const target = await resolveWeatherTarget(params);
  const cacheKey = `${target.latitude},${target.longitude},${target.timezone}`;
  const cached = cache.get(cacheKey);
  const cacheMs = Number(process.env.WEATHER_CACHE_MS || 5 * 60 * 1000);
  if (cached && Date.now() - cached.cachedAt < cacheMs) {
    return {
      ...cached.value,
      cached: true,
    };
  }

  const query = new URLSearchParams({
    latitude: target.latitude,
    longitude: target.longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: target.timezone,
    forecast_days: '3',
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`Weather failed: ${response.status} ${await response.text()}`);

  const data = await response.json();

  const weather = {
    location: formatWeatherLocation(target.location),
    temperature: Math.round(data.current?.temperature_2m ?? 0),
    feelsLike: Math.round(data.current?.apparent_temperature ?? data.current?.temperature_2m ?? 0),
    condition: weatherLabel(data.current?.weather_code),
    wind: `${Math.round(data.current?.wind_speed_10m ?? 0)} mph`,
    humidity: `${Math.round(data.current?.relative_humidity_2m ?? 0)}%`,
    forecast: data.daily.time.map((date, index) => ({
      day: index === 0 ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long' }),
      high: Math.round(data.daily.temperature_2m_max[index]),
      low: Math.round(data.daily.temperature_2m_min[index]),
      condition: [0, 1].includes(data.daily.weather_code[index]) ? 'clear' : 'partly',
    })),
    hourly: [],
    cached: false,
    updatedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, {
    cachedAt: Date.now(),
    value: weather,
  });

  return weather;
}

async function resolveWeatherTarget(params = {}) {
  const requested = String(params.location || params.place || params.city || params.query || '').trim();
  if (!requested || isHomeLocation(requested)) return defaultWeatherTarget();

  const match = await geocodeLocation(requested)
    || await geocodeLocation(`${requested}, Ohio`)
    || await geocodeLocation(`${requested}, United States`);

  if (!match) throw new Error(`Could not find weather for ${requested}.`);

  const parts = [match.name, match.admin1, match.country_code].filter(Boolean);
  return {
    latitude: String(match.latitude),
    longitude: String(match.longitude),
    timezone: match.timezone || timezone,
    location: parts.join(', '),
  };
}

function defaultWeatherTarget() {
  return {
    latitude,
    longitude,
    timezone,
    location: formatWeatherLocation(location),
  };
}

function isHomeLocation(value) {
  const normalized = String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return [
    'here',
    'home',
    'my location',
    'current location',
    'anderson',
    'anderson ohio',
    'anderson oh',
    'anderson township',
    'anderson township ohio',
    'anderson township oh',
  ].includes(normalized);
}

async function geocodeLocation(name) {
  const search = new URLSearchParams({
    name,
    count: '1',
    language: 'en',
    format: 'json',
  });

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${search}`);
  if (!response.ok) throw new Error(`Weather location lookup failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.results?.[0] || null;
}

function weatherLabel(code) {
  if ([0, 1].includes(code)) return 'Clear';
  if ([2, 3].includes(code)) return 'Partly cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storm';
  return 'Partly cloudy';
}

function formatWeatherLocation(value) {
  return String(value || '')
    .split(',')
    .map((part) => US_STATE_NAMES[part.trim().toUpperCase()] || part.trim())
    .filter(Boolean)
    .join(', ');
}

const US_STATE_NAMES = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};
