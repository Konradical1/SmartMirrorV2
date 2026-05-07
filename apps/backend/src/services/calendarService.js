import fetch from 'node-fetch';

const DEFAULT_TIMEZONE = process.env.CALENDAR_TIMEZONE || process.env.WEATHER_TIMEZONE || 'America/New_York';

export async function getCalendarEvents() {
  const events = await listRawCalendarEvents({ days: 7, maxResults: 40 });
  if (!events) return null;
  return groupEvents(events);
}

export const __calendarTest = {
  groupEvents,
};

export async function createCalendarEvent(params = {}) {
  const token = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  if (!token) throw new Error('Google Calendar is not connected.');

  const event = buildCalendarEvent(params);
  const response = await fetch(calendarEventCollectionUrl(calendarId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) throw new Error(`Google Calendar create failed: ${response.status} ${await response.text()}`);
  return normalizeGoogleEvent(await response.json());
}

export async function updateCalendarEvent(params = {}) {
  const target = await findCalendarEvent(params);
  if (!target) throw new Error(`Could not find ${eventQuery(params)} on your calendar.`);

  const token = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  const patch = buildCalendarPatch(params);

  const response = await fetch(calendarSingleEventUrl(calendarId, target.id), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) throw new Error(`Google Calendar update failed: ${response.status} ${await response.text()}`);
  return normalizeGoogleEvent(await response.json());
}

export async function deleteCalendarEvent(params = {}) {
  const target = await findCalendarEvent(params);
  if (!target) throw new Error(`Could not find ${eventQuery(params)} on your calendar.`);

  const token = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

  const response = await fetch(calendarSingleEventUrl(calendarId, target.id), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(`Google Calendar delete failed: ${response.status} ${await response.text()}`);
  return normalizeGoogleEvent(target);
}

async function findCalendarEvent(params = {}) {
  const query = eventQuery(params).toLowerCase();
  if (!query) throw new Error('Missing calendar event title or query.');

  const events = await listRawCalendarEvents({ days: 60, maxResults: 100 });
  return events?.find((event) => (event.summary || '').toLowerCase().includes(query)) || null;
}

async function listRawCalendarEvents({ days, maxResults }) {
  const token = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  if (!token) return null;

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });

  const response = await fetch(`${calendarEventCollectionUrl(calendarId)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(`Google Calendar failed: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.items || [];
}

async function getGoogleAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_TOKEN } = process.env;
  if (GOOGLE_TOKEN) return GOOGLE_TOKEN;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) throw new Error(`Google token failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

function buildCalendarEvent(params) {
  const summary = eventTitle(params);
  if (!summary) throw new Error('Missing calendar event title.');

  return {
    ...buildCalendarDateFields(params),
    summary,
    location: params.location || undefined,
    description: params.description || undefined,
  };
}

function buildCalendarPatch(params) {
  const patch = {};
  if (params.newTitle || params.title || params.summary || params.name) patch.summary = eventTitle(params, 'newTitle');
  if (params.location !== undefined) patch.location = params.location || undefined;
  if (params.description !== undefined) patch.description = params.description || undefined;
  if (params.start || eventDate(params) || eventTime(params) || params.end) Object.assign(patch, buildCalendarDateFields(params));
  if (!Object.keys(patch).length) throw new Error('Missing calendar event changes.');
  return patch;
}

function buildCalendarDateFields(params) {
  if (params.start) {
    const start = new Date(params.start);
    const end = params.end ? new Date(params.end) : addMinutes(start, Number(params.durationMinutes || params.duration || 60));
    return {
      start: { dateTime: start.toISOString(), timeZone: DEFAULT_TIMEZONE },
      end: { dateTime: end.toISOString(), timeZone: DEFAULT_TIMEZONE },
    };
  }

  const date = parseDateInput(eventDate(params) || 'today');
  const time = eventTime(params);
  if (!time) {
    const dateText = formatDateKey(date);
    return {
      start: { date: dateText },
      end: { date: formatDateKey(addDays(date, 1)) },
    };
  }

  const start = parseLocalDateTime(date, time);
  const end = params.end ? new Date(params.end) : addMinutes(start, Number(params.durationMinutes || params.duration || 60));
  return {
    start: { dateTime: start.toISOString(), timeZone: DEFAULT_TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: DEFAULT_TIMEZONE },
  };
}

function parseDateInput(input) {
  const value = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^(on|this)\s+/, '');
  const today = startOfDay(new Date());

  if (!value || value === 'today') return today;
  if (value === 'tomorrow') return addDays(today, 1);

  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    return new Date(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3]));
  }

  const weekdayMatch = value.match(/^(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekdayMatch) {
    const target = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekdayMatch[2]);
    let offset = (target - today.getDay() + 7) % 7;
    if (offset === 0 || weekdayMatch[1]) offset += 7;
    return addDays(today, offset);
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Could not understand calendar date: ${input}`);
  return startOfDay(parsed);
}

function parseLocalDateTime(date, timeInput) {
  const value = String(timeInput).trim().toLowerCase();
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) throw new Error(`Could not understand calendar time: ${timeInput}`);

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const period = match[3];
  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;

  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function groupEvents(events) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      key: formatDateKey(date),
      day: date.toLocaleDateString([], { weekday: 'long' }),
      date: date.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      events: [],
    };
  });

  for (const event of events) {
    const startText = event.start?.dateTime || event.start?.date;
    if (!startText) continue;
    const start = event.start?.date ? parseDateInput(event.start.date) : new Date(startText);
    const key = event.start?.date || formatDateKey(start);
    const day = days.find((candidate) => candidate.key === key);
    if (!day) continue;

    const isAllDay = Boolean(event.start?.date);
    const endText = event.end?.dateTime || event.end?.date;
    const end = endText && !isAllDay ? new Date(endText) : null;
    const durationMinutes = end ? Math.round((end - start) / 60000) : null;

    day.events.push({
      id: event.id,
      time: isAllDay ? 'All day' : formatEventTime(start),
      title: event.summary || 'Untitled',
      color: event.colorId ? '#00E5FF' : '#68E083',
      allDay: isAllDay,
      durationMinutes,
    });
  }

  return days.map(({ key, ...day }) => day);
}

function normalizeGoogleEvent(event) {
  const startText = event.start?.dateTime || event.start?.date;
  const start = event.start?.date ? parseDateInput(event.start.date) : startText ? new Date(startText) : null;
  return {
    id: event.id,
    title: event.summary || 'Untitled',
    time: event.start?.date ? 'All day' : start ? formatEventTime(start) : undefined,
    date: start?.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }),
  };
}

function eventQuery(params = {}) {
  return String(params.query || params.search || params.match || params.oldTitle || eventTitle(params)).trim();
}

function eventTitle(params = {}, preferredKey = null) {
  if (preferredKey && params[preferredKey]) return String(params[preferredKey]).trim();
  return String(params.title || params.summary || params.name || params.event || params.text || '').trim();
}

function eventDate(params = {}) {
  return params.date || params.day || params.when || params.dueDate || params.due;
}

function eventTime(params = {}) {
  return params.time || params.startTime || params.at;
}

function calendarEventCollectionUrl(calendarId) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
}

function calendarSingleEventUrl(calendarId, eventId) {
  return `${calendarEventCollectionUrl(calendarId)}/${encodeURIComponent(eventId)}`;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatEventTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
