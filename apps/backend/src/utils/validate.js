export function validateSecret(request, expectedSecret) {
  if (!expectedSecret) return true;
  return request.get('X-Mirror-Secret') === expectedSecret;
}

export function normalizeCommand(body = {}) {
  if (!body.intent || typeof body.intent !== 'string') {
    const error = new Error('Missing required string field: intent');
    error.status = 400;
    throw error;
  }

  return {
    intent: body.intent.trim().toUpperCase(),
    params: body.params && typeof body.params === 'object' ? body.params : {},
    speech: typeof body.speech === 'string' ? body.speech : '',
  };
}
