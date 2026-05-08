import {
  handleAddCalendarEvent,
  handleCalendar,
  handleDeleteCalendarEvent,
  handleEditCalendarEvent,
} from '../handlers/calendar.js';
import { handleEmail } from '../handlers/email.js';
import { handleSpotify, handleSpotifyControl } from '../handlers/spotify.js';
import { handleAddTodo, handleCheckTodo, handleTodo } from '../handlers/todo.js';
import { handleWeather } from '../handlers/weather.js';
import { buildNowContext } from '../jarvis/context.js';
import {
  forgetLastTurns,
  forgetSession,
  forgetTopic,
  loadMemory,
  showFixes,
  summarizeLongTermMemory,
  updateMemory,
} from '../services/memoryService.js';
import { triggerVoiceMonkeyRoutine } from '../services/voiceMonkeyService.js';
import { setLastIntent, setScene, setScreenOn } from '../state.js';
import { broadcastAction, broadcastUiState } from '../websocket.js';

export async function executeIntent(intent, params = {}) {
  switch (intent) {
    case 'SHOW_WEATHER':
      return handleWeather(params);
    case 'SHOW_TIME':
      setLastIntent('SHOW_TIME');
      return { ok: true, data: { time: buildNowContext() }, ui: { scene: 'idle' } };
    case 'RUN_SMART_HOME_ROUTINE': {
      const result = await triggerVoiceMonkeyRoutine(params.routine);
      setLastIntent('RUN_SMART_HOME_ROUTINE');
      return { ok: true, data: { smartHome: result }, ui: { scene: 'idle' } };
    }
    case 'SCREEN_ON':
    case 'MIRROR_SCREEN_ON':
      return setMirrorScreen(true, intent);
    case 'SCREEN_OFF':
    case 'MIRROR_SCREEN_OFF':
      return setMirrorScreen(false, intent);
    case 'GOODNIGHT':
    case 'GOOD_NIGHT':
      return runGoodnightRoutine();
    case 'SHOW_CALENDAR':
      return handleCalendar(params);
    case 'ADD_CALENDAR_EVENT':
    case 'ADD_CALENDAR':
    case 'CREATE_CALENDAR_EVENT':
    case 'CREATE_EVENT':
      return handleAddCalendarEvent(params);
    case 'EDIT_CALENDAR_EVENT':
    case 'EDIT_CALENDAR':
    case 'UPDATE_CALENDAR_EVENT':
    case 'UPDATE_EVENT':
      return handleEditCalendarEvent(params);
    case 'DELETE_CALENDAR_EVENT':
    case 'DELETE_CALENDAR':
    case 'REMOVE_CALENDAR_EVENT':
    case 'REMOVE_EVENT':
      return handleDeleteCalendarEvent(params);
    case 'SHOW_SPOTIFY':
      return handleSpotify(params);
    case 'SPOTIFY_NEXT':
    case 'SPOTIFY_PREVIOUS':
    case 'SPOTIFY_PAUSE':
    case 'SPOTIFY_PLAY':
      return handleSpotifyControl(intent, params);
    case 'SHOW_TODO':
    case 'SHOW_TODOS':
    case 'SHOW_TASKS':
      return handleTodo(params);
    case 'ADD_TODO':
    case 'ADD_TASK':
    case 'CREATE_TODO':
    case 'CREATE_TASK':
      return handleAddTodo(params);
    case 'CHECK_TODO':
    case 'CHECK_TASK':
    case 'COMPLETE_TODO':
    case 'COMPLETE_TASK':
      return handleCheckTodo(params);
    case 'SHOW_EMAIL':
      return handleEmail(params);
    case 'UPDATE_MEMORY':
    case 'REMEMBER': {
      const memory = await updateMemory(params);
      setLastIntent('UPDATE_MEMORY');
      return { ok: true, data: { memory }, ui: { scene: 'idle' } };
    }
    case 'SHOW_MEMORY': {
      const memory = await loadMemory();
      setLastIntent('SHOW_MEMORY');
      return { ok: true, data: { memory }, ui: { scene: 'idle' } };
    }
    case 'SHOW_FIXES': {
      const fixes = await showFixes();
      setLastIntent('SHOW_FIXES');
      return { ok: true, data: { fixes }, ui: { scene: 'idle' } };
    }
    case 'SUMMARIZE_MEMORY': {
      const memory = await summarizeLongTermMemory();
      setLastIntent('SUMMARIZE_MEMORY');
      return { ok: true, data: { memory }, ui: { scene: 'idle' } };
    }
    case 'FORGET_MEMORY': {
      if (params.sessionId || params.session) {
        const result = await forgetSession(params.sessionId || params.session);
        setLastIntent('FORGET_MEMORY');
        return { ok: true, data: { forgotten: result }, ui: { scene: 'idle' } };
      }
      const topic = params.topic || params.query || params.text;
      const result = topic
        ? await forgetTopic(topic)
        : await forgetLastTurns(params.count || params.n || 1);
      setLastIntent('FORGET_MEMORY');
      return { ok: true, data: { forgotten: result }, ui: { scene: 'idle' } };
    }
    case 'DISPLAY_MESSAGE':
      setLastIntent('DISPLAY_MESSAGE');
      return { ok: true, data: { message: params.message || params.text || '' }, ui: { scene: 'idle' } };
    case 'END_CONVERSATION':
      setLastIntent('END_CONVERSATION');
      return { ok: true, data: { ended: true }, ui: { scene: 'idle' } };
    case 'IDLE':
      setScene('idle');
      setLastIntent('IDLE');
      broadcastAction('IDLE');
      return { ok: true, data: {}, ui: { scene: 'idle' } };
    default:
      setLastIntent(intent);
      return { ok: true, data: { unknownIntent: intent }, ui: { scene: 'idle' } };
  }
}

function setMirrorScreen(screenOn, intent = '') {
  setScene('idle');
  setLastIntent(intent || (screenOn ? 'SCREEN_ON' : 'SCREEN_OFF'));
  setScreenOn(screenOn);
  broadcastUiState({ screenOn });
  return {
    ok: true,
    data: { screen: { screenOn } },
    ui: { scene: 'idle', screenOn },
  };
}

async function runGoodnightRoutine() {
  const routines = [];

  for (const routine of ['lightsOff', 'fanOn']) {
    try {
      const result = await triggerVoiceMonkeyRoutine(routine);
      routines.push({
        ok: true,
        routine,
        device: result.device,
        status: result.status,
      });
    } catch (error) {
      routines.push({
        ok: false,
        routine,
        error: error.publicMessage || error.message || 'Routine failed.',
      });
    }
  }

  const screen = setMirrorScreen(false, 'GOODNIGHT');
  return {
    ok: true,
    data: {
      ...screen.data,
      goodnight: {
        routines,
        complete: routines.every((routine) => routine.ok),
      },
    },
    ui: screen.ui,
  };
}
