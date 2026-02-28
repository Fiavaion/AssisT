/**
 * Google Gemini API Client for AssisT Cloud AI Mode
 *
 * Provides integration with Google's Generative Language API.
 * Supports Gemini 2.0, 1.5, and future models.
 *
 * @module ai/google-client
 */

import { getSecureAPIKey as getApiKey } from '../core/storage/secure-key-storage.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const DEFAULT_OPTIONS = {
  maxTokens: 1024,
  temperature: 0.7,
  timeout: 60000,
  maxRetries: 2,
};

/**
 * Generate text using Google Gemini API
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @returns {Promise<{content: string, usage: Object}>}
 */
export async function geminiGenerate(prompt, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const apiKey = await getApiKey('google');
  if (!apiKey) {
    throw new Error(
      'Google AI API key not configured. Please add your API key in Advanced Options > AI tab.'
    );
  }

  const modelId = opts.model || 'gemini-2.0-flash';
  // Gemini API uses models/{id}:generateContent format
  const modelPath = modelId.startsWith('models/') ? modelId : `models/${modelId}`;
  const url = `${GEMINI_API_BASE}/${modelPath}:generateContent`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: opts.maxTokens,
          temperature: opts.temperature,
        },
      }),
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `Gemini API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    };

    console.log(`[GeminiClient] ${modelId} response: ${usage.totalTokens} tokens`);

    return { content, usage };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Gemini request timed out. Try again or use a faster model.');
    }

    if (error.message.includes('429')) {
      throw new Error('Rate limited. Please wait a moment before trying again.');
    }

    if (opts._retryCount < opts.maxRetries && !error.message.includes('API key')) {
      console.log(`[GeminiClient] Retrying... (${(opts._retryCount || 0) + 1}/${opts.maxRetries})`);
      return geminiGenerate(prompt, {
        ...opts,
        _retryCount: (opts._retryCount || 0) + 1,
      });
    }

    throw error;
  }
}

/**
 * Fetch available models from Google Generative Language API
 * @param {string} apiKey - Google AI API key
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
export async function fetchGeminiModels(apiKey) {
  const response = await fetch(`${GEMINI_API_BASE}/models`, {
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey },
    credentials: 'omit',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = await response.json();
  const allModels = data.models || [];

  // Filter to models that support generateContent (text generation)
  const chatModels = allModels
    .filter(
      m =>
        m.supportedGenerationMethods?.includes('generateContent') &&
        !m.name?.includes('embedding') &&
        !m.name?.includes('aqa')
    )
    .map(m => {
      // m.name is like "models/gemini-2.0-flash"
      const id = m.name?.replace('models/', '') || m.name;
      return {
        id,
        name: m.displayName || formatGeminiModelName(id),
        description: getGeminiModelDescription(id),
      };
    })
    .sort((a, b) => {
      // Sort newest/best first
      const order = getGeminiSortOrder(a.id) - getGeminiSortOrder(b.id);
      return order || a.name.localeCompare(b.name);
    });

  return chatModels;
}

/**
 * Format Gemini model ID into a clean display name
 * @param {string} modelId
 * @returns {string}
 */
function formatGeminiModelName(modelId) {
  const id = modelId.toLowerCase();

  if (id.includes('2.5-pro')) {
    return 'Gemini 2.5 Pro';
  }
  if (id.includes('2.5-flash')) {
    return 'Gemini 2.5 Flash';
  }
  if (id.includes('2.0-flash-lite')) {
    return 'Gemini 2.0 Flash Lite (Fast)';
  }
  if (id.includes('2.0-flash')) {
    return 'Gemini 2.0 Flash (Recommended)';
  }
  if (id.includes('1.5-pro')) {
    return 'Gemini 1.5 Pro';
  }
  if (id.includes('1.5-flash')) {
    return 'Gemini 1.5 Flash';
  }

  // Fallback
  return modelId
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Get description for known Gemini models
 * @param {string} modelId
 * @returns {string}
 */
function getGeminiModelDescription(modelId) {
  const id = modelId.toLowerCase();

  if (id.includes('2.5-pro')) {
    return 'Most capable';
  }
  if (id.includes('2.5-flash')) {
    return 'Fast and capable';
  }
  if (id.includes('2.0-flash-lite')) {
    return 'Fastest, most economical';
  }
  if (id.includes('2.0-flash')) {
    return 'Best for everyday tasks';
  }
  if (id.includes('1.5-pro')) {
    return 'High capability';
  }
  if (id.includes('1.5-flash')) {
    return 'Fast and economical';
  }

  return '';
}

/**
 * Sort order for Gemini models (lower = first)
 * @param {string} modelId
 * @returns {number}
 */
function getGeminiSortOrder(modelId) {
  const id = modelId.toLowerCase();
  if (id.includes('2.5-pro')) {
    return 1;
  }
  if (id.includes('2.5-flash')) {
    return 2;
  }
  if (id.includes('2.0-flash-lite')) {
    return 4;
  }
  if (id.includes('2.0-flash')) {
    return 3;
  }
  if (id.includes('1.5-pro')) {
    return 5;
  }
  if (id.includes('1.5-flash')) {
    return 6;
  }
  return 99;
}

export default {
  geminiGenerate,
  fetchGeminiModels,
};
