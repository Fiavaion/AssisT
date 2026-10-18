/**
 * Map a raw Error to a generic, user-safe message for forwarding to content
 * scripts and UI. Full error detail stays in the service-worker console.
 *
 * Extracted from service-worker.js so the mapping is unit-testable — in
 * particular the local-vs-cloud distinction (an Ollama "does not support
 * generate" 400 must NOT be reported as a cloud rate limit).
 *
 * @module utils/sanitize-error
 */

/**
 * @param {Error|string|unknown} err
 * @returns {string}
 */
export function sanitizeError(err) {
  const msg = err?.message ?? String(err) ?? 'Unknown error';
  console.error('[AssisT] sanitizeError — full error:', err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Network error — check your internet connection';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('AbortError')) {
    return 'Request timed out — try again';
  }
  // Local (Ollama) capability error: an embeddings-only model can't generate.
  // Map it to an accurate local message — must come BEFORE the rate-limit check,
  // since "does not support generate" contains the substring "rate".
  if (
    msg.includes('does not support generate') ||
    msg.includes('does not support chat') ||
    msg.includes('embedding')
  ) {
    return "This local model can't generate text — pick a different Ollama model (e.g. qwen3.5:9b). Embedding models like nomic-embed-text can't chat.";
  }
  if (msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Gemini API quota unavailable — your API key does not have active quota. Check your plan at console.cloud.google.com.';
  }
  // Match real rate-limit text only — "rate limit"/"ratelimit"/"rate-limit"/"rate limited" or 429.
  // A bare "rate" substring previously matched "gene-rate" and mislabelled local errors.
  if (msg.includes('quota') || /rate.?limit/i.test(msg) || msg.includes('429')) {
    return 'API rate limit reached — wait a moment then try again';
  }
  if (
    msg.includes('API key') ||
    msg.includes('Unauthorized') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('INVALID_ARGUMENT')
  ) {
    return `API key error — ${msg}`;
  }
  return msg;
}
