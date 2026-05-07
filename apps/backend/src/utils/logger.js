export const logger = {
  info: (...args) => console.log('[mirror-os]', ...args),
  warn: (...args) => console.warn('[mirror-os]', ...args),
  error: (...args) => console.error('[mirror-os]', ...args),
};
