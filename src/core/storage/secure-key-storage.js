/**
 * API key storage.
 *
 * Each key is encrypted with AES-GCM-256 under a key derived by PBKDF2 (SHA-256, 100,000
 * iterations, a fresh salt and IV per encryption) from two random values generated on first use:
 * a per-install identifier and a second random entropy string. Both are stored in
 * chrome.storage.local, next to the encrypted keys.
 *
 * What that buys, plainly: keys are not readable at a glance in a storage dump, a settings export
 * or a screenshot of DevTools. It does NOT protect them from anyone who can read the extension's
 * storage, because everything needed to decrypt them sits in that same storage. Treat it as
 * obfuscation at rest, not as a secret the student holds.
 *
 * @module core/storage/secure-key-storage
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits for AES-GCM
const KEY_LENGTH = 256; // AES-256

// Storage keys
const STORAGE_PREFIX = 'secure_apikey_';
const MACHINE_ID_KEY = 'assist_machine_id';
const STATIC_ENTROPY_KEY = 'assist_static_entropy';

/**
 * Get or create the random per-install identifier the encryption key is derived from.
 * @returns {Promise<string>}
 * @private
 */
async function getMachineIdentifier() {
  const result = await chrome.storage.local.get(MACHINE_ID_KEY);

  if (result[MACHINE_ID_KEY]) {
    return result[MACHINE_ID_KEY];
  }

  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const machineId = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  await chrome.storage.local.set({ [MACHINE_ID_KEY]: machineId });
  return machineId;
}

/**
 * Get or create the second random input to key derivation, generated per install rather than
 * hardcoded so it differs between installs. It is stored beside the identifier.
 * @returns {Promise<string>}
 * @private
 */
async function getStaticEntropy() {
  const result = await chrome.storage.local.get(STATIC_ENTROPY_KEY);

  if (result[STATIC_ENTROPY_KEY]) {
    return result[STATIC_ENTROPY_KEY];
  }

  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const staticEntropy = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  await chrome.storage.local.set({ [STATIC_ENTROPY_KEY]: staticEntropy });
  return staticEntropy;
}

/**
 * Derive the AES-GCM key for one encryption from the stored per-install values.
 * @param {Uint8Array} salt - Unique salt for this derivation
 * @returns {Promise<CryptoKey>}
 * @private
 */
async function deriveEncryptionKey(salt) {
  const combinedInput = (await getMachineIdentifier()) + (await getStaticEntropy());

  // Import the base key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(combinedInput),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive the actual encryption key
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // Not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string value using AES-GCM-256
 * @param {string} plaintext - The value to encrypt
 * @returns {Promise<string>} - Base64-encoded encrypted data
 * @private
 */
async function encrypt(plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveEncryptionKey(salt);

  const encodedPlaintext = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encodedPlaintext
  );

  // Combine salt + IV + ciphertext
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a previously encrypted value
 * @param {string} encryptedData - Base64-encoded encrypted data
 * @returns {Promise<string>} - The decrypted plaintext
 * @private
 */
async function decrypt(encryptedData) {
  const combined = new Uint8Array(
    atob(encryptedData)
      .split('')
      .map(c => c.charCodeAt(0))
  );

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveEncryptionKey(salt);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);

  return new TextDecoder().decode(decrypted);
}

/**
 * Save an API key securely
 * @param {string} provider - Provider name ('anthropic', 'openai', 'google', 'perplexity')
 * @param {string} apiKey - The API key to save
 * @returns {Promise<boolean>} - Success status
 */
export async function saveSecureAPIKey(provider, apiKey) {
  if (!provider || typeof provider !== 'string') {
    throw new Error('Provider name is required');
  }

  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('API key is required');
  }

  try {
    const encryptedKey = await encrypt(apiKey);
    const storageKey = `${STORAGE_PREFIX}${provider.toLowerCase()}`;

    await chrome.storage.local.set({
      [storageKey]: {
        encrypted: encryptedKey,
        createdAt: Date.now(),
        rotatedAt: Date.now(),
        version: 2,
      },
    });

    return true;
  } catch (error) {
    console.error('[SecureKeyStorage] Save failed:', error.message);
    return false;
  }
}

/**
 * Retrieve a securely stored API key
 * @param {string} provider - Provider name
 * @returns {Promise<string|null>} - The decrypted API key, or null if not found
 */
export async function getSecureAPIKey(provider) {
  if (!provider || typeof provider !== 'string') {
    throw new Error('Provider name is required');
  }

  try {
    const storageKey = `${STORAGE_PREFIX}${provider.toLowerCase()}`;
    const result = await chrome.storage.local.get(storageKey);

    if (!result[storageKey]?.encrypted) {
      return null;
    }

    return await decrypt(result[storageKey].encrypted);
  } catch (error) {
    console.error('[SecureKeyStorage] Retrieve failed:', error.message);
    return null;
  }
}

/**
 * Check if a secure API key exists for a provider
 * @param {string} provider - Provider name
 * @returns {Promise<boolean>}
 */
export async function hasSecureAPIKey(provider) {
  if (!provider) {
    return false;
  }

  try {
    const storageKey = `${STORAGE_PREFIX}${provider.toLowerCase()}`;
    const result = await chrome.storage.local.get(storageKey);
    return !!result[storageKey]?.encrypted;
  } catch {
    return false;
  }
}

/**
 * Delete a securely stored API key
 * @param {string} provider - Provider name
 * @returns {Promise<boolean>} - Success status
 */
export async function deleteSecureAPIKey(provider) {
  if (!provider) {
    throw new Error('Provider name is required');
  }

  try {
    const storageKey = `${STORAGE_PREFIX}${provider.toLowerCase()}`;
    await chrome.storage.local.remove(storageKey);
    return true;
  } catch (error) {
    console.error('[SecureKeyStorage] Delete failed:', error.message);
    return false;
  }
}

/**
 * Get list of providers with saved keys (without exposing key values)
 * @returns {Promise<Array<{provider: string, createdAt: number, rotatedAt: number}>>}
 */
export async function listSecureAPIKeys() {
  try {
    const allData = await chrome.storage.local.get(null);
    const keys = [];

    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(STORAGE_PREFIX) && value?.encrypted) {
        keys.push({
          provider: key.replace(STORAGE_PREFIX, ''),
          createdAt: value.createdAt || null,
          rotatedAt: value.rotatedAt || value.createdAt || null,
          version: value.version || 1,
        });
      }
    }

    return keys;
  } catch {
    return [];
  }
}

/**
 * Storage left behind by the DeepL and Microsoft (Azure) Translator key fields, which were
 * withdrawn because nothing in the extension could call either service (ADR 0006). A stored
 * credential for a service the extension cannot use is deleted, never migrated.
 */
const WITHDRAWN_TRANSLATOR_KEYS = [
  `${STORAGE_PREFIX}deepl`,
  `${STORAGE_PREFIX}azure-translator`,
  'translationApiKeys',
  'deepl_api_key',
  'apiKey_deepl_encrypted',
];

/**
 * Storage an earlier build's optional user password and key rotation could have written. Neither
 * had a screen or a working caller, so both were removed; what they may have left is deleted.
 */
const REMOVED_LAYER_KEYS = [
  'assist_key_rotation_settings',
  'assist_temp_password',
  'assist_temp_password_ts',
  'assist_password_hash',
  'assist_password_salt',
];

/**
 * Migrate from legacy plain-text or CryptoJS storage, and delete the keys of withdrawn providers
 * and the leftovers of the removed password and rotation layers.
 *
 * A plain-text `<provider>_api_key` is encrypted into `secure_apikey_<provider>` only when no
 * encrypted key is stored for that provider: a live key is newer than any plain-text leftover and
 * is never overwritten. The plain copy is deleted once the encrypted key is known to be there (it
 * was saved, or a live one already was); if saving fails, the plain copy is kept, so the key is not
 * lost, and the next update tries again. Runs on every extension update; safe to run any number
 * of times.
 * @returns {Promise<{migrated: number, errors: number}>} keys newly encrypted, and keys that could
 *   not be
 */
export async function migrateLegacyKeys() {
  const stats = { migrated: 0, errors: 0 };
  const providers = ['anthropic', 'openai', 'google', 'perplexity'];

  try {
    const allData = await chrome.storage.local.get(null);

    for (const provider of providers) {
      // Plain-text keys
      const plainTextKey = `${provider}_api_key`;
      if (allData[plainTextKey] && typeof allData[plainTextKey] === 'string') {
        try {
          const live = Boolean(allData[`${STORAGE_PREFIX}${provider}`]);
          const saved = live || (await saveSecureAPIKey(provider, allData[plainTextKey]));
          if (saved) {
            await chrome.storage.local.remove(plainTextKey);
          }
          if (!live && saved) {
            stats.migrated++;
          } else if (!saved) {
            stats.errors++;
          }
        } catch {
          stats.errors++;
        }
      }

      // CryptoJS encrypted keys (cannot migrate - user must re-enter)
      const encryptedKey = `apiKey_${provider}_encrypted`;
      if (allData[encryptedKey]) {
        await chrome.storage.local.remove(encryptedKey);
      }
    }

    const obsolete = [...WITHDRAWN_TRANSLATOR_KEYS, ...REMOVED_LAYER_KEYS].filter(
      key => key in allData
    );
    if (obsolete.length > 0) {
      await chrome.storage.local.remove(obsolete);
    }

    // The provider choice went with them; MyMemory is the only translation service.
    const translationSettings = allData.translationSettings;
    if (
      translationSettings &&
      typeof translationSettings === 'object' &&
      'provider' in translationSettings
    ) {
      const { provider: _withdrawn, ...kept } = translationSettings;
      await chrome.storage.local.set({ translationSettings: kept });
    }
  } catch {
    // Silent fail
  }

  return stats;
}

export default {
  // Core operations
  saveSecureAPIKey,
  getSecureAPIKey,
  hasSecureAPIKey,
  deleteSecureAPIKey,
  listSecureAPIKeys,

  // Migration
  migrateLegacyKeys,
};
