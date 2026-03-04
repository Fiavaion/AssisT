const PBKDF2_ITERATIONS = 1e5;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const STORAGE_PREFIX = "secure_apikey_";
const MACHINE_ID_KEY = "assist_machine_id";
const PASSWORD_HASH_KEY = "assist_password_hash";
const ROTATION_SETTINGS_KEY = "assist_key_rotation_settings";
const STATIC_ENTROPY_KEY = "assist_static_entropy";
const DEFAULT_ROTATION_INTERVAL_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1e3;
async function getMachineIdentifier() {
  const result = await chrome.storage.local.get(MACHINE_ID_KEY);
  if (result[MACHINE_ID_KEY]) {
    return result[MACHINE_ID_KEY];
  }
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const machineId = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  await chrome.storage.local.set({ [MACHINE_ID_KEY]: machineId });
  return machineId;
}
async function getStaticEntropy() {
  const result = await chrome.storage.local.get(STATIC_ENTROPY_KEY);
  if (result[STATIC_ENTROPY_KEY]) {
    return result[STATIC_ENTROPY_KEY];
  }
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const staticEntropy = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  await chrome.storage.local.set({ [STATIC_ENTROPY_KEY]: staticEntropy });
  return staticEntropy;
}
async function getEncryptionSecret() {
  const passwordData = await chrome.storage.local.get([PASSWORD_HASH_KEY, "assist_temp_password"]);
  if (passwordData.assist_temp_password) {
    return passwordData.assist_temp_password;
  }
  return getMachineIdentifier();
}
async function deriveEncryptionKey(salt, secret = null) {
  const encryptionSecret = secret || await getEncryptionSecret();
  const staticEntropy = await getStaticEntropy();
  const combinedInput = encryptionSecret + staticEntropy;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(combinedInput),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    // Not extractable
    ["encrypt", "decrypt"]
  );
}
async function encrypt(plaintext, secret = null) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveEncryptionKey(salt, secret);
  const encodedPlaintext = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedPlaintext
  );
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}
async function decrypt(encryptedData, secret = null) {
  const combined = new Uint8Array(
    atob(encryptedData).split("").map((c) => c.charCodeAt(0))
  );
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
  const key = await deriveEncryptionKey(salt, secret);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
async function getAllDecryptedKeys() {
  const keys = [];
  const allData = await chrome.storage.local.get(null);
  for (const [storageKey, value] of Object.entries(allData)) {
    if (storageKey.startsWith(STORAGE_PREFIX) && value?.encrypted) {
      try {
        const provider = storageKey.replace(STORAGE_PREFIX, "");
        const apiKey = await decrypt(value.encrypted);
        keys.push({ provider, apiKey });
      } catch {
      }
    }
  }
  return keys;
}
async function getRotationSettings() {
  const result = await chrome.storage.local.get(ROTATION_SETTINGS_KEY);
  return result[ROTATION_SETTINGS_KEY] || {
    enabled: true,
    intervalDays: DEFAULT_ROTATION_INTERVAL_DAYS,
    lastRotation: null
  };
}
async function checkRotationNeeded() {
  const settings = await getRotationSettings();
  if (!settings.enabled) {
    return { needed: false, daysSinceRotation: null };
  }
  if (!settings.lastRotation) {
    return { needed: true, daysSinceRotation: null };
  }
  const daysSince = Math.floor((Date.now() - settings.lastRotation) / MS_PER_DAY);
  return {
    needed: daysSince >= settings.intervalDays,
    daysSinceRotation: daysSince
  };
}
async function rotateKeys() {
  try {
    const existingKeys = await getAllDecryptedKeys();
    if (existingKeys.length === 0) {
      return { success: true, keysRotated: 0, message: "No keys to rotate" };
    }
    for (const { provider, apiKey } of existingKeys) {
      await saveSecureAPIKey(provider, apiKey);
    }
    const settings = await getRotationSettings();
    await chrome.storage.local.set({
      [ROTATION_SETTINGS_KEY]: {
        ...settings,
        lastRotation: Date.now()
      }
    });
    return {
      success: true,
      keysRotated: existingKeys.length,
      message: `Rotated ${existingKeys.length} API keys`
    };
  } catch (error) {
    return { success: false, keysRotated: 0, message: error.message };
  }
}
async function autoRotateIfNeeded() {
  const { needed } = await checkRotationNeeded();
  if (!needed) {
    return { rotated: false, keysRotated: 0 };
  }
  const result = await rotateKeys();
  return { rotated: result.success, keysRotated: result.keysRotated };
}
async function saveSecureAPIKey(provider, apiKey) {
  if (!provider || typeof provider !== "string") {
    throw new Error("Provider name is required");
  }
  if (!apiKey || typeof apiKey !== "string") {
    throw new Error("API key is required");
  }
  try {
    const encryptedKey = await encrypt(apiKey);
    const storageKey = `${STORAGE_PREFIX}${provider.toLowerCase()}`;
    await chrome.storage.local.set({
      [storageKey]: {
        encrypted: encryptedKey,
        createdAt: Date.now(),
        rotatedAt: Date.now(),
        version: 2
      }
    });
    return true;
  } catch (error) {
    console.error("[SecureKeyStorage] Save failed:", error.message);
    return false;
  }
}
async function getSecureAPIKey(provider) {
  if (!provider || typeof provider !== "string") {
    throw new Error("Provider name is required");
  }
  try {
    const storageKey = `${STORAGE_PREFIX}${provider.toLowerCase()}`;
    const result = await chrome.storage.local.get(storageKey);
    if (!result[storageKey]?.encrypted) {
      return null;
    }
    return await decrypt(result[storageKey].encrypted);
  } catch (error) {
    console.error("[SecureKeyStorage] Retrieve failed:", error.message);
    return null;
  }
}
async function hasSecureAPIKey(provider) {
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
function isValidKeyFormat(provider, key) {
  if (!key || typeof key !== "string") {
    return false;
  }
  switch (provider?.toLowerCase()) {
    case "anthropic":
      return key.startsWith("sk-ant-") && key.length > 40;
    case "openai":
      return key.startsWith("sk-") && key.length > 40;
    case "google":
      return key.length >= 39;
    case "perplexity":
      return key.startsWith("pplx-") && key.length > 40;
    case "deepl":
      return key.length > 30 && key.includes("-");
    case "azure":
      return key.length >= 32;
    default:
      return key.length > 20;
  }
}
async function testSecureConnection(provider, apiKey) {
  if (!apiKey || !isValidKeyFormat(provider, apiKey)) {
    return { success: false, message: "Invalid API key format" };
  }
  try {
    switch (provider?.toLowerCase()) {
      case "anthropic":
        return await testAnthropicAPI(apiKey);
      case "openai":
        return await testOpenAIAPI(apiKey);
      case "google":
        return await testGoogleAIAPI(apiKey);
      case "perplexity":
        return await testPerplexityAPI(apiKey);
      default:
        return { success: false, message: "Unknown provider" };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}
async function testAnthropicAPI(apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 1,
      messages: [{ role: "user", content: "test" }]
    }),
    credentials: "omit",
    cache: "no-store"
  });
  if (response.ok || response.status === 400) {
    return { success: true, message: "Valid" };
  }
  if (response.status === 401) {
    return { success: false, message: "Invalid" };
  }
  return { success: false, message: `Error: ${response.status}` };
}
async function testOpenAIAPI(apiKey) {
  const response = await fetch("https://api.openai.com/v1/models", {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    credentials: "omit",
    cache: "no-store"
  });
  if (response.ok) {
    return { success: true, message: "Valid" };
  }
  if (response.status === 401) {
    return { success: false, message: "Invalid" };
  }
  return { success: false, message: `Error: ${response.status}` };
}
async function testGoogleAIAPI(apiKey) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    method: "GET",
    headers: { "x-goog-api-key": apiKey },
    credentials: "omit",
    cache: "no-store"
  });
  if (response.ok) {
    return { success: true, message: "Valid" };
  }
  if (response.status === 401 || response.status === 403) {
    return { success: false, message: "Invalid" };
  }
  return { success: false, message: `Error: ${response.status}` };
}
async function testPerplexityAPI(apiKey) {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "llama-3.1-sonar-small-128k-online",
      messages: [{ role: "user", content: "test" }],
      max_tokens: 1
    }),
    credentials: "omit",
    cache: "no-store"
  });
  if (response.ok || response.status === 400) {
    return { success: true, message: "Valid" };
  }
  if (response.status === 401) {
    return { success: false, message: "Invalid" };
  }
  return { success: false, message: `Error: ${response.status}` };
}
async function migrateLegacyKeys() {
  const stats = { migrated: 0, errors: 0 };
  const providers = ["anthropic", "openai", "google", "perplexity", "deepl", "azure"];
  try {
    const allData = await chrome.storage.local.get(null);
    for (const provider of providers) {
      const plainTextKey = `${provider}_api_key`;
      if (allData[plainTextKey] && typeof allData[plainTextKey] === "string") {
        try {
          await saveSecureAPIKey(provider, allData[plainTextKey]);
          await chrome.storage.local.remove(plainTextKey);
          stats.migrated++;
        } catch {
          stats.errors++;
        }
      }
      const encryptedKey = `apiKey_${provider}_encrypted`;
      if (allData[encryptedKey]) {
        await chrome.storage.local.remove(encryptedKey);
      }
    }
  } catch {
  }
  return stats;
}
export {
  autoRotateIfNeeded,
  checkRotationNeeded,
  getRotationSettings,
  getSecureAPIKey,
  hasSecureAPIKey,
  isValidKeyFormat,
  migrateLegacyKeys,
  rotateKeys,
  saveSecureAPIKey,
  testSecureConnection
};
//# sourceMappingURL=secure-key-storage-C4xryL8P.js.map
