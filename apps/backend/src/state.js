export const state = {
  currentScene: 'idle',
  lastIntent: '',
  ui: {
    connected: false,
    lastSeenAt: null,
    screenOn: true,
  },
  context: {
    weather: null,
    calendar: null,
    spotify: null,
    todos: null,
    memory: null,
  },
};

export function setScene(scene) {
  state.currentScene = scene || 'idle';
}

export function setLastIntent(intent) {
  state.lastIntent = intent || '';
}

export function updateContext(key, value) {
  state.context[key] = value;
}

export function updateUi(payload = {}) {
  state.ui = {
    ...state.ui,
    ...payload,
    connected: true,
    lastSeenAt: new Date().toISOString(),
  };
}

export function setScreenOn(screenOn) {
  state.ui = {
    ...state.ui,
    screenOn: Boolean(screenOn),
    lastSeenAt: new Date().toISOString(),
  };
}
