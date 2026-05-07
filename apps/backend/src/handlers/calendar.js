import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
} from '../services/calendarService.js';
import { setLastIntent, setScene, updateContext } from '../state.js';
import { broadcastAction, broadcastData } from '../websocket.js';

export async function handleCalendar(params = {}) {
  setScene('calendar');
  setLastIntent('SHOW_CALENDAR');
  broadcastAction('SHOW_CALENDAR');
  const calendar = await refreshCalendar(params);
  return { ok: true, data: { calendar }, ui: { scene: 'calendar' } };
}

export async function refreshCalendar(params = {}) {
  const calendar = await getCalendarEvents(params);
  if (calendar) {
    updateContext('calendar', calendar);
    broadcastData({ calendar });
  }
  return calendar;
}

export async function handleAddCalendarEvent(params = {}) {
  const event = await createCalendarEvent(params);
  const calendar = await refreshCalendar();
  setScene('calendar');
  setLastIntent('ADD_CALENDAR_EVENT');
  broadcastAction('SHOW_CALENDAR');
  return { ok: true, data: { event, calendar }, ui: { scene: 'calendar' } };
}

export async function handleEditCalendarEvent(params = {}) {
  const event = await updateCalendarEvent(params);
  const calendar = await refreshCalendar();
  setScene('calendar');
  setLastIntent('EDIT_CALENDAR_EVENT');
  broadcastAction('SHOW_CALENDAR');
  return { ok: true, data: { event, calendar }, ui: { scene: 'calendar' } };
}

export async function handleDeleteCalendarEvent(params = {}) {
  const event = await deleteCalendarEvent(params);
  const calendar = await refreshCalendar();
  setScene('calendar');
  setLastIntent('DELETE_CALENDAR_EVENT');
  broadcastAction('SHOW_CALENDAR');
  return { ok: true, data: { event, calendar }, ui: { scene: 'calendar' } };
}
