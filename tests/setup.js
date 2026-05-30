/**
 * Jest Setup File
 * Runs before all tests to set up the testing environment
 * Mocks Chrome Extension APIs and browser globals
 *
 * Note: This file uses CommonJS to ensure jest globals are available
 */

// jsdom's environment does not expose Node's global structuredClone, which fake-indexeddb
// (used by the Dexie-backed storage tests) requires. Provide a real, structured clone via the
// v8 serializer (handles Dates/arrays/nested objects, unlike a JSON round-trip).
if (typeof global.structuredClone !== 'function') {
  const v8 = require('node:v8');
  global.structuredClone = val => v8.deserialize(v8.serialize(val));
}

// DOMPurify requires window to be set — make it available for sanitize.js in jsdom
const DOMPurify = require('dompurify');
global.window.DOMPurify = DOMPurify;

// jsdom does not implement speechSynthesis — stub it so TTS-dependent modules don't crash
global.window.speechSynthesis = {
  getVoices: () => [],
  speak: () => {},
  cancel: () => {},
  pause: () => {},
  resume: () => {},
  speaking: false,
  paused: false,
  pending: false,
  addEventListener: () => {},
  removeEventListener: () => {},
};

// Mock Chrome Extension API - proper Jest mock functions
global.chrome = {
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined)
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    getURL: jest.fn((path) => `chrome-extension://test-id/${path}`),
    id: 'test-extension-id'
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    sendMessage: jest.fn().mockResolvedValue({})
  }
};

// Reset all mocks before each test
beforeEach(() => {
  jest.clearAllMocks();

  // Reset chrome.storage mocks to default behavior
  // Check if methods exist before calling mockResolvedValue (test files may override chrome object)
  if (chrome?.storage?.local?.get?.mockResolvedValue) {
    chrome.storage.local.get.mockResolvedValue({});
  }
  if (chrome?.storage?.local?.set?.mockResolvedValue) {
    chrome.storage.local.set.mockResolvedValue(undefined);
  }
  if (chrome?.storage?.local?.remove?.mockResolvedValue) {
    chrome.storage.local.remove.mockResolvedValue(undefined);
  }
  if (chrome?.storage?.local?.clear?.mockResolvedValue) {
    chrome.storage.local.clear.mockResolvedValue(undefined);
  }
});
