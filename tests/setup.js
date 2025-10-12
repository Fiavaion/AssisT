/**
 * Jest Setup File
 * Runs before all tests to set up the testing environment
 * Mocks Chrome Extension APIs and browser globals
 *
 * Note: This file uses CommonJS to ensure jest globals are available
 */

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
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
  chrome.storage.local.clear.mockResolvedValue(undefined);
});
