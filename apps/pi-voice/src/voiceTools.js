export {
  pcmToWav,
  recordAudioWithOptions,
  speakWithTtsProvider,
  transcribeAudio,
  transcriptIsUsable,
  waitForWakeWordUtterance,
} from './localVoiceService.js';

export function appendHistoryLocal(history, userInput, speech, maxTurns = Number(process.env.VOICE_CHAT_HISTORY_TURNS || 6)) {
  const next = [...history, { role: 'user', content: userInput }, { role: 'assistant', content: speech }];
  return next.slice(Math.max(0, next.length - maxTurns * 2));
}
