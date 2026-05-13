/**
 * LLM Feature Module - Entry Point
 *
 * This module is the entry point for LLM features.
 * It exports a conditional loader that only initializes LLM features
 * when __LLM_ENABLED__ is true (set by Vite build config).
 *
 * Usage in other modules:
 *
 *   import { initLLMIfEnabled } from '@/features/llm';
 *
 *   // This will only load LLM features in the LLM build
 *   const llm = await initLLMIfEnabled();
 *   if (llm) {
 *     const summary = await llm.summarize(selectedText);
 *   }
 *
 * @module llm
 */

export { LLMController, getLLMController } from './llm-controller.js';

/**
 * Conditionally initialize LLM features
 * Returns null if LLM is not enabled in this build
 * @returns {Promise<import('./llm-controller.js').LLMController|null>}
 */
export async function initLLMIfEnabled() {
  // __LLM_ENABLED__ is defined by Vite at build time
  if (typeof __LLM_ENABLED__ !== 'undefined' && __LLM_ENABLED__) {
    const { getLLMController } = await import('./llm-controller.js');
    const controller = getLLMController();

    // Check if local LLM is available
    const status = await controller.checkAvailability();
    if (status.available) {
      console.log(`[LLM] Connected to ${status.provider}`);
      return controller;
    } else {
      console.log('[LLM] No local LLM service detected');
      return controller; // Return anyway, user might start service later
    }
  }

  return null;
}

/**
 * Check if LLM features are enabled in this build
 * @returns {boolean}
 */
export function isLLMEnabled() {
  return typeof __LLM_ENABLED__ !== 'undefined' && __LLM_ENABLED__;
}
