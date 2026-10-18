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

const DEFAULT_OPTIONS = {
  maxTokens: 1024,
  temperature: 0.7,
  timeout: 60000,
  maxRetries: 2,
};

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

export default {
  openaiGenerate,
};
