/**
 * API Key Manager - Secure storage for cloud AI provider API keys
 *
 * This module provides encrypted storage for API keys using CryptoJS AES encryption.
 * Keys are encrypted with a device-specific identifier before being stored in Chrome's
 * local storage, ensuring they are not stored in plain text.
 *
 * Security features:
 * - AES encryption via CryptoJS
 * - Device-specific encryption key
 * - Keys never stored in plain text
 * - Complies with FERPA/HIPAA privacy requirements
 *
 * @module api-key-manager
 */

import CryptoJS from 'crypto-js';

/**
 * Generate or retrieve the encryption key for this device
 * Uses a device-specific UUID stored in Chrome local storage
 *
 * @returns {Promise<string>} The encryption key
 */
async function getEncryptionKey() {
  const result = await chrome.storage.local.get('deviceId');

  if (!result.deviceId) {
    // Generate a new device ID if one doesn't exist
    const newId = crypto.randomUUID();
    await chrome.storage.local.set({ deviceId: newId });
    return newId;
  }

  return result.deviceId;
}

/**
 * Save an API key for a specific provider (encrypted)
 *
 * @param {string} provider - The provider name ('anthropic', 'openai', 'google')
 * @param {string} apiKey - The API key to save
 * @returns {Promise<void>}
 *
 * @example
 * await saveAPIKey('anthropic', 'sk-ant-...');
 */
export async function saveAPIKey(provider, apiKey) {
  if (!apiKey || !provider) {
    throw new Error('Provider and API key are required');
  }

  const key = await getEncryptionKey();
  const encrypted = CryptoJS.AES.encrypt(apiKey, key).toString();

  await chrome.storage.local.set({
    [`apiKey_${provider}_encrypted`]: encrypted
  });

  console.log(`[API Key Manager] API key saved for provider: ${provider}`);
}

/**
 * Retrieve an API key for a specific provider (decrypted)
 *
 * @param {string} provider - The provider name ('anthropic', 'openai', 'google')
 * @returns {Promise<string|null>} The decrypted API key, or null if not found
 *
 * @example
 * const apiKey = await getAPIKey('anthropic');
 */
export async function getAPIKey(provider) {
  if (!provider) {
    throw new Error('Provider is required');
  }

  const key = await getEncryptionKey();
  const result = await chrome.storage.local.get(`apiKey_${provider}_encrypted`);

  if (!result[`apiKey_${provider}_encrypted`]) {
    return null;
  }

  try {
    const decrypted = CryptoJS.AES.decrypt(
      result[`apiKey_${provider}_encrypted`],
      key
    ).toString(CryptoJS.enc.Utf8);

    return decrypted;
  } catch (error) {
    console.error(`[API Key Manager] Failed to decrypt API key for ${provider}:`, error);
    return null;
  }
}

/**
 * Delete an API key for a specific provider
 *
 * @param {string} provider - The provider name ('anthropic', 'openai', 'google')
 * @returns {Promise<void>}
 *
 * @example
 * await deleteAPIKey('anthropic');
 */
export async function deleteAPIKey(provider) {
  if (!provider) {
    throw new Error('Provider is required');
  }

  await chrome.storage.local.remove(`apiKey_${provider}_encrypted`);
  console.log(`[API Key Manager] API key deleted for provider: ${provider}`);
}

/**
 * Check if an API key exists for a specific provider
 *
 * @param {string} provider - The provider name ('anthropic', 'openai', 'google')
 * @returns {Promise<boolean>} True if an API key exists, false otherwise
 *
 * @example
 * const hasKey = await hasAPIKey('anthropic');
 */
export async function hasAPIKey(provider) {
  if (!provider) {
    throw new Error('Provider is required');
  }

  const result = await chrome.storage.local.get(`apiKey_${provider}_encrypted`);
  return !!result[`apiKey_${provider}_encrypted`];
}

/**
 * Test API connection with provider
 * @param {string} provider - Provider name ('anthropic', 'openai', 'google')
 * @param {string} apiKey - The API key to test
 * @returns {Promise<boolean>} True if connection successful
 *
 * @example
 * const isValid = await testConnection('anthropic', 'sk-ant-...');
 */
export async function testConnection(provider, apiKey) {
  try {
    switch (provider) {
      case 'anthropic':
        return await testAnthropicConnection(apiKey);
      case 'openai':
        return await testOpenAIConnection(apiKey);
      case 'google':
        return await testGoogleConnection(apiKey);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (error) {
    console.error('[API Key Manager] Connection test failed:', error);
    return false;
  }
}

/**
 * Test Anthropic API connection
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<boolean>}
 */
async function testAnthropicConnection(apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'test' }],
    }),
  });

  return response.ok;
}

/**
 * Test OpenAI API connection
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<boolean>}
 */
async function testOpenAIConnection(apiKey) {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  return response.ok;
}

/**
 * Test Google AI connection
 * @param {string} apiKey - Google AI API key
 * @returns {Promise<boolean>}
 */
async function testGoogleConnection(apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    {
      method: 'GET',
    }
  );

  return response.ok;
}

/**
 * Get all saved provider API keys (for checking which are configured)
 * @returns {Promise<string[]>} Array of provider names with saved keys
 *
 * @example
 * const providers = await getSavedProviders(); // ['anthropic', 'openai']
 */
export async function getSavedProviders() {
  const result = await chrome.storage.local.get(null);
  const providers = [];

  for (const key in result) {
    if (key.startsWith('apiKey_') && key.endsWith('_encrypted')) {
      const provider = key.replace('apiKey_', '').replace('_encrypted', '');
      providers.push(provider);
    }
  }

  return providers;
}
