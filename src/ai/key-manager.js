/**
 * API Key Manager for AssisT Cloud AI Mode
 *
 * Manages secure storage and retrieval of user-provided API keys
 * for cloud AI providers (Anthropic, OpenAI, Google, Perplexity).
 *
 * Keys are stored in Chrome's secure storage API (chrome.storage.local)
 * and are never embedded in the extension code.
 *
 * @module ai/key-manager
 */

/**
 * Get API key for specified provider from storage
 * @param {string} provider - Provider name (anthropic, openai, google, perplexity)
 * @returns {Promise<string|null>} API key or null if not configured
 */
export async function getApiKey(provider = 'anthropic') {
  try {
    const storageKey = `${provider}_api_key`;
    const result = await chrome.storage.local.get([storageKey]);
    return result[storageKey] || null;
  } catch (error) {
    console.error('[KeyManager] Failed to retrieve API key:', error);
    return null;
  }
}

/**
 * Save API key for specified provider to storage
 * @param {string} provider - Provider name
 * @param {string} apiKey - API key to save
 * @returns {Promise<boolean>} Success status
 */
export async function saveApiKey(provider, apiKey) {
  if (!isValidKeyFormat(provider, apiKey)) {
    console.error('[KeyManager] Invalid API key format for provider:', provider);
    return false;
  }

  try {
    const storageKey = `${provider}_api_key`;
    await chrome.storage.local.set({ [storageKey]: apiKey });
    console.log('[KeyManager] API key saved for provider:', provider);
    return true;
  } catch (error) {
    console.error('[KeyManager] Failed to save API key:', error);
    return false;
  }
}

/**
 * Check if a valid API key is configured for provider
 * @param {string} provider - Provider name
 * @returns {Promise<boolean>}
 */
export async function hasApiKey(provider = 'anthropic') {
  const key = await getApiKey(provider);
  return key !== null && isValidKeyFormat(provider, key);
}

/**
 * Delete API key for specified provider
 * @param {string} provider - Provider name
 * @returns {Promise<boolean>} Success status
 */
export async function deleteApiKey(provider) {
  try {
    const storageKey = `${provider}_api_key`;
    await chrome.storage.local.remove([storageKey]);
    console.log('[KeyManager] API key removed for provider:', provider);
    return true;
  } catch (error) {
    console.error('[KeyManager] Failed to remove API key:', error);
    return false;
  }
}

/**
 * Validate API key format for specific provider
 * @param {string} provider - Provider name (anthropic, openai, google, perplexity)
 * @param {string} key - API key to validate
 * @returns {boolean}
 */
export function isValidKeyFormat(provider, key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // Validate based on provider-specific formats
  switch (provider) {
    case 'anthropic':
      return key.startsWith('sk-ant-') && key.length > 20;
    case 'openai':
      return key.startsWith('sk-') && key.length > 20;
    case 'google':
      return key.length > 20; // Google API keys have varying formats
    case 'perplexity':
      return key.startsWith('pplx-') && key.length > 20;
    default:
      return key.length > 20; // Generic validation
  }
}

export default {
  getApiKey,
  saveApiKey,
  hasApiKey,
  deleteApiKey,
  isValidKeyFormat,
};
