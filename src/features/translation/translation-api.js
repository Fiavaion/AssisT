/**
 * Translation API Integration
 *
 * Translates text with MyMemory (free, no API key), through the service worker and behind the
 * student's answer (ADR 0006). A selection and a whole page are separate questions: the caller
 * names which it is sending.
 *
 * Features:
 * - Response caching (7 days, max 100 translations, LRU eviction)
 * - 30+ language support
 * - Long text split into pieces MyMemory accepts
 * - Quota management and user-friendly error messages
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - All functions prefixed with 'translation_' to avoid naming conflicts
 *
 * @module features/translation
 */

import { requestThirdParty } from '../../utils/third-party-client.js';

/**
 * MyMemory is reached through the service worker, once the student has allowed it (ADR 0006);
 * the worker builds the request, so no address lives here.
 */
const API_CONFIG = {
  mymemory: {
    requiresKey: false,
    dailyLimit: 10000, // 10,000 words/day per IP (free)
  },
};

/** What a student is told when they chose not to send text to MyMemory, by what was being sent. */
const DECLINED_MESSAGES = {
  translation: 'Nothing was sent. You chose not to use MyMemory to translate text.',
  pageTranslation: 'Nothing was sent. You chose not to use MyMemory to translate the whole page.',
};

let translation_settings = {
  cacheEnabled: true,
  cacheDuration: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  maxCacheSize: 100, // max cached translations
};

let translation_cache = {}; // In-memory cache (synced to storage)
let translation_isInitialized = false;

/**
 * Initializes the translation feature
 * Loads settings and cache from Chrome storage
 *
 * @returns {Promise<void>}
 */
async function translation_init() {
  if (translation_isInitialized) {
    console.log('[Translation] Already initialized');
    return;
  }

  console.log('[Translation] Initializing...');

  try {
    // Load settings and cache from storage
    const result = await chrome.storage.local.get(['translationSettings', 'translationCache']);

    if (result.translationSettings) {
      translation_settings = { ...translation_settings, ...result.translationSettings };
      console.log('[Translation] Settings loaded:', Object.keys(translation_settings).join(', '));
    }

    if (result.translationCache) {
      translation_cache = result.translationCache;
      console.log(`[Translation] Cache loaded: ${Object.keys(translation_cache).length} entries`);
    }

    translation_isInitialized = true;

    // Register the feature as available
    if (!window.assistFeatures) {
      window.assistFeatures = {};
    }

    window.assistFeatures.translation = {
      translate: translation_translate,
      getApiConfig: translation_getApiConfig,
      clearCache: translation_clearCache,
      getCacheStats: translation_getCacheStats,
      updateSettings: translation_updateSettings,
    };

    console.log('[Translation] Initialized successfully');
  } catch (error) {
    console.error('[Translation] Initialization failed:', error);
    throw error;
  }
}

/**
 * Gets current API configuration
 *
 * @returns {Object} API configuration
 */
function translation_getApiConfig() {
  return {
    ...API_CONFIG,
    settings: translation_settings,
  };
}

/**
 * Generates a cache key from text and target language
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @returns {string} Cache key (hash)
 */
function translation_generateCacheKey(text, targetLang) {
  // Simple hash function (djb2)
  const str = `${text}:${targetLang}`;
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return hash.toString(36);
}

/**
 * Gets cached translation if available and not expired
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @returns {Object|null} Cached translation or null
 */
function translation_getCachedTranslation(text, targetLang) {
  if (!translation_settings.cacheEnabled) {
    return null;
  }

  const key = translation_generateCacheKey(text, targetLang);
  const cached = translation_cache[key];

  if (!cached) {
    return null;
  }

  // Check if expired
  const now = Date.now();
  const age = now - cached.timestamp;

  if (age > translation_settings.cacheDuration) {
    console.log(`[Translation] Cache expired for key: ${key}`);
    delete translation_cache[key];
    translation_saveCacheToStorage();
    return null;
  }

  console.log(
    `[Translation] Cache hit for key: ${key} (age: ${Math.round(age / 1000 / 60)} minutes)`
  );
  return cached;
}

/**
 * Caches a translation result
 *
 * @param {string} text - Original text
 * @param {string} targetLang - Target language code
 * @param {string} translatedText - Translated text
 * @param {string} engine - Engine used ('libre' or 'google')
 */
async function translation_cacheTranslation(text, targetLang, translatedText, engine) {
  if (!translation_settings.cacheEnabled) {
    return;
  }

  const key = translation_generateCacheKey(text, targetLang);
  const now = Date.now();

  // Add to cache
  translation_cache[key] = {
    text,
    target: targetLang,
    result: translatedText,
    timestamp: now,
    engine,
  };

  // Evict oldest entries if cache is too large (LRU)
  const cacheKeys = Object.keys(translation_cache);
  if (cacheKeys.length > translation_settings.maxCacheSize) {
    console.log(
      `[Translation] Cache full (${cacheKeys.length}/${translation_settings.maxCacheSize}), evicting oldest entries`
    );

    // Sort by timestamp (oldest first)
    const sortedKeys = cacheKeys.sort((a, b) => {
      return translation_cache[a].timestamp - translation_cache[b].timestamp;
    });

    // Remove oldest entries
    const numToRemove = cacheKeys.length - translation_settings.maxCacheSize;
    for (let i = 0; i < numToRemove; i++) {
      delete translation_cache[sortedKeys[i]];
    }
  }

  // Save to storage
  await translation_saveCacheToStorage();

  console.log(
    `[Translation] Cached translation (key: ${key}, total: ${Object.keys(translation_cache).length})`
  );
}

/**
 * Saves cache to Chrome storage
 *
 * @returns {Promise<void>}
 */
async function translation_saveCacheToStorage() {
  try {
    await chrome.storage.local.set({ translationCache: translation_cache });
  } catch (error) {
    console.error('[Translation] Failed to save cache to storage:', error);
  }
}

/**
 * Clears the translation cache
 *
 * @returns {Promise<void>}
 */
async function translation_clearCache() {
  translation_cache = {};
  await chrome.storage.local.set({ translationCache: {} });
  console.log('[Translation] Cache cleared');
}

/**
 * Gets cache statistics
 *
 * @returns {Object} Cache stats
 */
function translation_getCacheStats() {
  const entries = Object.values(translation_cache);

  return {
    totalEntries: entries.length,
    maxSize: translation_settings.maxCacheSize,
    libreCount: entries.filter(e => e.engine === 'libre').length,
    googleCount: entries.filter(e => e.engine === 'google').length,
    oldestEntry: entries.length > 0 ? Math.min(...entries.map(e => e.timestamp)) : null,
    newestEntry: entries.length > 0 ? Math.max(...entries.map(e => e.timestamp)) : null,
  };
}

/**
 * Translates text using MyMemory Translation API (completely free, no API key required)
 *
 * MyMemory provides 10,000 words/day per IP address for free
 * Perfect for educational accessibility tools
 *
 * Note: MyMemory has a 500 character limit per request, so longer texts are split into chunks
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code (ISO 639-1, e.g. 'es', 'fr')
 * @param {string} sourceLang - Source language code (default: 'en')
 * @param {{destination: string, ask: boolean}} request - what is being sent, and whether an
 *   unanswered question may open the consent panel
 * @returns {Promise<Object>} Translation result {translatedText, engine, fromCache}
 * @throws {Error} If translation fails
 */
async function translation_translateWithMyMemory(text, targetLang, sourceLang, request) {
  console.log(`[Translation] MyMemory: ${sourceLang} → ${targetLang}`);

  // MyMemory has a 500 character limit - split long texts into chunks
  const MAX_CHUNK_SIZE = 450; // Leave some room for safety

  if (text.length <= MAX_CHUNK_SIZE) {
    // Single request for short texts
    return await translation_translateChunkWithMyMemory(text, targetLang, sourceLang, request);
  }

  // Split into chunks by sentences to maintain context
  const chunks = translation_splitTextIntoChunks(text, MAX_CHUNK_SIZE);
  console.log(`[Translation] Splitting text into ${chunks.length} chunks`);

  // Translate each chunk
  const translatedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[Translation] Translating chunk ${i + 1}/${chunks.length}`);
    const result = await translation_translateChunkWithMyMemory(
      chunks[i],
      targetLang,
      sourceLang,
      request
    );
    translatedChunks.push(result.translatedText);

    // Small delay between requests to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Combine chunks
  const combinedTranslation = translatedChunks.join(' ');

  return {
    translatedText: combinedTranslation,
    engine: 'mymemory',
    fromCache: false,
  };
}

/**
 * Translates a single chunk of text (max 500 chars)
 *
 * @param {string} text - Text chunk to translate
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code
 * @param {{destination: string, ask: boolean}} request - see translation_translateWithMyMemory
 * @returns {Promise<Object>} Translation result
 * @throws {Error} If translation fails
 */
async function translation_translateChunkWithMyMemory(text, targetLang, sourceLang, request) {
  // The worker keeps the provider's own wording ("PLEASE SELECT TWO DISTINCT LANGUAGES" was once
  // shown to a student verbatim) in its console and answers with a code; the student gets a
  // sentence written for them.
  const reply = await requestThirdParty(
    request.destination,
    { text, source: sourceLang, target: targetLang },
    { detail: text, ask: request.ask }
  );

  if (!reply.success) {
    const error = new Error(reply.error || reply.code);
    error.code = reply.code;
    throw error;
  }

  const translatedText = reply.data.translatedText;
  console.log(`[Translation] MyMemory success: ${translatedText.length} characters`);

  return {
    translatedText,
    engine: 'mymemory',
    fromCache: false,
  };
}

/**
 * Splits text into chunks while trying to preserve sentence boundaries
 *
 * @param {string} text - Text to split
 * @param {number} maxChunkSize - Maximum size of each chunk
 * @returns {Array<string>} Array of text chunks
 */
function translation_splitTextIntoChunks(text, maxChunkSize) {
  const chunks = [];
  let currentChunk = '';

  // Split by sentences (simple heuristic)
  const sentences = text.split(/([.!?]+\s+)/);

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    // If adding this sentence would exceed the limit, save current chunk and start new one
    if (currentChunk.length + sentence.length > maxChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If a single sentence is too long, split it by words
      if (sentence.length > maxChunkSize) {
        const words = sentence.split(' ');
        for (const word of words) {
          if (currentChunk.length + word.length + 1 > maxChunkSize) {
            chunks.push(currentChunk.trim());
            currentChunk = word;
          } else {
            currentChunk += (currentChunk ? ' ' : '') + word;
          }
        }
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += sentence;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Translates text using MyMemory (free, no API key required)
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code (e.g., 'es', 'fr', 'de')
 * @param {string} sourceLang - Source language code (default: 'en')
 * @param {Object} [options]
 * @param {'translation'|'pageTranslation'} [options.destination='translation'] - a selection, or a
 *   passage of a whole page (each has its own answer)
 * @param {boolean} [options.ask=true] - false when the student has already been asked (Translate
 *   Page asks once for the whole page before it starts)
 * @returns {Promise<Object>} Translation result {translatedText, engine, fromCache, error}
 */
async function translation_translate(text, targetLang, sourceLang = 'en', options = {}) {
  const destination = options.destination === 'pageTranslation' ? 'pageTranslation' : 'translation';
  const ask = options.ask !== false;

  // Initialize if needed
  if (!translation_isInitialized) {
    await translation_init();
  }

  // MyMemory doesn't support 'auto' - default to English
  if (sourceLang === 'auto' || !sourceLang) {
    sourceLang = 'en';
  }

  // Nothing to translate, so nothing is sent. On the default settings this is the common case:
  // "Auto-detect" resolves to English and the target is English too, and the provider answered
  // that with an error a student was left to interpret.
  if (sourceLang === targetLang) {
    console.log(`[Translation] Same language (${targetLang}) — no request sent`);
    return {
      translatedText: null,
      engine: 'mymemory',
      fromCache: false,
      sameLanguage: true,
      error: 'That text is already in the language you picked. Choose another language for it.',
    };
  }

  console.log(
    `[Translation] Translating ${text.length} characters (${sourceLang} → ${targetLang})`
  );

  // Check cache first
  const cached = translation_getCachedTranslation(text, targetLang);
  if (cached) {
    console.log(`[Translation] Returning cached result`);
    return {
      translatedText: cached.result,
      engine: 'mymemory',
      fromCache: true,
    };
  }

  // Translate using MyMemory (free, no API key required)
  try {
    const result = await translation_translateWithMyMemory(text, targetLang, sourceLang, {
      destination,
      ask,
    });

    // Cache the result
    await translation_cacheTranslation(text, targetLang, result.translatedText, result.engine);

    return result;
  } catch (error) {
    if (error.code === 'consent-declined' || error.code === 'consent-unasked') {
      return {
        translatedText: null,
        engine: 'mymemory',
        fromCache: false,
        consentDeclined: true,
        error: DECLINED_MESSAGES[destination],
      };
    }

    console.error(`[Translation] MyMemory translation failed:`, error.code, error.message);

    // Return user-friendly error message
    let errorMessage;

    if (error.code === 'quota-exceeded') {
      errorMessage = 'Daily translation limit reached (10,000 words). Please try again tomorrow.';
    } else if (error.code === 'network') {
      errorMessage = 'Translation failed. Check your internet connection and try again.';
    } else {
      // One sentence, whatever went wrong. The detail is already in the console above; putting
      // it in the message doubled this function's own prefix onto the provider's wording.
      errorMessage =
        'Translation failed. The service could not translate that text — try a shorter ' +
        'selection or another language.';
    }

    return {
      translatedText: null,
      engine: 'mymemory',
      fromCache: false,
      error: errorMessage,
    };
  }
}

/**
 * Updates translation settings
 *
 * @param {Object} newSettings - New settings to apply
 * @returns {Promise<void>}
 */
async function translation_updateSettings(newSettings) {
  translation_settings = { ...translation_settings, ...newSettings };

  try {
    await chrome.storage.local.set({ translationSettings: translation_settings });
    console.log('[Translation] Settings updated:', Object.keys(translation_settings).join(', '));
  } catch (error) {
    console.error('[Translation] Failed to save settings:', error);
  }
}

// Load settings on initialization
chrome.storage.local.get('translationSettings', result => {
  if (result.translationSettings) {
    translation_settings = { ...translation_settings, ...result.translationSettings };
    console.log('[Translation] Settings loaded from storage');
  }
});

// Listen for settings changes
chrome.storage.onChanged.addListener(changes => {
  if (changes.translationSettings) {
    translation_settings = { ...translation_settings, ...changes.translationSettings.newValue };
    console.log('[Translation] Settings updated from storage');
  }
});

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  // Ensure assistFeatures namespace exists
  window.assistFeatures = window.assistFeatures || {};

  // Initialize translation feature (async, but non-blocking)
  translation_init().catch(error => {
    console.error('[Translation] Auto-initialization failed:', error);
  });
}
