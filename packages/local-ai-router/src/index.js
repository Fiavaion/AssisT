/**
 * @fiavaion/local-ai-router
 *
 * Four-mode local AI routing for browser extensions and web tools.
 * Degradation order: Ollama → WebLLM → Chrome Prompt API → cloud fallback.
 *
 * Extraction status (May 2026): scaffolding in place; full extraction from
 * AssisT src/ai/ is the NLnet-funded deliverable. The router, availability
 * checks, and all four provider transports are functional at this stage.
 * WebLLM engine lifecycle (model download/init) is retained in AssisT's
 * MV3 service worker and will be extracted with the full v1.0 library release.
 *
 * @example
 * import { createRouter } from '@fiavaion/local-ai-router';
 *
 * const router = createRouter({ preferredMode: 'auto' });
 * // 'auto' | 'ollama' | 'webllm' | 'promptapi' | 'cloud'
 *
 * const { text, mode } = await router.generate(prompt, { maxTokens: 500 });
 * // auto-degrades: Ollama → WebLLM → Chrome Prompt API → cloud (if key configured)
 * // mode reports which path was used
 *
 * // Check what's available without generating
 * const availability = await router.checkAvailability();
 * // { ollama: { available: true, ... }, webllm: { available: false, reason: '...' }, ... }
 *
 * @module @fiavaion/local-ai-router
 */

import { LocalAIRouter, RouterError } from './router.js';

export { createRouter, RouterError };

/**
 * Create a LocalAIRouter instance.
 *
 * @param {import('../types/index.d.ts').RouterConfig} [config]
 * @returns {import('../types/index.d.ts').LocalAIRouter}
 *
 * @example
 * // Privacy-first: local only, no cloud fallback
 * const router = createRouter({ preferredMode: 'ollama' });
 *
 * @example
 * // Auto-degrade to cloud if local unavailable
 * const router = createRouter({
 *   preferredMode: 'auto',
 *   cloudProvider: 'anthropic',
 *   cloudApiKey: process.env.ANTHROPIC_API_KEY,
 * });
 */
function createRouter(config = {}) {
  return new LocalAIRouter(config);
}
