/**
 * API Key Manager for AssisT Cloud AI Mode
 *
 * Provides obfuscated storage and retrieval of embedded API key
 * for focus group testing. Uses XOR encryption with base64 encoding.
 *
 * SECURITY NOTE: This is obfuscation, not true encryption.
 * Suitable for focus group distribution only - remove before public release.
 *
 * @module ai/key-manager
 */

// Obfuscation key - known to extension, used for XOR
const OBFUSCATION_KEY = 'ASSIST_FOCUS_GROUP_2025';

// Embedded encrypted API key (XOR + base64)
// Generated for focus group distribution - December 2025
const ENCRYPTED_KEY = 'Mjh+KD0gcic/KmVgcjQRKQEzCnNbWnAqKjUhHh8ZAXsqZDEMEBgrZglrQ2BHZzMnYxEpYGYOeBkvOCUIPGIkEQ1GSlRNDAFgGBYfAAF7JBYQKT8mGwwUEnNEewMZJgARAGwea343Gj0sMBMO';

/**
 * Decrypt the embedded API key at runtime
 * @returns {Promise<string>} Decrypted API key
 */
export async function getDecryptedApiKey() {
  if (ENCRYPTED_KEY === 'PLACEHOLDER_ENCRYPTED_KEY') {
    console.warn('[KeyManager] API key not configured. Run encryptApiKey() first.');
    return null;
  }

  try {
    const encrypted = atob(ENCRYPTED_KEY);
    let decrypted = '';

    for (let i = 0; i < encrypted.length; i++) {
      decrypted += String.fromCharCode(
        encrypted.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
      );
    }

    return decrypted;
  } catch (error) {
    console.error('[KeyManager] Failed to decrypt API key:', error);
    return null;
  }
}

/**
 * Check if a valid API key is configured
 * @returns {Promise<boolean>}
 */
export async function hasApiKey() {
  const key = await getDecryptedApiKey();
  return key !== null && key.startsWith('sk-');
}

/**
 * Validate API key format
 * @param {string} key - API key to validate
 * @returns {boolean}
 */
export function isValidKeyFormat(key) {
  return typeof key === 'string' && key.startsWith('sk-') && key.length > 20;
}

/**
 * Utility function to encrypt an API key for embedding
 * Run this once in browser console to get the encrypted value
 *
 * Usage:
 *   1. Open browser console
 *   2. Run: encryptApiKey('sk-ant-api03-your-key-here')
 *   3. Copy output and replace ENCRYPTED_KEY constant above
 *
 * @param {string} plainKey - Plain text API key
 * @returns {string} Encrypted (base64) key to embed in code
 */
export function encryptApiKey(plainKey) {
  if (!isValidKeyFormat(plainKey)) {
    console.error('[KeyManager] Invalid API key format. Must start with "sk-"');
    return null;
  }

  let encrypted = '';
  for (let i = 0; i < plainKey.length; i++) {
    encrypted += String.fromCharCode(
      plainKey.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
    );
  }

  const result = btoa(encrypted);
  console.log('[KeyManager] Encrypted key generated. Replace ENCRYPTED_KEY with:');
  console.log(result);
  return result;
}

// Make encryptApiKey available globally for developer use in console
if (typeof window !== 'undefined') {
  window.assistEncryptApiKey = encryptApiKey;
}

export default {
  getDecryptedApiKey,
  hasApiKey,
  isValidKeyFormat,
  encryptApiKey
};
