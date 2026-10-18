/**
 * Playwright Extension Test Fixtures
 * Helpers for testing Chrome Extension in E2E tests
 */

import { test as base, chromium } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension path - use .vite build output (Vite bundles extension here)
// ASSIST_EXT_DIR points a run at a frozen copy of the build, so a rebuild cannot change it mid-run.
const extensionPath = process.env.ASSIST_EXT_DIR || path.join(__dirname, '..', '..', '.vite');

/**
 * A copy of the build whose manifest grants permissions a student would have granted: every site
 * (`allSites`), or the optional hosts of outside services they have allowed (`grantedHosts`, ADR
 * 0009). Chrome grants an optional permission only from a real click on its own prompt, which a
 * test cannot press, so the grant is written into a copy instead: each granted host moves from
 * optional_host_permissions to host_permissions. A host the manifest does not offer as optional
 * is an error, so a spec cannot grant something the extension never asks for.
 */
function grantedCopy({ allSites, grantedHosts }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assist-granted-'));
  try {
    fs.cpSync(extensionPath, dir, { recursive: true });
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const optional = manifest.optional_host_permissions || [];
    const unknown = grantedHosts.filter(host => !optional.includes(host));
    if (unknown.length > 0) {
      throw new Error(`grantedHosts not offered as optional in the manifest: ${unknown.join(', ')}`);
    }
    const granted = [...grantedHosts, ...(allSites ? ['<all_urls>'] : [])];
    manifest.host_permissions = [...new Set([...(manifest.host_permissions || []), ...granted])];
    manifest.optional_host_permissions = optional.filter(host => !grantedHosts.includes(host));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return dir;
  } catch (error) {
    removeCopy(dir);
    throw error;
  }
}

/** Windows can hold a file in the copy for a moment after Chrome closes, so retry before giving up. */
function removeCopy(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/**
 * The ID Chrome gives an unpacked extension: the first 32 hex digits of a SHA-256 of its folder's
 * absolute path, each digit written as a letter a-p. Chrome hashes the path as UTF-16 on Windows,
 * with a lower-case drive letter raised to upper case (checked against a real load: only the
 * upper-case form matched), and as UTF-8 bytes of the resolved path elsewhere.
 */
function unpackedExtensionId(dir) {
  const windowsPath = path.resolve(dir).replace(/^[a-z]:/, drive => drive.toUpperCase());
  const bytes =
    process.platform === 'win32'
      ? Buffer.from(windowsPath, 'utf16le')
      : Buffer.from(fs.realpathSync(dir), 'utf8');
  const hex = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  return [...hex].map(digit => 'abcdefghijklmnop'[parseInt(digit, 16)]).join('');
}

/**
 * Wait for the install to open its welcome page, then close it.
 *
 * Every test starts from a fresh install, and the install ends by opening the welcome page in a new
 * active tab. When the install ran slowly that tab opened in the middle of a test and took the focus
 * from the page under test, so whichever focus check came next failed. Waiting for it here also
 * turns an install that never finishes into one clear failure instead of a stray one later.
 */
async function closeInstallWelcome(context) {
  const isWelcome = page => page.url().endsWith('/src/pages/welcome/welcome.html');
  const deadline = Date.now() + 20000;
  let welcome = context.pages().find(isWelcome);
  while (!welcome && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
    welcome = context.pages().find(isWelcome);
  }
  if (!welcome) {
    throw new Error('The extension did not finish installing: its welcome page never opened.');
  }
  await welcome.close();
}

/**
 * Extended test with extension context
 */
export const test = base.extend({
  // `test.use({ allSites: true })` runs a spec against a build granted every site.
  allSites: [false, { option: true }],

  // `test.use({ grantedHosts: ['https://api.crossref.org/*'] })` runs a spec against a build that
  // already holds those optional hosts, as after a student allowed the service (ADR 0009). For
  // specs about what a service does once allowed; the asking itself is third-party-consent.spec.js.
  grantedHosts: [[], { option: true }],

  // `test.use({ keepWelcomeTab: true })` leaves the install's welcome page open, for a test of it.
  keepWelcomeTab: [false, { option: true }],

  // The folder Chrome loads the extension from.
  extensionDir: async ({ allSites, grantedHosts }, use) => {
    const copied = allSites || grantedHosts.length > 0;
    const dir = copied ? grantedCopy({ allSites, grantedHosts }) : extensionPath;
    try {
      await use(dir);
    } finally {
      if (copied) {
        removeCopy(dir);
      }
    }
  },

  // Extension context fixture
  context: async ({ extensionDir, keepWelcomeTab }, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false, // Extension testing requires headed mode
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        '--no-sandbox',
      ],
    });
    if (!keepWelcomeTab) {
      await closeInstallWelcome(context);
    }

    await use(context);
    await context.close();
  },

  // The worker's own address names the extension when Playwright sees it start. A worker that
  // started before Playwright was watching is never reported, and waiting for it hung a test until
  // its time ran out, so after a short wait the ID comes from the folder instead.
  extensionId: async ({ context, extensionDir }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context
        .waitForEvent('serviceworker', { timeout: 10000 })
        .catch(() => null);
    }
    await use(background ? background.url().split('/')[2] : unpackedExtensionId(extensionDir));
  },

  // Popup page fixture. Hands the test a popup that has finished initialising, not merely one
  // whose DOM has parsed. Handlers bind at step 3 of eight, and step 5 then writes every control's
  // state back from settings, so a click that landed between the two was silently undone. That is
  // how the maths and OCR toggle gates each failed about one run in three.
  popupPage: async ({ context, extensionId }, use) => {
    const popupPage = await openReadyPopup(context, extensionId);

    await use(popupPage);
    await popupPage.close();
  },
});

export { expect } from '@playwright/test';

/**
 * Open the popup as a page and wait until its start-up has finished: settings painted, listeners
 * attached, the permission banner settled and a student's clicks no longer held.
 *
 * Seed storage through this, never through a popup that has only loaded. The popup writes while it
 * starts (it copies `ui_overlay` into `textStatsBadgeVisible`, for one), so a seed written into a
 * half-started popup could be overwritten, and the test failed only on the runs where it was.
 * `viewport` sizes the page before the popup lays itself out.
 */
export async function openReadyPopup(context, extensionId, { viewport } = {}) {
  const page = await context.newPage();
  if (viewport) {
    await page.setViewportSize(viewport);
  }
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await waitForPopupReady(page);
  return page;
}

/** Wait until a popup page has finished starting, as after a reload. */
export async function waitForPopupReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.popupReady === 'true', null, {
    timeout: 20000,
  });
}

/**
 * Helper: Wait for storage to be initialized
 */
export async function waitForStorage(page, timeout = 5000) {
  await page.waitForFunction(
    () => {
      return new Promise(resolve => {
        chrome.storage.local.get('assist_settings', result => {
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
    return new Promise(resolve => {
      chrome.storage.local.get('assist_settings', result => {
        resolve(result.assist_settings);
      });
    });
  });
}

/**
 * Helper: Set settings in storage
 */
export async function setSettings(page, settings) {
  await page.evaluate(settings => {
    return new Promise(resolve => {
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
    return new Promise(resolve => {
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
    fullPage: true,
  });
}
