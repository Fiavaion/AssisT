/**
 * Google Gemini API Client for AssisT Cloud AI Mode
 *
 * Provides integration with Google's Generative Language API.
 * The models offered are listed in model-registry.js.
 *
 * @module ai/google-client
 */

import { getSecureAPIKey as getApiKey } from '../core/storage/secure-key-storage.js';
import { REGISTRY, getModelId } from './model-registry.js';

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

  const modelId = opts.model || getModelId('google', REGISTRY.google.defaultModel);
  const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens, temperature: opts.temperature },
      }),
      signal: AbortSignal.timeout(opts.timeout),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const apiMessage =
        errorData.error?.message || `Gemini API error: ${response.status} ${response.statusText}`;
      console.error('[GeminiClient] API error:', response.status, errorData?.error?.message);
      if (response.status === 429) {
        throw new Error(`Rate limited. ${apiMessage}`);
      }
      throw new Error(apiMessage);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = {
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    };

    console.log(
      `[GeminiClient] ${modelId} response: ${usage.totalTokens} tokens, content length: ${content.length}`
    );

    return { content, usage };
  } catch (error) {
    console.error('[GeminiClient] error:', error.message);

    if (error.name === 'AbortError') {
      throw new Error('Gemini request timed out. Try again or use a faster model.');
    }

    if (error.message.startsWith('Rate limited')) {
      throw error; // Don't retry — wait for the caller to surface the message
    }

    if (opts._retryCount < opts.maxRetries && !error.message.includes('API key')) {
      console.log(`[GeminiClient] Retrying... (${(opts._retryCount || 0) + 1}/${opts.maxRetries})`);
      return geminiGenerate(prompt, { ...opts, _retryCount: (opts._retryCount || 0) + 1 });
    }

    throw error;
  }
}

export default {
  geminiGenerate,
};
