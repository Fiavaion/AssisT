/**
 * Chrome built-in Prompt API provider.
 *
 * The Prompt API (window.ai / LanguageModel) is Chrome 127+ and
 * hardware-gated (Gemini Nano on-device). On Firefox and Safari this
 * check always returns available: false — the router skips it cleanly.
 *
 * AssisT capability-detects this at runtime and shows honest UX copy
 * when unavailable. This module follows the same pattern.
 *
 * @module local-ai-router/providers/promptapi
 */

/**
 * @returns {Promise<{ available: boolean, reason: string | null }>}
 */
export async function checkPromptAPIAvailability() {
  if (typeof window === 'undefined') {
    return { available: false, reason: 'Not running in a browser context' };
  }

  // Chrome Prompt API surface — may be window.ai or window.LanguageModel depending on version.
  const api = window.ai ?? window.LanguageModel ?? null;
  if (!api) {
    return { available: false, reason: 'Chrome Prompt API not available (Chrome 127+ with Gemini Nano required)' };
  }

  try {
    const capabilities = await api.capabilities?.() ?? await api.availability?.() ?? null;
    if (capabilities === 'no' || capabilities?.available === 'no') {
      return { available: false, reason: 'Gemini Nano not downloaded on this device' };
    }
    return { available: true, reason: null };
  } catch {
    return { available: false, reason: 'Chrome Prompt API availability check failed' };
  }
}

/**
 * @param {string} prompt
 * @param {{ maxTokens?: number, temperature?: number, systemPrompt?: string }} [options]
 * @returns {Promise<{ text: string, usage: null }>}
 */
export async function promptAPIGenerate(prompt, { maxTokens, temperature, systemPrompt } = {}) {
  const api = window.ai ?? window.LanguageModel;
  if (!api) throw new Error('Chrome Prompt API not available');

  const session = await api.createTextSession?.({
    systemPrompt,
    temperature,
  }) ?? await api.create?.({ systemPrompt, temperature });

  try {
    const text = await session.prompt(prompt);
    return { text: text ?? '', usage: null };
  } finally {
    session.destroy?.();
  }
}
