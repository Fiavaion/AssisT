/**
 * Jest Configuration for AssisT Chrome Extension
 * Using CommonJS for compatibility
 */

module.exports = {
  // Use jsdom to simulate browser environment
  testEnvironment: 'jsdom',

  // Transform ES modules with Babel
  transform: {
    '^.+\\.(js|mjs)$': ['babel-jest', {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
    }]
  },

  // Allow Jest to transform ESM packages in node_modules
  // Dexie uses ESM exports that Jest can't parse without transformation
  transformIgnorePatterns: [
    'node_modules/(?!(dexie)/)'
  ],

  // Module name mapper for CSS and other non-JS imports
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js'
  },

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test match patterns - exclude E2E tests (run with Playwright)
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/unit/**/*.spec.js',
    '<rootDir>/tests/performance/**/*.test.js'
  ],

  // Coverage configuration — scoped to files that can be unit tested in jsdom.
  // Adapters, AI clients, content scripts, popup, and service-worker require
  // real browser APIs or live network calls; those are covered by E2E tests.
  collectCoverageFrom: [
    'src/engines/**/*.js',
    'src/features/annotations/**/*.js',
    'src/features/citations/**/*.js',
    'src/features/dictionary/**/*.js',
    'src/features/textStats/**/*.js',
    'src/features/translation/**/*.js',
    'src/features/tts/**/*.js',
    'src/features/ocr/**/*.js',
    'src/features/stt/**/*.js',
    'src/utils/**/*.js',
    'src/core/**/*.js',
    '!**/*.test.js',
    '!**/*.spec.js',
  ],

  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20
    }
  },

  // Coverage reporting
  coverageReporters: ['text', 'lcov', 'html'],

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/Output/'
  ],

  // Verbose output for debugging
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
