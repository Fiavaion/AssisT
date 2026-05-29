/**
 * WebLLM provider for local-ai-router.
 *
 * Extracted from AssisT src/ai/webllm-client.js. The original client runs
 * in a Chrome MV3 service worker and communicates with an offscreen document
 * holding the MLCEngine. This module provides the core availability check and
 * generate interface; the MV3-specific message-passing layer is kept in AssisT.
 *
 * WebLLM requires @mlc-ai/web-llm as a peer dependency. The peer is optional —
 * if absent, checkWebLLMAvailability() returns available: false with a clear
 * reason rather than throwing.
 *
 * @module local-ai-router/providers/webllm
 */

// Lazily imported so the peer is truly optional.
let MLCEngine = null;

async function getMLCEngine() {
  if (MLCEngine) return MLCEngine;
  try {
    const mod = await import('@mlc-ai/web-llm');
    MLCEngine = mod.MLCEngine ?? mod.CreateMLCEngine ?? null;
    return MLCEngine;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ available: boolean, reason: string | null, gpuAvailable: boolean }>}
 */
export async function checkWebLLMAvailability() {
  const engine = await getMLCEngine();
  if (!engine) {
    return { available: false, reason: '@mlc-ai/web-llm peer dependency not installed', gpuAvailable: false };
  }

  const gpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  if (!gpuAvailable) {
    return { available: false, reason: 'WebGPU not supported in this browser', gpuAvailable: false };
  }

  return { available: true, reason: null, gpuAvailable: true };
}

/**
 * Generate text using an already-initialised MLCEngine instance.
 * Callers are responsible for model loading — this function only wraps the
 * generate call so the router can treat all providers uniformly.
 *
 * @param {string} prompt
 * @param {object} engine - Initialised MLCEngine instance
 * @param {{ maxTokens?: number, temperature?: number, systemPrompt?: string }} [options]
 * @returns {Promise<{ text: string, usage: null }>}
 */
export async function webllmGenerate(prompt, engine, {
  maxTokens = 1024,
  temperature = 0.7,
  systemPrompt,
} = {}) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const reply = await engine.chat.completions.create({
    messages,
    max_tokens: maxTokens,
    temperature,
    stream: false,
  });

  const text = reply.choices?.[0]?.message?.content ?? '';
  return { text, usage: null };
}
