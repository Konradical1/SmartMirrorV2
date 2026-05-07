import { setLastIntent } from '../state.js';
import { broadcastAction } from '../websocket.js';

export async function handleEmail(params = {}) {
  setLastIntent('SHOW_EMAIL');
  broadcastAction('IDLE');
  return {
    ok: true,
    data: {
      connected: false,
      message: 'Email is not connected yet.',
    },
  };
}
