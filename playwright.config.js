/**
 * Playwright Configuration for AssisT Chrome Extension E2E Tests
 * Tests the extension in a real browser environment
 */

import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: './tests/e2e',

  // Test timeout
  timeout: 30000,

  // Expect timeout for assertions
  expect: {
    timeout: 5000
  },

  // Run tests in files sequentially
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],

  // Shared settings for all projects
  use: {
    // Base URL for Canvas test pages
    baseURL: 'https://canvas.instructure.com',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        // Chrome-specific args for extension testing
        launchOptions: {
          args: [
            `--disable-extensions-except=${path.join(__dirname, '.vite')}`,
            `--load-extension=${path.join(__dirname, '.vite')}`,
            '--no-sandbox',
            '--disable-setuid-sandbox'
          ],
          // Keep browser open for debugging if needed
          // headless: false,
          // slowMo: 100
        }
      }
    }
  ],

  // Global setup/teardown
  // globalSetup: require.resolve('./tests/e2e/global-setup.js'),
});
