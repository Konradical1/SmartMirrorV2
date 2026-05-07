export const state = {
  currentScene: 'idle',
  lastIntent: '',
  ui: {
    connected: false,
    lastSeenAt: null,
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
