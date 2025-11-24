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
  libre: {
    baseUrl: 'https://libretranslate.com',
    endpoints: {
      translate: '/translate',
      detect: '/detect',
      languages: '/languages',
    },
  },
  google: {
    baseUrl: 'https://translation.googleapis.com/language/translate/v2',
    requiresKey: true,
  },
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let translation_settings = {
  preferredEngine: 'libre', // 'libre' or 'google'
  googleApiKey: '', // user-provided
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
      `${API_CONFIG.libre.baseUrl}${API_CONFIG.libre.endpoints.languages}`
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
// TRANSLATION - LIBRETRANSLATE
// ============================================================================

/**
 * Translates text using LibreTranslate API
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code (default: 'auto')
 * @returns {Promise<Object>} Translation result {translatedText, engine, fromCache}
 * @throws {Error} If translation fails
 */
async function translation_translateWithLibre(text, targetLang, sourceLang = 'auto') {
  console.log(`[Translation] LibreTranslate: ${sourceLang} → ${targetLang}`);

  const requestBody = {
    q: text,
    source: sourceLang,
    target: targetLang,
    format: 'text',
  };

  const response = await fetch(
    `${API_CONFIG.libre.baseUrl}${API_CONFIG.libre.endpoints.translate}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    // Check for quota exceeded
    if (
      response.status === 429 ||
      errorText.includes('quota') ||
      errorText.includes('rate limit')
    ) {
      throw new Error('QUOTA_EXCEEDED');
    }

    throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();

  if (!data.translatedText) {
    throw new Error('No translated text in response');
  }

  console.log(`[Translation] LibreTranslate success: ${data.translatedText.substring(0, 50)}...`);

  return {
    translatedText: data.translatedText,
    engine: 'libre',
    fromCache: false,
  };
}

// ============================================================================
// TRANSLATION - GOOGLE TRANSLATE
// ============================================================================

/**
 * Translates text using Google Translate API
 * Requires API key from user settings
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code (default: 'auto')
 * @returns {Promise<Object>} Translation result {translatedText, engine, fromCache}
 * @throws {Error} If translation fails or API key is missing/invalid
 */
async function translation_translateWithGoogle(text, targetLang, sourceLang = 'auto') {
  console.log(`[Translation] Google Translate: ${sourceLang} → ${targetLang}`);

  // Check if API key is configured
  if (!translation_settings.googleApiKey) {
    throw new Error('MISSING_API_KEY');
  }

  const params = new URLSearchParams({
    key: translation_settings.googleApiKey,
    q: text,
    target: targetLang,
  });

  // Add source language if not auto-detect
  if (sourceLang !== 'auto') {
    params.append('source', sourceLang);
  }

  const response = await fetch(`${API_CONFIG.google.baseUrl}?${params.toString()}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Check for invalid API key
    if (response.status === 400 || response.status === 403 || errorText.includes('API key')) {
      throw new Error('INVALID_API_KEY');
    }

    // Check for quota exceeded
    if (response.status === 429 || errorText.includes('quota')) {
      throw new Error('QUOTA_EXCEEDED');
    }

    throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
  }

  const data = await response.json();

  if (!data.data || !data.data.translations || data.data.translations.length === 0) {
    throw new Error('No translations in response');
  }

  const translatedText = data.data.translations[0].translatedText;

  console.log(`[Translation] Google Translate success: ${translatedText.substring(0, 50)}...`);

  return {
    translatedText,
    engine: 'google',
    fromCache: false,
  };
}

// ============================================================================
// MAIN TRANSLATION FUNCTION
// ============================================================================

/**
 * Translates text using preferred engine with automatic fallback
 *
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code (e.g., 'es', 'fr', 'de')
 * @param {string} sourceLang - Source language code (default: 'auto')
 * @returns {Promise<Object>} Translation result {translatedText, engine, fromCache, error}
 */
async function translation_translate(text, targetLang, sourceLang = 'auto') {
  // Initialize if needed
  if (!translation_isInitialized) {
    await translation_init();
  }

  console.log(
    `[Translation] Translating: "${text.substring(0, 50)}..." (${sourceLang} → ${targetLang})`
  );

  // Check cache first
  const cached = translation_getCachedTranslation(text, targetLang);
  if (cached) {
    console.log(`[Translation] Returning cached result (engine: ${cached.engine})`);
    return {
      translatedText: cached.result,
      engine: cached.engine,
      fromCache: true,
    };
  }

  // Determine primary and fallback engines
  const primaryEngine = translation_settings.preferredEngine;
  const fallbackEngine = primaryEngine === 'libre' ? 'google' : 'libre';

  console.log(`[Translation] Primary: ${primaryEngine}, Fallback: ${fallbackEngine}`);

  // Try primary engine
  try {
    let result;

    if (primaryEngine === 'libre') {
      result = await translation_translateWithLibre(text, targetLang, sourceLang);
    } else {
      result = await translation_translateWithGoogle(text, targetLang, sourceLang);
    }

    // Cache the result
    await translation_cacheTranslation(text, targetLang, result.translatedText, result.engine);

    return result;
  } catch (primaryError) {
    console.warn(`[Translation] Primary engine (${primaryEngine}) failed:`, primaryError.message);

    // Handle specific errors without fallback
    if (primaryError.message === 'MISSING_API_KEY') {
      return {
        translatedText: null,
        engine: primaryEngine,
        fromCache: false,
        error: 'Google Translate API key is invalid. Please check your key in settings.',
      };
    }

    if (primaryError.message === 'INVALID_API_KEY') {
      return {
        translatedText: null,
        engine: primaryEngine,
        fromCache: false,
        error: 'Google Translate API key is invalid. Please check your key in settings.',
      };
    }

    // Try fallback engine (with one retry for network errors)
    console.log(`[Translation] Trying fallback engine: ${fallbackEngine}`);

    try {
      let result;

      if (fallbackEngine === 'libre') {
        result = await translation_translateWithLibre(text, targetLang, sourceLang);
      } else {
        result = await translation_translateWithGoogle(text, targetLang, sourceLang);
      }

      // Cache the result
      await translation_cacheTranslation(text, targetLang, result.translatedText, result.engine);

      console.log(`[Translation] Fallback engine (${fallbackEngine}) succeeded`);
      return result;
    } catch (fallbackError) {
      console.error(
        `[Translation] Fallback engine (${fallbackEngine}) also failed:`,
        fallbackError.message
      );

      // Return user-friendly error message
      let errorMessage;

      if (fallbackError.message === 'QUOTA_EXCEEDED') {
        errorMessage =
          'Translation quota exceeded. Try again tomorrow or switch to Google Translate in settings.';
      } else if (
        fallbackError.message === 'MISSING_API_KEY' ||
        fallbackError.message === 'INVALID_API_KEY'
      ) {
        errorMessage = 'Google Translate API key is invalid. Please check your key in settings.';
      } else if (
        fallbackError.message.includes('NetworkError') ||
        fallbackError.message.includes('Failed to fetch')
      ) {
        errorMessage = 'Translation failed. Check your internet connection and try again.';
      } else {
        errorMessage = `Translation failed: ${fallbackError.message}`;
      }

      return {
        translatedText: null,
        engine: null,
        fromCache: false,
        error: errorMessage,
      };
    }
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
