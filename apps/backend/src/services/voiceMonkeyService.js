const VOICE_MONKEY_BASE_URL = 'https://api-v2.voicemonkey.io/trigger';

const defaultDevices = {
  brightlights: 'brightlights',
  dim: 'dim',
  fanOff: 'fan-off',
  fanOn: 'fan-on',
  lightsOff: 'lightsoff',
};

export async function triggerVoiceMonkeyRoutine(routine) {
  const device = voiceMonkeyDeviceForRoutine(routine);
  const token = process.env.VOICE_MONKEY_TOKEN || '';
  if (!token) {
    const error = new Error('VOICE_MONKEY_TOKEN is not configured.');
    error.publicMessage = 'Voice Monkey is not configured.';
    throw error;
  }

  const url = new URL(process.env.VOICE_MONKEY_BASE_URL || VOICE_MONKEY_BASE_URL);
  url.searchParams.set('token', token);
  url.searchParams.set('device', device);

  const timeoutMs = Number(process.env.VOICE_MONKEY_TIMEOUT_MS || 5000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });
    const body = await response.text().catch(() => '');
    if (!response.ok) {
      const error = new Error(`Voice Monkey failed with HTTP ${response.status}.`);
      error.publicMessage = 'The smart home routine failed.';
      error.status = response.status;
      error.body = body;
      throw error;
    }

    return {
      ok: true,
      routine,
      device,
      status: response.status,
      body,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Voice Monkey request timed out.');
      timeoutError.publicMessage = 'The smart home routine timed out.';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function voiceMonkeyDeviceForRoutine(routine) {
  const devices = {
    brightlights: process.env.VOICE_MONKEY_DEVICE_BRIGHT_LIGHTS || defaultDevices.brightlights,
    dim: process.env.VOICE_MONKEY_DEVICE_DIM || defaultDevices.dim,
    fanOff: process.env.VOICE_MONKEY_DEVICE_FAN_OFF || defaultDevices.fanOff,
    fanOn: process.env.VOICE_MONKEY_DEVICE_FAN_ON || defaultDevices.fanOn,
    lightsOff: process.env.VOICE_MONKEY_DEVICE_LIGHTS_OFF || defaultDevices.lightsOff,
  };

  if (!devices[routine]) {
    const error = new Error(`Unknown Voice Monkey routine: ${routine}`);
    error.publicMessage = 'I do not know that smart home routine.';
    throw error;
  }

  return devices[routine];
}
