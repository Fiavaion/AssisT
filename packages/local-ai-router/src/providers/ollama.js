/**
 * Ollama provider for local-ai-router.
 *
 * Extracted and decoupled from AssisT src/ai/ollama-client.js.
 * AssisT's ollama-client adds extension-specific concerns (response caching
 * in chrome.storage, service-worker timeout handling, TASK_OPTIMAL_MODELS
 * routing). This module exposes only the transport + availability layer.
 *
 * @module local-ai-router/providers/ollama
 */

const DEFAULT_BASE_URL = 'http://localhost:11434';
const PING_TIMEOUT_MS = 3000;

/**
 * @param {{ baseUrl?: string }} [options]
 * @returns {Promise<{ available: boolean, models: string[], reason: string | null }>}
 */
export async function checkOllamaAvailability({ baseUrl = DEFAULT_BASE_URL } = {}) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(id);

    if (!res.ok) {
      return { available: false, models: [], reason: `Ollama returned HTTP ${res.status}` };
    }

    const { models = [] } = await res.json();
    return { available: true, models: models.map(m => m.name), reason: null };
  } catch (err) {
    const reason = err.name === 'AbortError'
      ? 'Ollama did not respond within 3 seconds'
      : 'Ollama not reachable — is it running?';
    return { available: false, models: [], reason };
  }
}

/**
 * @param {string} prompt
 * @param {{ baseUrl?: string, model?: string, maxTokens?: number, temperature?: number, systemPrompt?: string, timeout?: number }} options
 * @returns {Promise<{ text: string, usage: null }>}
 */
export async function ollamaGenerate(prompt, {
  baseUrl = DEFAULT_BASE_URL,
  model = 'llama3.2',
  maxTokens = 1024,
  temperature = 0.7,
  systemPrompt,
  timeout = 30000,
} = {}) {
  const body = {
    model,
    prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
    stream: false,
    options: { num_predict: maxTokens, temperature },
  };

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw Object.assign(new Error(`Ollama generate failed: ${res.status} ${text}`), { statusCode: res.status });
    }

    const { response } = await res.json();
    return { text: response ?? '', usage: null };
  } finally {
    clearTimeout(id);
  }
}
