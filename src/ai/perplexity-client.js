/**
 * Perplexity API Client for AssisT Cloud AI Mode
 *
 * Provides integration with Perplexity's chat completions API.
 * Uses OpenAI-compatible format with Perplexity's Sonar models.
 *
 * @module ai/perplexity-client
 */

import { getSecureAPIKey as getApiKey } from '../core/storage/secure-key-storage.js';

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

const DEFAULT_OPTIONS = {
  maxTokens: 1024,
  temperature: 0.7,
  timeout: 60000,
  maxRetries: 2,
};

// Perplexity has no model listing API — hardcoded list
const PERPLEXITY_MODELS = [
  { id: 'sonar', name: 'Sonar (Recommended)', description: 'Best for everyday tasks' },
  { id: 'sonar-pro', name: 'Sonar Pro (Most Capable)', description: 'Most capable with citations' },
  {
    id: 'sonar-reasoning',
    name: 'Sonar Reasoning',
    description: 'Advanced reasoning with chain-of-thought',
  },
  {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    description: 'Best reasoning with citations',
  },
];

/**
 * Generate text using Perplexity chat completions API (OpenAI-compatible)
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options
 * @returns {Promise<{content: string, usage: Object}>}
 */
export async function perplexityGenerate(prompt, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const apiKey = await getApiKey('perplexity');
  if (!apiKey) {
    throw new Error(
      'Perplexity API key not configured. Please add your API key in Advanced Options > AI tab.'
    );
  }

  const modelId = opts.model || 'sonar';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), opts.timeout);

    const response = await fetch(PERPLEXITY_API_URL, {
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
        errorData.error?.message ||
          `Perplexity API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content || '';
    const usage = {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    };

    console.log(`[PerplexityClient] ${modelId} response: ${usage.totalTokens} tokens`);

    return { content, usage };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Perplexity request timed out. Try again or use a faster model.');
    }

    if (error.message.includes('429')) {
      throw new Error('Rate limited. Please wait a moment before trying again.');
    }

    if (opts._retryCount < opts.maxRetries && !error.message.includes('API key')) {
      console.log(
        `[PerplexityClient] Retrying... (${(opts._retryCount || 0) + 1}/${opts.maxRetries})`
      );
      return perplexityGenerate(prompt, {
        ...opts,
        _retryCount: (opts._retryCount || 0) + 1,
      });
    }

    throw error;
  }
}

/**
 * Get available Perplexity models (hardcoded — no listing API)
 * @returns {Promise<Array<{id: string, name: string, description: string}>>}
 */
export async function fetchPerplexityModels() {
  return [...PERPLEXITY_MODELS];
}

export default {
  perplexityGenerate,
  fetchPerplexityModels,
};
