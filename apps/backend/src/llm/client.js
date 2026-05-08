import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

export function activeLlmProvider() {
  return normalizeLlmProvider(process.env.LLM_PROVIDER || 'openrouter');
}

export function llmConfig(provider = activeLlmProvider()) {
  if (provider === 'sambanova') {
    return {
      name: 'SambaNova',
      provider,
      apiKey: process.env.SAMBANOVA_API_KEY,
      apiKeyName: 'SAMBANOVA_API_KEY',
      url: process.env.SAMBANOVA_BASE_URL || 'https://api.sambanova.ai/v1/chat/completions',
      model: process.env.SAMBANOVA_MODEL || process.env.LLM_MODEL || 'Meta-Llama-3.3-70B-Instruct',
      maxTokens: Number(process.env.SAMBANOVA_MAX_TOKENS || process.env.LLM_MAX_TOKENS || 300),
      temperature: Number(process.env.SAMBANOVA_TEMPERATURE || process.env.LLM_TEMPERATURE || 0.3),
    };
  }

  if (provider === 'openai') {
    return {
      name: 'OpenAI',
      provider,
      apiKey: process.env.OPENAI_API_KEY,
      apiKeyName: 'OPENAI_API_KEY',
      url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions',
      model: process.env.OPENAI_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini',
      maxTokens: Number(process.env.OPENAI_MAX_TOKENS || process.env.LLM_MAX_TOKENS || 300),
      temperature: Number(process.env.OPENAI_TEMPERATURE || process.env.LLM_TEMPERATURE || 0.3),
    };
  }

  if (provider === 'openrouter') {
    return {
      name: 'OpenRouter',
      provider,
      apiKey: process.env.OPENROUTER_API_KEY,
      apiKeyName: 'OPENROUTER_API_KEY',
      url: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions',
      model: process.env.OPENROUTER_MODEL || process.env.LLM_MODEL || 'openai/gpt-4o-mini',
      maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS || process.env.LLM_MAX_TOKENS || 300),
      temperature: Number(process.env.OPENROUTER_TEMPERATURE || process.env.LLM_TEMPERATURE || 0.3),
    };
  }

  if (provider === 'gemini') {
    return {
      name: 'Gemini',
      provider,
      apiKey: process.env.GEMINI_API_KEY,
      apiKeyName: 'GEMINI_API_KEY',
      url: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
      model: process.env.GEMINI_MODEL || process.env.LLM_MODEL || 'gemini-1.5-flash-latest',
      maxTokens: Number(process.env.GEMINI_MAX_TOKENS || process.env.LLM_MAX_TOKENS || 300),
      temperature: Number(process.env.GEMINI_TEMPERATURE || process.env.LLM_TEMPERATURE || 0.3),
    };
  }

  if (provider === 'cerebras') {
    return {
      name: 'Cerebras',
      provider,
      apiKey: process.env.CEREBRAS_API_KEY,
      apiKeyName: 'CEREBRAS_API_KEY',
      url: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1/chat/completions',
      model: process.env.CEREBRAS_MODEL || process.env.LLM_MODEL || 'llama3.1-8b',
      maxTokens: Number(process.env.CEREBRAS_MAX_COMPLETION_TOKENS || process.env.LLM_MAX_TOKENS || 300),
      temperature: Number(process.env.CEREBRAS_TEMPERATURE || process.env.LLM_TEMPERATURE || 0.3),
    };
  }

  return llmConfig('openrouter');
}

export async function llmText({
  messages,
  provider = activeLlmProvider(),
  model,
  maxTokens,
  temperature,
  topP,
  purpose = 'chat',
} = {}) {
  const providers = llmProviderOrder(provider);
  let lastError;

  for (const providerName of providers) {
    try {
      return await llmTextOnce({
        messages,
        provider: providerName,
        model,
        maxTokens,
        temperature,
        topP,
        purpose,
      });
    } catch (error) {
      lastError = error;
      if (providerName !== providers[providers.length - 1]) {
        const failedConfig = llmConfig(providerName);
        const fallbackConfig = llmConfig(providers[providers.length - 1]);
        logger.warn(
          `LLM ${purpose}: ${failedConfig.name} failed, trying ${fallbackConfig.name}: ${error.message}`,
        );
      }
    }
  }

  throw lastError;
}

async function llmTextOnce({
  messages,
  provider = activeLlmProvider(),
  model,
  maxTokens,
  temperature,
  topP,
  purpose = 'chat',
} = {}) {
  const config = llmConfig(provider);
  if (!config.apiKey) {
    throw new Error(`${config.apiKeyName} not set.`);
  }

  if (config.provider === 'gemini') {
    return geminiText({
      config,
      messages,
      model,
      maxTokens,
      temperature,
      topP,
      purpose,
    });
  }

  const body = {
    model: model || config.model,
    messages,
    temperature: finiteOr(temperature, config.temperature),
    top_p: finiteOr(topP, Number(process.env.LLM_TOP_P || 1)),
    stream: false,
  };

  const tokenLimit = finiteOr(maxTokens, config.maxTokens);
  if (config.provider === 'cerebras') {
    body.max_completion_tokens = tokenLimit;
  } else {
    body.max_tokens = tokenLimit;
  }

  logger.info(`LLM ${purpose}: ${config.name} (${body.model})`);

  const response = await fetchWithTimeout(config.url, {
    method: 'POST',
    headers: headersFor(config),
    body: JSON.stringify(body),
  }, llmTimeoutMs(purpose), `${config.name} LLM ${purpose}`);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${config.name} LLM failed: ${response.status} ${text || response.statusText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${config.name} LLM returned no content.`);
  }
  return cleanModelText(content);
}

function llmProviderOrder(provider = activeLlmProvider()) {
  const primary = normalizeLlmProvider(provider || 'openrouter');
  const fallback = normalizeLlmProvider(process.env.LLM_FALLBACK_PROVIDER || 'openrouter');
  return [...new Set([primary, fallback].filter(Boolean))];
}

function normalizeLlmProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return value === 'groq' ? 'openrouter' : value;
}

export async function llmJson(options = {}) {
  const content = await llmText(options);
  const json = extractJson(content);
  if (!json) {
    throw new Error(`LLM did not return JSON: ${content}`);
  }
  return JSON.parse(json);
}

function headersFor(config) {
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  if (config.provider === 'openrouter') {
    if (process.env.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
    if (process.env.OPENROUTER_APP_TITLE) headers['X-Title'] = process.env.OPENROUTER_APP_TITLE;
  }

  return headers;
}

async function geminiText({
  config,
  messages,
  model,
  maxTokens,
  temperature,
  topP,
  purpose,
} = {}) {
  const { systemInstruction, contents } = toGeminiContents(messages || []);

  const body = {
    contents,
    generationConfig: {
      temperature: finiteOr(temperature, config.temperature),
      topP: finiteOr(topP, Number(process.env.LLM_TOP_P || 1)),
      maxOutputTokens: finiteOr(maxTokens, config.maxTokens),
    },
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  const urlBase = config.url.replace(/\/$/, '');
  const chosenModel = model || config.model;
  const url = `${urlBase}/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  logger.info(`LLM ${purpose}: ${config.name} (${chosenModel})`);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, llmTimeoutMs(purpose), `${config.name} LLM ${purpose}`);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${config.name} LLM failed: ${response.status} ${text || response.statusText}`);
  }

  const result = await response.json();
  const content = result?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  if (!content) {
    throw new Error(`${config.name} LLM returned no content.`);
  }
  return cleanModelText(content);
}

function toGeminiContents(messages) {
  const contents = [];
  const systemParts = [];

  for (const message of messages) {
    if (!message || typeof message.content !== 'string') continue;
    const role = message.role === 'assistant' ? 'model' : message.role === 'system' ? 'system' : 'user';

    if (role === 'system') {
      systemParts.push({ text: message.content });
      continue;
    }

    contents.push({
      role,
      parts: [{ text: message.content }],
    });
  }

  const systemInstruction = systemParts.length ? { parts: systemParts } : null;
  return { systemInstruction, contents };
}

function finiteOr(value, defaultValue) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

function llmTimeoutMs(purpose = '') {
  const value = String(purpose || '').toLowerCase();
  if (value.includes('intent') || value.includes('router')) {
    return Number(process.env.LLM_ROUTER_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 1800);
  }
  if (value.includes('response')) {
    return Number(process.env.LLM_RESPONSE_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 2500);
  }
  if (value.includes('memory') || value.includes('correction')) {
    return Number(process.env.LLM_MEMORY_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 2500);
  }
  return Number(process.env.LLM_TIMEOUT_MS || 3000);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 0, label = 'request') {
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function cleanModelText(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJson(text) {
  const value = cleanModelText(text);
  if (value.startsWith('{') && value.endsWith('}')) return value;
  const match = value.match(/\{[\s\S]*\}/);
  return match?.[0] || '';
}
