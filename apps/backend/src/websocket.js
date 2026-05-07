import { WebSocketServer } from 'ws';
import { state, updateUi } from './state.js';
import { logger } from './utils/logger.js';

const clients = new Set();

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket) => {
    clients.add(socket);
    logger.info(`display connected (${clients.size})`);
    sendSnapshot(socket);

    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'UI_STATE') updateUi(message.payload);
      } catch {
        logger.warn('ignored malformed websocket message');
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      logger.info(`display disconnected (${clients.size})`);
    });
  });

  return wss;
}

export function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

export function broadcastAction(intent, data = {}, speech = '', meta = {}) {
  broadcast({
    type: 'ACTION',
    payload: {
      intent,
      data,
      speech,
      ...meta,
    },
  });
}

export function broadcastData(payload = {}) {
  broadcast({
    type: 'DATA_UPDATE',
    payload,
  });
}

export function broadcastOverlay(speech = '', meta = {}) {
  broadcast({
    type: 'OVERLAY',
    payload: {
      speech,
      ...meta,
    },
  });
}

export function broadcastVoiceStatus(status, text = '', meta = {}) {
  broadcast({
    type: 'VOICE_STATUS',
    payload: {
      status,
      text,
      ...meta,
    },
  });
}

function sendSnapshot(socket) {
  const payload = Object.fromEntries(
    Object.entries(state.context).filter(([, value]) => value !== null && value !== undefined),
  );

  if (Object.keys(payload).length && socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify({
      type: 'DATA_UPDATE',
      payload,
    }));
  }

  socket.send(JSON.stringify({
    type: 'VOICE_STATUS',
    payload: {
      status: 'idle',
      text: '',
    },
  }));
}
