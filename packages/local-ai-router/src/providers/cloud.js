/**
 * Cloud provider stub for local-ai-router.
 *
 * In AssisT the cloud path goes through src/ai/cloud-router.js, which
 * delegates to provider-specific clients (claude-client, google-client,
 * openai-client). This module is the minimal interface needed by the
 * local-ai-router for fallback — it does not replicate AssisT's full
 * provider-registry logic.
 *
 * @module local-ai-router/providers/cloud
 */

const ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  google: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  openai: 'https://api.openai.com/v1/chat/completions',
};

/**
 * @param {{ provider?: string, apiKey?: string }} options
 * @returns {{ available: boolean, reason: string | null }}
 */
export function checkCloudAvailability({ provider = 'anthropic', apiKey } = {}) {
  if (!apiKey) return { available: false, reason: `No API key configured for ${provider}` };
  if (!ENDPOINTS[provider]) return { available: false, reason: `Unknown cloud provider: ${provider}` };
  return { available: true, reason: null };
}

/**
 * @param {string} prompt
 * @param {{ provider?: string, apiKey: string, model?: string, maxTokens?: number, temperature?: number, systemPrompt?: string, timeout?: number }} options
 * @returns {Promise<{ text: string, usage: { promptTokens: number, completionTokens: number } | null }>}
 */
export async function cloudGenerate(prompt, {
  provider = 'anthropic',
  apiKey,
  model,
  maxTokens = 1024,
  temperature = 0.7,
  systemPrompt,
  timeout = 30000,
} = {}) {
  if (!apiKey) throw new Error(`API key required for cloud provider: ${provider}`);

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    if (provider === 'anthropic') return await anthropicGenerate(prompt, { apiKey, model, maxTokens, temperature, systemPrompt, signal: controller.signal });
    if (provider === 'google') return await googleGenerate(prompt, { apiKey, model, maxTokens, temperature, systemPrompt, signal: controller.signal });
    if (provider === 'openai') return await openaiGenerate(prompt, { apiKey, model, maxTokens, temperature, systemPrompt, signal: controller.signal });
    throw new Error(`Unknown provider: ${provider}`);
  } finally {
    clearTimeout(id);
  }
}

// ─── Provider-specific request builders ───────────────────────────────────────

async function anthropicGenerate(prompt, { apiKey, model = 'claude-sonnet-4-6', maxTokens, temperature, systemPrompt, signal }) {
  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
    ...(systemPrompt ? { system: systemPrompt } : {}),
  };

  const res = await fetch(ENDPOINTS.anthropic, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 429) throw Object.assign(new Error('Rate limited'), { statusCode: 429, retryable: true });
  if (!res.ok) throw Object.assign(new Error(`Anthropic API error: ${res.status}`), { statusCode: res.status });

  const data = await res.json();
  return {
    text: data.content?.[0]?.text ?? '',
    usage: { promptTokens: data.usage?.input_tokens ?? null, completionTokens: data.usage?.output_tokens ?? null },
  };
}

async function googleGenerate(prompt, { apiKey, model, maxTokens, temperature, systemPrompt, signal }) {
  const endpoint = model
    ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    : ENDPOINTS.google;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature },
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
  };

  const res = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (res.status === 429) throw Object.assign(new Error('Rate limited'), { statusCode: 429, retryable: true });
  if (!res.ok) throw Object.assign(new Error(`Google AI error: ${res.status}`), { statusCode: res.status });

  const data = await res.json();
  return { text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '', usage: null };
}

async function openaiGenerate(prompt, { apiKey, model = 'gpt-4o-mini', maxTokens, temperature, systemPrompt, signal }) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(ENDPOINTS.openai, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
    signal,
  });

  if (res.status === 429) throw Object.assign(new Error('Rate limited'), { statusCode: 429, retryable: true });
  if (!res.ok) throw Object.assign(new Error(`OpenAI error: ${res.status}`), { statusCode: res.status });

  const data = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    usage: { promptTokens: data.usage?.prompt_tokens ?? null, completionTokens: data.usage?.completion_tokens ?? null },
  };
}
