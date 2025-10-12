/**
 * Jest Configuration for AssisT Chrome Extension
 * Using CommonJS for compatibility
 */

module.exports = {
  // Use jsdom to simulate browser environment
  testEnvironment: 'jsdom',

  // Transform ES modules with Babel
  transform: {
    '^.+\\.js$': ['babel-jest', {
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]]
    }]
  },

  // Module name mapper for CSS and other non-JS imports
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js'
  },

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Test match patterns - exclude E2E tests (run with Playwright)
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/unit/**/*.spec.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/*.spec.js',
    '!src/background/service-worker.js', // Service workers hard to test
  ],

  coverageThreshold: {
    global: {
      branches: 70,    // Start with 70%, work toward 80%
      functions: 70,
      lines: 70,
      statements: 70
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
