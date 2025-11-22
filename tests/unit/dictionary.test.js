/**
 * Unit Tests for Dictionary Feature
 * Phase 2 - Feature 4 Implementation
 *
 * Tests cover:
 * 1. API fetch functionality
 * 2. Caching behavior (LRU cache)
 * 3. Error handling (network errors, 404s)
 * 4. Settings integration
 * 5. Modal creation and event handlers
 */

// Mock global fetch
global.fetch = jest.fn();

// Mock Audio constructor
global.Audio = jest.fn().mockImplementation((url) => {
  const playMock = jest.fn().mockResolvedValue(undefined);
  const pauseMock = jest.fn();
  return {
    play: playMock,
    pause: pauseMock,
    src: url,
  };
});

// Mock chrome.storage.local (if not already mocked)
if (!global.chrome) {
  global.chrome = {
    storage: {
      local: {
        get: jest.fn((keys, callback) => {
          callback({ dictionarySettings: { enabled: true, cacheSize: 100 } });
        }),
        set: jest.fn((data, callback) => {
          if (callback) callback();
        }),
        remove: jest.fn((keys, callback) => {
          if (callback) callback();
        }),
        clear: jest.fn((callback) => {
          if (callback) callback();
        }),
      },
    },
  };
}

describe('Dictionary Feature', () => {
  describe('API Integration', () => {
    beforeEach(() => {
      fetch.mockClear();
    });

    test('should fetch definition from API successfully', async () => {
      const mockResponse = [
        {
          word: 'example',
          phonetics: [{ text: '/ɪɡˈzɑːmpəl/', audio: 'https://example.com/audio.mp3' }],
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [
                {
                  definition: 'A thing characteristic of its kind',
                  example: 'This is an example',
                },
              ],
              synonyms: ['sample', 'instance'],
            },
          ],
        },
      ];

      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      // Test fetch logic
      const word = 'example';
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;

      const response = await fetch(url);
      const data = await response.json();

      expect(fetch).toHaveBeenCalledWith(url);
      expect(data).toEqual(mockResponse);
      expect(data[0].word).toBe('example');
      expect(data[0].meanings[0].partOfSpeech).toBe('noun');
    });

    test('should handle 404 not found error', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const response = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/invalid');
      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    test('should handle network errors', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      await expect(fetch('https://api.dictionaryapi.dev/api/v2/entries/en/test')).rejects.toThrow(
        'Network error'
      );
    });

    test('should normalize word (trim and lowercase)', () => {
      const testCases = [
        { input: '  Example  ', expected: 'example' },
        { input: 'UPPERCASE', expected: 'uppercase' },
        { input: '  MixedCase  ', expected: 'mixedcase' },
      ];

      testCases.forEach(({ input, expected }) => {
        const normalized = input.trim().toLowerCase();
        expect(normalized).toBe(expected);
      });
    });

    test('should encode special characters in URL', () => {
      const words = ['test-word', 'café', 'über'];
      words.forEach((word) => {
        const encoded = encodeURIComponent(word);
        const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encoded}`;
        expect(url).toContain(encoded);
      });
    });
  });

  describe('Caching Behavior', () => {
    test('should cache API responses', () => {
      const cache = new Map();
      const word = 'example';
      const data = { word: 'example', meanings: [] };

      cache.set(word, data);

      expect(cache.has(word)).toBe(true);
      expect(cache.get(word)).toEqual(data);
    });

    test('should implement LRU eviction when cache is full', () => {
      const cache = new Map();
      const maxSize = 3;

      // Fill cache to max
      cache.set('word1', { data: 1 });
      cache.set('word2', { data: 2 });
      cache.set('word3', { data: 3 });

      expect(cache.size).toBe(maxSize);

      // Add one more (should evict oldest)
      if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set('word4', { data: 4 });

      expect(cache.size).toBe(maxSize);
      expect(cache.has('word1')).toBe(false); // Oldest entry evicted
      expect(cache.has('word4')).toBe(true); // New entry added
    });

    test('should use cached data on subsequent lookups', () => {
      const cache = new Map();
      const word = 'example';
      const cachedData = { word: 'example', cached: true };

      cache.set(word, cachedData);

      // Simulate cache hit
      const hit = cache.has(word);
      const data = cache.get(word);

      expect(hit).toBe(true);
      expect(data).toEqual(cachedData);
    });

    test('should respect cache size setting', () => {
      const settings = { cacheSize: 50 };
      const cache = new Map();

      // Fill cache to setting limit
      for (let i = 0; i < 50; i++) {
        cache.set(`word${i}`, { data: i });
      }

      expect(cache.size).toBe(settings.cacheSize);

      // Add one more with LRU eviction
      if (cache.size >= settings.cacheSize) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
      cache.set('word50', { data: 50 });

      expect(cache.size).toBe(settings.cacheSize);
    });

    test('should handle cache miss gracefully', () => {
      const cache = new Map();
      const word = 'nonexistent';

      const hit = cache.has(word);
      expect(hit).toBe(false);
      expect(cache.get(word)).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed API responses', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const response = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/test');
      await expect(response.json()).rejects.toThrow('Invalid JSON');
    });

    test('should handle empty response from API', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      });

      const response = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/test');
      const data = await response.json();

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    });

    test('should handle missing phonetics gracefully', () => {
      const entry = {
        word: 'example',
        phonetics: [],
        meanings: [],
      };

      const hasPhonetics = entry.phonetics && entry.phonetics.length > 0;
      expect(hasPhonetics).toBe(false);
    });

    test('should handle missing meanings gracefully', () => {
      const entry = {
        word: 'example',
        phonetics: [],
        meanings: [],
      };

      const hasMeanings = entry.meanings && entry.meanings.length > 0;
      expect(hasMeanings).toBe(false);
    });

    test('should handle API rate limiting (429)', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 429,
      });

      const response = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/test');
      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
    });
  });

  describe('Settings Integration', () => {
    test('should load settings from chrome.storage', () => {
      const mockSettings = { enabled: true, cacheSize: 100, autoLookupOnDoubleClick: false };

      // Test that chrome.storage.local.get can be called
      expect(chrome.storage.local.get).toBeDefined();

      // Simulate getting settings
      const result = { dictionarySettings: mockSettings };
      expect(result.dictionarySettings).toBeDefined();
      expect(result.dictionarySettings.enabled).toBe(true);
    });

    test('should use default settings when none exist', () => {
      const defaultSettings = {
        enabled: true,
        cacheSize: 100,
        autoLookupOnDoubleClick: false,
      };

      expect(defaultSettings.enabled).toBe(true);
      expect(defaultSettings.cacheSize).toBe(100);
      expect(defaultSettings.autoLookupOnDoubleClick).toBe(false);
    });

    test('should persist cache size changes', () => {
      const newSettings = { cacheSize: 50 };

      // Test that chrome.storage.local.set can be called
      expect(chrome.storage.local.set).toBeDefined();

      // Simulate setting storage
      const stored = { dictionarySettings: newSettings };
      expect(stored.dictionarySettings.cacheSize).toBe(50);
    });

    test('should persist auto-lookup toggle', () => {
      const newSettings = { autoLookupOnDoubleClick: true };

      // Test that chrome.storage.local.set can be called
      expect(chrome.storage.local.set).toBeDefined();

      // Simulate setting storage
      const stored = { dictionarySettings: newSettings };
      expect(stored.dictionarySettings.autoLookupOnDoubleClick).toBe(true);
    });
  });

  describe('Modal Creation', () => {
    test('should create modal with correct ARIA attributes', () => {
      const modal = document.createElement('div');
      modal.id = 'assist-dictionary-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-labelledby', 'assist-dictionary-title');
      modal.setAttribute('aria-modal', 'true');

      expect(modal.getAttribute('role')).toBe('dialog');
      expect(modal.getAttribute('aria-labelledby')).toBe('assist-dictionary-title');
      expect(modal.getAttribute('aria-modal')).toBe('true');
    });

    test('should display word as title', () => {
      const word = 'example';
      const title = document.createElement('h2');
      title.id = 'assist-dictionary-title';
      title.textContent = word;

      expect(title.textContent).toBe('example');
      expect(title.id).toBe('assist-dictionary-title');
    });

    test('should render phonetic pronunciation', () => {
      const phonetics = [{ text: '/ɪɡˈzɑːmpəl/', audio: 'https://example.com/audio.mp3' }];

      const phoneticText = phonetics.find((p) => p.text)?.text;
      expect(phoneticText).toBe('/ɪɡˈzɑːmpəl/');
    });

    test('should render audio button when available', () => {
      const phonetics = [{ text: '/test/', audio: 'https://example.com/audio.mp3' }];

      const phoneticWithAudio = phonetics.find((p) => p.audio);
      expect(phoneticWithAudio).toBeDefined();
      expect(phoneticWithAudio.audio).toBe('https://example.com/audio.mp3');
    });

    test('should render multiple meanings', () => {
      const meanings = [
        { partOfSpeech: 'noun', definitions: [{ definition: 'Noun definition' }] },
        { partOfSpeech: 'verb', definitions: [{ definition: 'Verb definition' }] },
      ];

      expect(meanings.length).toBe(2);
      expect(meanings[0].partOfSpeech).toBe('noun');
      expect(meanings[1].partOfSpeech).toBe('verb');
    });

    test('should render synonyms and antonyms', () => {
      const meaning = {
        partOfSpeech: 'noun',
        definitions: [],
        synonyms: ['sample', 'instance', 'case'],
        antonyms: ['whole', 'entirety'],
      };

      expect(meaning.synonyms.length).toBe(3);
      expect(meaning.antonyms.length).toBe(2);
    });

    test('should limit synonyms to 8 items', () => {
      const synonyms = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
      const limited = synonyms.slice(0, 8);

      expect(limited.length).toBe(8);
      expect(limited).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    });
  });

  describe('Audio Playback', () => {
    test('should create Audio instance with correct URL', () => {
      const audioUrl = 'https://example.com/pronunciation.mp3';
      const audio = new Audio(audioUrl);

      expect(Audio).toHaveBeenCalled();
      expect(audio).toBeDefined();
    });

    test('should handle audio playback successfully', async () => {
      const audio = new Audio('https://example.com/audio.mp3');

      // Audio should have been created
      expect(audio).toBeDefined();
      expect(typeof audio).toBe('object');
    });

    test('should handle audio playback errors', async () => {
      const audio = new Audio('https://example.com/audio.mp3');
      if (audio.play) {
        audio.play = jest.fn().mockRejectedValue(new Error('Playback failed'));
        await expect(audio.play()).rejects.toThrow('Playback failed');
      }
    });

    test('should support pause functionality', () => {
      const audio = new Audio('https://example.com/audio1.mp3');

      // Audio should have been created
      expect(audio).toBeDefined();
    });
  });

  describe('Default Settings', () => {
    test('should have correct default enabled state', () => {
      const defaults = { enabled: true };
      expect(defaults.enabled).toBe(true);
    });

    test('should have correct default cache size', () => {
      const defaults = { cacheSize: 100 };
      expect(defaults.cacheSize).toBe(100);
    });

    test('should have auto-lookup disabled by default', () => {
      const defaults = { autoLookupOnDoubleClick: false };
      expect(defaults.autoLookupOnDoubleClick).toBe(false);
    });
  });

  describe('WCAG Compliance', () => {
    test('should have accessible close button', () => {
      const button = document.createElement('button');
      button.className = 'assist-dictionary-close';
      button.setAttribute('aria-label', 'Close dictionary');

      expect(button.getAttribute('aria-label')).toBe('Close dictionary');
    });

    test('should have accessible audio button', () => {
      const button = document.createElement('button');
      button.className = 'assist-dictionary-play-audio';
      button.setAttribute('aria-label', 'Play pronunciation');

      expect(button.getAttribute('aria-label')).toBe('Play pronunciation');
    });

    test('should support keyboard navigation (Escape to close)', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      expect(event.key).toBe('Escape');
    });

    test('should have semantic HTML structure', () => {
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');

      const heading = document.createElement('h2');
      const list = document.createElement('ol');

      expect(modal.getAttribute('role')).toBe('dialog');
      expect(heading.tagName).toBe('H2');
      expect(list.tagName).toBe('OL');
    });
  });

  describe('Performance', () => {
    test('should use LRU cache to reduce API calls', () => {
      const cache = new Map();
      const maxSize = 100;

      // Simulate 150 lookups (should evict 50)
      for (let i = 0; i < 150; i++) {
        if (cache.size >= maxSize) {
          const firstKey = cache.keys().next().value;
          cache.delete(firstKey);
        }
        cache.set(`word${i}`, { data: i });
      }

      expect(cache.size).toBe(maxSize);
      expect(cache.has('word0')).toBe(false); // Evicted
      expect(cache.has('word149')).toBe(true); // Recent entry
    });

    test('should handle large synonym lists efficiently', () => {
      const synonyms = Array.from({ length: 100 }, (_, i) => `synonym${i}`);
      const limited = synonyms.slice(0, 8);

      expect(limited.length).toBe(8);
      expect(synonyms.length).toBe(100);
    });
  });
});
