/**
 * Translation API Integration
 *
 * Provides multi-language translation using LibreTranslate (free, no API key)
 * and Google Translate (requires API key) as fallback.
 *
 * Features:
 * - Primary: LibreTranslate (free, open-source, no API key required)
 * - Fallback: Google Translate (requires API key from user settings)
 * - Language detection using LibreTranslate /detect endpoint
 * - Response caching (7 days, max 100 translations, LRU eviction)
 * - 30+ language support
 * - Network error handling with retry logic
 * - Quota management and user-friendly error messages
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - All functions prefixed with 'translation_' to avoid naming conflicts
 * - Uses raw fetch API (no external libraries)
 *
 * @module features/translation
 */

// ============================================================================
// API CONFIGURATION
// ============================================================================

const API_CONFIG = {
  mymemory: {
    baseUrl: 'https://api.mymemory.translated.net',
    endpoints: {
      translate: '/get',
    },
    requiresKey: false,
    dailyLimit: 10000, // 10,000 words/day per IP (free)
  },
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let translation_settings = {
  cacheEnabled: true,
  cacheDuration: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  maxCacheSize: 100, // max cached translations
};

let translation_cache = {}; // In-memory cache (synced to storage)
let translation_supportedLanguages = null; // Cached language list
let translation_isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

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
      console.log('[Translation] Settings loaded:', translation_settings);
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
      detectLanguage: translation_detectLanguage,
      getSupportedLanguages: translation_getSupportedLanguages,
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

// ============================================================================
// CACHING
// ============================================================================

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

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/**
 * Detects the language of the given text using LibreTranslate
 *
 * @param {string} text - Text to detect language for
 * @returns {Promise<Object>} Detection result with language code and confidence
 * @throws {Error} If detection fails
 */
async function translation_detectLanguage(text) {
  console.log(`[Translation] Detecting language for: "${text.substring(0, 50)}..."`);

  try {
    const response = await fetch(
      `${API_CONFIG.libre.baseUrl}${API_CONFIG.libre.endpoints.detect}`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: text }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.detections && data.detections.length > 0) {
      const topDetection = data.detections[0];
      console.log(
        `[Translation] Language detected: ${topDetection.language} (confidence: ${topDetection.confidence})`
      );
      return topDetection;
    } else {
      throw new Error('No language detections returned');
    }
  } catch (error) {
    console.error('[Translation] Language detection failed:', error);
    throw new Error(`Language detection failed: ${error.message}`);
  }
}

// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================

/**
 * Gets supported languages from LibreTranslate
 * Results are cached to avoid repeated API calls
 *
 * @returns {Promise<Array>} Array of language objects {code, name}
 */
async function translation_getSupportedLanguages() {
  // Return cached list if available
  if (translation_supportedLanguages) {
    console.log(
      `[Translation] Using cached language list (${translation_supportedLanguages.length} languages)`
    );
    return translation_supportedLanguages;
  }

  console.log('[Translation] Fetching supported languages...');

  try {
    const response = await fetch(
      `${API_CONFIG.libre.baseUrl}${API_CONFIG.libre.endpoints.languages}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const languages = await response.json();
    translation_supportedLanguages = languages;

    console.log(`[Translation] Supported languages loaded: ${languages.length} languages`);
    return languages;
  } catch (error) {
    console.error('[Translation] Failed to load supported languages:', error);

    // Return fallback list of common languages
    console.log('[Translation] Using fallback language list');
    const fallbackLanguages = [
      { code: 'en', name: 'English' },
      { code: 'es', name: 'Spanish' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'it', name: 'Italian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'nl', name: 'Dutch' },
      { code: 'pl', name: 'Polish' },
      { code: 'ru', name: 'Russian' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'ar', name: 'Arabic' },
      { code: 'hi', name: 'Hindi' },
    ];

    translation_supportedLanguages = fallbackLanguages;
    return fallbackLanguages;
  }
}

// ============================================================================
// TRANSLATION - MYMEMORY (FREE, NO API KEY)
// ============================================================================

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
 * @returns {Promise<Object>} Translation result {translatedText, engine, fromCache}
 * @throws {Error} If translation fails
 */
async function translation_translateWithMyMemory(text, targetLang, sourceLang = 'en') {
  console.log(`[Translation] MyMemory: ${sourceLang} → ${targetLang}`);

  // MyMemory has a 500 character limit - split long texts into chunks
  const MAX_CHUNK_SIZE = 450; // Leave some room for safety

  if (text.length <= MAX_CHUNK_SIZE) {
    // Single request for short texts
    return await translation_translateChunkWithMyMemory(text, targetLang, sourceLang);
  }

  // Split into chunks by sentences to maintain context
  const chunks = translation_splitTextIntoChunks(text, MAX_CHUNK_SIZE);
  console.log(`[Translation] Splitting text into ${chunks.length} chunks`);

  // Translate each chunk
  const translatedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[Translation] Translating chunk ${i + 1}/${chunks.length}`);
    const result = await translation_translateChunkWithMyMemory(chunks[i], targetLang, sourceLang);
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
 * @returns {Promise<Object>} Translation result
 * @throws {Error} If translation fails
 */
async function translation_translateChunkWithMyMemory(text, targetLang, sourceLang) {
  // MyMemory uses "source|target" format for langpair
  const langpair = `${sourceLang}|${targetLang}`;

  // Build URL with query parameters
  const url = `${API_CONFIG.mymemory.baseUrl}${API_CONFIG.mymemory.endpoints.translate}?q=${encodeURIComponent(text)}&langpair=${langpair}`;

  const response = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // Debug: Log the full response
  console.log('[Translation] MyMemory API response:', JSON.stringify(data, null, 2));

  // Check for quota exceeded
  if (data.quotaFinished === true) {
    throw new Error('QUOTA_EXCEEDED');
  }

  // Check response status
  if (data.responseStatus !== 200) {
    throw new Error(`Translation failed: ${data.responseDetails || 'Unknown error'}`);
  }

  // MyMemory returns 'translatedText' field
  const translatedText = data.translatedText || data.responseData?.translatedText;

  if (!translatedText) {
    console.error('[Translation] No translatedText in response. Full response:', data);
    throw new Error('No translated text in response');
  }

  console.log(`[Translation] MyMemory success: ${translatedText.substring(0, 50)}...`);

  return {
    translatedText: translatedText,
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

// ============================================================================
// MAIN TRANSLATION FUNCTION
// ============================================================================

/**
 * Translates text using MyMemory (free, no API key required)
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code (e.g., 'es', 'fr', 'de')
 * @param {string} sourceLang - Source language code (default: 'en')
 * @returns {Promise<Object>} Translation result {translatedText, engine, fromCache, error}
 */
async function translation_translate(text, targetLang, sourceLang = 'en') {
  // Initialize if needed
  if (!translation_isInitialized) {
    await translation_init();
  }

  // MyMemory doesn't support 'auto' - default to English
  if (sourceLang === 'auto' || !sourceLang) {
    sourceLang = 'en';
  }

  console.log(
    `[Translation] Translating: "${text.substring(0, 50)}..." (${sourceLang} → ${targetLang})`
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
    const result = await translation_translateWithMyMemory(text, targetLang, sourceLang);

    // Cache the result
    await translation_cacheTranslation(text, targetLang, result.translatedText, result.engine);

    return result;
  } catch (error) {
    console.error(`[Translation] MyMemory translation failed:`, error.message);

    // Return user-friendly error message
    let errorMessage;

    if (error.message === 'QUOTA_EXCEEDED') {
      errorMessage = 'Daily translation limit reached (10,000 words). Please try again tomorrow.';
    } else if (
      error.message.includes('NetworkError') ||
      error.message.includes('Failed to fetch')
    ) {
      errorMessage = 'Translation failed. Check your internet connection and try again.';
    } else {
      errorMessage = `Translation failed: ${error.message}`;
    }

    return {
      translatedText: null,
      engine: 'mymemory',
      fromCache: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

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
    console.log('[Translation] Settings updated:', translation_settings);
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

// ============================================================================
// EXPORTS
// ============================================================================

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  // Ensure assistFeatures namespace exists
  window.assistFeatures = window.assistFeatures || {};

  // Initialize translation feature (async, but non-blocking)
  translation_init().catch(error => {
    console.error('[Translation] Auto-initialization failed:', error);
  });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    translation_init,
    translation_translate,
    translation_detectLanguage,
    translation_getSupportedLanguages,
    translation_getApiConfig,
    translation_clearCache,
    translation_getCacheStats,
  };
}
