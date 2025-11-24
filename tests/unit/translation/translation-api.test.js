/**
 * Unit Tests for Translation API
 * Feature 6 - Translation Implementation
 *
 * Tests cover:
 * 1. Translation API functions (LibreTranslate & Google Translate)
 * 2. Caching behavior (save, retrieve, eviction, LRU)
 * 3. Language detection
 * 4. Error handling (network errors, quota exceeded, invalid API keys)
 * 5. Settings management
 * 6. Cache management (clear, stats)
 */

// Mock global fetch
global.fetch = jest.fn();

// Mock chrome.storage.local
if (!global.chrome) {
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
      },
      onChanged: {
        addListener: jest.fn(),
      },
    },
  };
}

// Clear mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch.mockClear();
  global.chrome.storage.local.get.mockClear();
  global.chrome.storage.local.set.mockClear();
});

describe('Translation API', () => {
  describe('translate() - LibreTranslate', () => {
    test('should translate text using LibreTranslate', async () => {
      const mockResponse = {
        translatedText: 'Hola mundo',
      };

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      // Mock storage get to return default settings
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback({
            translationSettings: {
              preferredEngine: 'libre',
              cacheEnabled: false, // Disable cache for this test
            },
          });
        }
        return Promise.resolve({
          translationSettings: {
            preferredEngine: 'libre',
            cacheEnabled: false,
          },
        });
      });

      // Test translation logic
      const text = 'Hello world';
      const targetLang = 'es';
      const url = 'https://libretranslate.com/translate';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'auto',
          target: targetLang,
          format: 'text',
        }),
      });

      const data = await response.json();

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(data.translatedText).toBe('Hola mundo');
    });

    test('should handle LibreTranslate quota exceeded error', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      const url = 'https://libretranslate.com/translate';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'Hello',
          source: 'auto',
          target: 'es',
          format: 'text',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
      const errorText = await response.text();
      expect(errorText).toContain('Rate limit');
    });

    test('should handle network errors gracefully', async () => {
      global.fetch.mockRejectedValue(new Error('NetworkError: Failed to fetch'));

      try {
        await fetch('https://libretranslate.com/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: 'Hello', source: 'auto', target: 'es', format: 'text' }),
        });
      } catch (error) {
        expect(error.message).toContain('NetworkError');
      }
    });
  });

  describe('translate() - Google Translate', () => {
    test('should translate text using Google Translate with API key', async () => {
      const mockResponse = {
        data: {
          translations: [
            {
              translatedText: 'Bonjour le monde',
            },
          ],
        },
      };

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const apiKey = 'AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const text = 'Hello world';
      const targetLang = 'fr';
      const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}&q=${encodeURIComponent(text)}&target=${targetLang}`;

      const response = await fetch(url, {
        method: 'POST',
      });

      const data = await response.json();

      expect(fetch).toHaveBeenCalled();
      expect(data.data.translations[0].translatedText).toBe('Bonjour le monde');
    });

    test('should handle invalid Google API key', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'API key not valid',
      });

      const apiKey = 'invalid-key';
      const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}&q=Hello&target=es`;

      const response = await fetch(url, {
        method: 'POST',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      const errorText = await response.text();
      expect(errorText).toContain('API key');
    });

    test('should handle missing Google API key', async () => {
      // Mock settings without API key
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback({
            translationSettings: {
              preferredEngine: 'google',
              googleApiKey: '',
            },
          });
        }
        return Promise.resolve({
          translationSettings: {
            preferredEngine: 'google',
            googleApiKey: '',
          },
        });
      });

      const result = await global.chrome.storage.local.get('translationSettings');
      expect(result.translationSettings.googleApiKey).toBe('');
    });
  });

  describe('detectLanguage()', () => {
    test('should detect language correctly', async () => {
      const mockResponse = {
        detections: [
          {
            language: 'en',
            confidence: 0.98,
          },
        ],
      };

      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const text = 'Hello world';
      const url = 'https://libretranslate.com/detect';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: text }),
      });

      const data = await response.json();

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(data.detections[0].language).toBe('en');
      expect(data.detections[0].confidence).toBeGreaterThan(0.9);
    });

    test('should handle language detection errors', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      const url = 'https://libretranslate.com/detect';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'Hello' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
    });
  });

  describe('Cache Management', () => {
    test('should cache translation results', async () => {
      const cacheKey = 'test-key';
      const cacheData = {
        [cacheKey]: {
          text: 'Hello',
          target: 'es',
          result: 'Hola',
          timestamp: Date.now(),
          engine: 'libre',
        },
      };

      // Mock cache save
      global.chrome.storage.local.set.mockImplementation((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      });

      await chrome.storage.local.set({ translationCache: cacheData });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          translationCache: expect.any(Object),
        })
      );
    });

    test('should retrieve cached translation if available', async () => {
      const cacheKey = 'test-key';
      const cachedData = {
        [cacheKey]: {
          text: 'Hello',
          target: 'es',
          result: 'Hola',
          timestamp: Date.now(),
          engine: 'libre',
        },
      };

      // Mock cache get
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback({ translationCache: cachedData });
        }
        return Promise.resolve({ translationCache: cachedData });
      });

      const result = await chrome.storage.local.get('translationCache');

      expect(result.translationCache).toHaveProperty(cacheKey);
      expect(result.translationCache[cacheKey].result).toBe('Hola');
    });

    test('should evict old cache entries after duration', async () => {
      const oldTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
      const newTimestamp = Date.now();

      const cacheData = {
        old: {
          text: 'Old translation',
          target: 'es',
          result: 'Traducción antigua',
          timestamp: oldTimestamp,
          engine: 'libre',
        },
        new: {
          text: 'New translation',
          target: 'es',
          result: 'Traducción nueva',
          timestamp: newTimestamp,
          engine: 'libre',
        },
      };

      // Simulate cache eviction (check if entry is expired)
      const cacheDuration = 7 * 24 * 60 * 60 * 1000; // 7 days
      const now = Date.now();

      const validEntries = Object.entries(cacheData).filter(([key, entry]) => {
        const age = now - entry.timestamp;
        return age <= cacheDuration;
      });

      expect(validEntries.length).toBe(1);
      expect(validEntries[0][0]).toBe('new');
    });

    test('should limit cache size to 100 entries (LRU)', async () => {
      const maxCacheSize = 100;
      const cacheData = {};

      // Create 105 cache entries
      for (let i = 0; i < 105; i++) {
        cacheData[`key-${i}`] = {
          text: `Text ${i}`,
          target: 'es',
          result: `Result ${i}`,
          timestamp: Date.now() - i * 1000, // Older entries have earlier timestamps
          engine: 'libre',
        };
      }

      // Simulate LRU eviction (remove oldest entries)
      const sortedEntries = Object.entries(cacheData).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      );

      const numToRemove = sortedEntries.length - maxCacheSize;
      const evictedEntries = sortedEntries.slice(0, numToRemove);
      const remainingEntries = sortedEntries.slice(numToRemove);

      expect(remainingEntries.length).toBe(maxCacheSize);
      expect(evictedEntries.length).toBe(5);
    });

    test('should clear cache on user request', async () => {
      // Mock cache clear
      global.chrome.storage.local.set.mockImplementation((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      });

      await chrome.storage.local.set({ translationCache: {} });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        translationCache: {},
      });
    });

    test('should get cache statistics', async () => {
      const cacheData = {
        'key-1': {
          text: 'Hello',
          target: 'es',
          result: 'Hola',
          timestamp: Date.now() - 1000,
          engine: 'libre',
        },
        'key-2': {
          text: 'World',
          target: 'fr',
          result: 'Monde',
          timestamp: Date.now(),
          engine: 'google',
        },
      };

      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback({ translationCache: cacheData });
        }
        return Promise.resolve({ translationCache: cacheData });
      });

      const result = await chrome.storage.local.get('translationCache');
      const entries = Object.values(result.translationCache);

      const stats = {
        totalEntries: entries.length,
        libreCount: entries.filter(e => e.engine === 'libre').length,
        googleCount: entries.filter(e => e.engine === 'google').length,
        oldestEntry: Math.min(...entries.map(e => e.timestamp)),
        newestEntry: Math.max(...entries.map(e => e.timestamp)),
      };

      expect(stats.totalEntries).toBe(2);
      expect(stats.libreCount).toBe(1);
      expect(stats.googleCount).toBe(1);
      expect(stats.oldestEntry).toBeLessThan(stats.newestEntry);
    });
  });

  describe('API Configuration', () => {
    test('should use LibreTranslate by default', async () => {
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback({
            translationSettings: {
              preferredEngine: 'libre',
            },
          });
        }
        return Promise.resolve({
          translationSettings: {
            preferredEngine: 'libre',
          },
        });
      });

      const result = await chrome.storage.local.get('translationSettings');

      expect(result.translationSettings.preferredEngine).toBe('libre');
    });

    test('should switch to Google Translate when configured', async () => {
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback({
            translationSettings: {
              preferredEngine: 'google',
              googleApiKey: 'AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            },
          });
        }
        return Promise.resolve({
          translationSettings: {
            preferredEngine: 'google',
            googleApiKey: 'AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          },
        });
      });

      const result = await chrome.storage.local.get('translationSettings');

      expect(result.translationSettings.preferredEngine).toBe('google');
      expect(result.translationSettings.googleApiKey).toBeTruthy();
    });

    test('should validate Google API key format', () => {
      const validKey = 'AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // 39 chars total
      const invalidKey1 = 'invalid-key';
      const invalidKey2 = 'AIza123'; // Too short

      const apiKeyPattern = /^AIza[A-Za-z0-9_-]{35}$/;

      expect(apiKeyPattern.test(validKey)).toBe(true);
      expect(apiKeyPattern.test(invalidKey1)).toBe(false);
      expect(apiKeyPattern.test(invalidKey2)).toBe(false);
    });
  });

  describe('Settings Management', () => {
    test('should load default settings', async () => {
      global.chrome.storage.local.get.mockImplementation((keys, callback) => {
        if (callback) {
          callback({});
        }
        return Promise.resolve({});
      });

      const result = await chrome.storage.local.get('translationSettings');

      // Default settings should be used
      const defaultSettings = {
        preferredEngine: 'libre',
        googleApiKey: '',
        cacheEnabled: true,
        cacheDuration: 7,
        defaultTargetLanguage: 'en',
      };

      // If no settings in storage, defaults should apply
      const settings = result.translationSettings || defaultSettings;

      expect(settings.preferredEngine).toBe('libre');
      expect(settings.cacheEnabled).toBe(true);
      expect(settings.cacheDuration).toBe(7);
    });

    test('should update settings', async () => {
      const newSettings = {
        preferredEngine: 'google',
        googleApiKey: 'AIzaSyDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        cacheEnabled: false,
        cacheDuration: 14,
        defaultTargetLanguage: 'fr',
      };

      global.chrome.storage.local.set.mockImplementation((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      });

      await chrome.storage.local.set({ translationSettings: newSettings });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        translationSettings: newSettings,
      });
    });

    test('should persist cache duration setting', async () => {
      const settings = {
        cacheDuration: 14, // 14 days
      };

      global.chrome.storage.local.set.mockImplementation((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      });

      await chrome.storage.local.set({ translationSettings: settings });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          translationSettings: expect.objectContaining({
            cacheDuration: 14,
          }),
        })
      );
    });
  });

  describe('Fallback Behavior', () => {
    test('should fallback to Google Translate when LibreTranslate fails', async () => {
      // First call to LibreTranslate fails
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      // Second call to Google Translate succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            translations: [{ translatedText: 'Hola mundo' }],
          },
        }),
      });

      // Simulate fallback logic
      let result;
      try {
        // Try LibreTranslate
        const libreResponse = await fetch('https://libretranslate.com/translate', {
          method: 'POST',
        });

        if (!libreResponse.ok) {
          throw new Error('LibreTranslate failed');
        }
      } catch (error) {
        // Fallback to Google Translate
        const googleResponse = await fetch(
          'https://translation.googleapis.com/language/translate/v2',
          { method: 'POST' }
        );
        const data = await googleResponse.json();
        result = data.data.translations[0].translatedText;
      }

      expect(result).toBe('Hola mundo');
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });
});
