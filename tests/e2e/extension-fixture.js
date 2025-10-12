/**
 * Playwright Extension Test Fixtures
 * Helpers for testing Chrome Extension in E2E tests
 */

import { test as base, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension path
const extensionPath = path.join(__dirname, '..', '..', 'Output');

/**
 * Extended test with extension context
 */
export const test = base.extend({
  // Extension context fixture
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extension testing requires headed mode
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox'
      ]
    });

    await use(context);
    await context.close();
  },

  // Extension ID fixture
  extensionId: async ({ context }, use) => {
    // Get extension ID from chrome://extensions page
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },

  // Popup page fixture
  popupPage: async ({ context, extensionId }, use) => {
    // Open popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await popupPage.waitForLoadState('domcontentloaded');

    await use(popupPage);
    await popupPage.close();
  }
});

export { expect } from '@playwright/test';

/**
 * Helper: Wait for storage to be initialized
 */
export async function waitForStorage(page, timeout = 5000) {
  await page.waitForFunction(
    () => {
      return new Promise((resolve) => {
        chrome.storage.local.get('assist_settings', (result) => {
          resolve(!!result.assist_settings);
        });
      });
    },
    { timeout }
  );
}

/**
 * Helper: Get current settings from storage
 */
export async function getSettings(page) {
  return await page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get('assist_settings', (result) => {
        resolve(result.assist_settings);
      });
    });
  });
}

/**
 * Helper: Set settings in storage
 */
export async function setSettings(page, settings) {
  await page.evaluate((settings) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ assist_settings: settings }, () => {
        resolve();
      });
    });
  }, settings);
}

/**
 * Helper: Clear all extension storage
 */
export async function clearStorage(page) {
  await page.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.clear(() => {
        resolve();
      });
    });
  });
}

/**
 * Helper: Take screenshot with timestamp
 */
export async function screenshotWithTimestamp(page, name) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({
    path: `screenshots/${name}-${timestamp}.png`,
    fullPage: true
  });
}
