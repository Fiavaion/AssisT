/**
 * OpenAI API Client for AssisT Cloud AI Mode
 *
 * Provides integration with OpenAI's chat completions API.
 * Supports GPT-4o, o1, o3, and other chat models.
 *
 * @module ai/openai-client
 */

import { getSecureAPIKey as getApiKey } from '../core/storage/secure-key-storage.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const DEFAULT_OPTIONS = {
  maxTokens: 1024,
  temperature: 0.7,
  timeout: 60000,
  maxRetries: 2,
};

// Chat-capable model prefixes for filtering the models list
const CHAT_MODEL_PREFIXES = ['gpt-4o', 'gpt-4-turbo', 'gpt-4.1', 'o1', 'o3', 'o4', 'chatgpt-4o'];

// Models to exclude even if they match prefixes
const EXCLUDED_MODELS = [
  'gpt-4o-realtime',
  'gpt-4o-audio',
  'gpt-4o-transcribe',
  'gpt-4o-mini-realtime',
  'gpt-4o-mini-audio',
  'gpt-4o-mini-transcribe',
];

/**
 * Generate text using OpenAI chat completions API
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @returns {Promise<{content: string, usage: Object}>}
 */
export async function openaiGenerate(prompt, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const apiKey = await getApiKey('openai');
  if (!apiKey) {
    throw new Error(
      'OpenAI API key not configured. Please add your API key in Advanced Options > AI tab.'
    );
  }

  const modelId = opts.model || 'gpt-4o';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `OpenAI API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content || '';
    const usage = {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    };

    console.log(`[OpenAIClient] ${modelId} response: ${usage.totalTokens} tokens`);

    return { content, usage };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('OpenAI request timed out. Try again or use a faster model.');
    }

    if (error.message.includes('429')) {
      throw new Error('Rate limited. Please wait a moment before trying again.');
    }

    if (opts._retryCount < opts.maxRetries && !error.message.includes('API key')) {
      console.log(`[OpenAIClient] Retrying... (${(opts._retryCount || 0) + 1}/${opts.maxRetries})`);
      return openaiGenerate(prompt, {
        ...opts,
        _retryCount: (opts._retryCount || 0) + 1,
      });
    }

    throw error;
  }
}

/**
 * Fetch available chat models from OpenAI API
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
export async function fetchOpenAIModels(apiKey) {
  const response = await fetch(OPENAI_MODELS_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${apiKey}` },
    credentials: 'omit',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = await response.json();
  const allModels = data.data || [];

  // Filter to chat-capable models
  const chatModels = allModels
    .filter(m => {
      const id = m.id.toLowerCase();
      // Must match a chat prefix
      const matchesPrefix = CHAT_MODEL_PREFIXES.some(p => id.startsWith(p));
      // Must not be excluded
      const isExcluded = EXCLUDED_MODELS.some(e => id.startsWith(e));
      return matchesPrefix && !isExcluded;
    })
    .map(m => ({
      id: m.id,
      name: formatOpenAIModelName(m.id),
      description: getOpenAIModelDescription(m.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return chatModels;
}

/**
 * Format OpenAI model ID into a clean display name
 * @param {string} modelId
 * @returns {string}
 */
function formatOpenAIModelName(modelId) {
  const id = modelId.toLowerCase();

  if (id === 'gpt-4o') {
    return 'GPT-4o (Recommended)';
  }
  if (id === 'gpt-4o-mini') {
    return 'GPT-4o Mini (Fast)';
  }
  if (id.startsWith('gpt-4.1')) {
    return modelId.replace('gpt-', 'GPT-');
  }
  if (id.startsWith('gpt-4-turbo')) {
    return 'GPT-4 Turbo';
  }
  if (id === 'o1') {
    return 'o1 (Reasoning)';
  }
  if (id === 'o1-mini') {
    return 'o1 Mini (Reasoning)';
  }
  if (id === 'o3') {
    return 'o3 (Reasoning)';
  }
  if (id === 'o3-mini') {
    return 'o3 Mini (Reasoning)';
  }
  if (id.startsWith('chatgpt-4o')) {
    return 'ChatGPT-4o';
  }

  // Fallback: clean up the ID
  return modelId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Get description for known OpenAI models
 * @param {string} modelId
 * @returns {string}
 */
function getOpenAIModelDescription(modelId) {
  const id = modelId.toLowerCase();

  if (id === 'gpt-4o') {
    return 'Best for everyday tasks';
  }
  if (id === 'gpt-4o-mini') {
    return 'Fast and economical';
  }
  if (id.startsWith('gpt-4.1')) {
    return 'Latest GPT model';
  }
  if (id.startsWith('gpt-4-turbo')) {
    return 'High capability';
  }
  if (id.startsWith('o1')) {
    return 'Advanced reasoning';
  }
  if (id.startsWith('o3')) {
    return 'Advanced reasoning';
  }
  if (id.startsWith('o4')) {
    return 'Latest reasoning model';
  }

  return '';
}

export default {
  openaiGenerate,
  fetchOpenAIModels,
};
