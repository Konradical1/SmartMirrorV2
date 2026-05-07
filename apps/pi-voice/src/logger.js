export const logger = {
  info: (...args) => console.log('[pi-voice]', ...args),
  warn: (...args) => console.warn('[pi-voice]', ...args),
  error: (...args) => console.error('[pi-voice]', ...args),
};
