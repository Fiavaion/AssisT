/**
 * Release-gate E2E checks — the Chrome-only verifications that unit tests cannot cover.
 *
 * Covers: extension boot, the popup's Maths Support + OCR accuracy surfaces, and the on-page maths
 * tools on a real LMS-matched origin.
 *
 * The institution signature gate used to live here behind ASSIST_TEST_INSTITUTION_KEY, and skipped
 * whenever that was unset — which is always, in CI and on a fresh clone, so the one property that
 * stops institution impersonation was never actually checked. It now runs unconditionally in
 * tests/unit/institution/institution-resolver.test.js against an in-process keypair, with no
 * environment variable and no real key anywhere near the repo.
 *
 * Run: npx playwright test tests/e2e/release-gates.spec.js  (headed; requires a display)
 */

import { test, expect } from './extension-fixture.js';

async function mergeSettings(page, patch) {
  await page.evaluate(
    p =>
      new Promise(resolve => {
        chrome.storage.local.get('assist_settings', r => {
          const settings = r.assist_settings || {};
          for (const [key, value] of Object.entries(p)) {
            settings[key] = { ...(settings[key] || {}), ...value };
          }
          chrome.storage.local.set({ assist_settings: settings }, resolve);
        });
      }),
    patch
  );
}

test.describe('extension boot', () => {
  test('service worker registers and the popup mounts without console errors', async ({
    popupPage,
  }) => {
    const errors = [];
    popupPage.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    await expect(popupPage.locator('#tts-enabled')).toBeAttached();
    await popupPage.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
});

test.describe('popup surfaces (this release)', () => {
  test('Maths Support: switching it on in the popup shows its tools and persists', async ({
    popupPage,
  }) => {
    // Driven and read in Flat, the popup a student sees. Flat's switch drives the hidden accordion
    // control of the same id, whose handler stores the setting.
    const master = popupPage.locator('#flat-maths');
    await expect(master).toBeVisible();
    await expect(popupPage.locator('[data-settings-for="maths"]')).toHaveCount(0);

    await master.setChecked(true, { force: true });
    await expect(popupPage.locator('#maths-enabled')).toBeChecked();
    const settings = popupPage.locator('[data-settings-for="maths"]');
    await expect(settings).toBeVisible();
    await expect(settings.locator('#flat-maths-calculator')).toBeChecked();
    await expect(settings.locator('#flat-maths-number-format')).not.toBeChecked();

    const stored = await popupPage.evaluate(
      () =>
        new Promise(resolve =>
          chrome.storage.local.get('assist_settings', r => resolve(r.assist_settings?.maths))
        )
    );
    expect(stored?.enabled).toBe(true);
  });

  test('OCR accuracy-boost toggle exists, defaults off, persists on', async ({ popupPage }) => {
    // The accuracy toggle is one of OCR's settings, drawn in Flat under the OCR row once OCR is
    // on. Flat's controls drive the hidden accordion controls of the same ids.
    await popupPage.locator('#flat-ocr').setChecked(true, { force: true });
    await expect(popupPage.locator('#ocr-enabled')).toBeChecked();
    const toggle = popupPage.locator('#flat-ocr-offline-accuracy');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();

    await toggle.setChecked(true, { force: true });
    await expect(popupPage.locator('#ocr-offline-accuracy')).toBeChecked();
    const stored = await popupPage.evaluate(
      () =>
        new Promise(resolve =>
          chrome.storage.local.get('assist_settings', r =>
            resolve(r.assist_settings?.ocr?.offlineAccuracy)
          )
        )
    );
    expect(stored).toBe(true);
  });
});

test.describe('maths tools on a live LMS-matched page', () => {
  test('calculator FAB mounts, evaluates from the keyboard, and number formatting wraps page numbers live', async ({
    context,
    popupPage,
  }) => {
    test.setTimeout(90000);
    await mergeSettings(popupPage, {
      maths: { enabled: true, calculator: true, numberFormat: false, placeValue: false },
    });

    const page = await context.newPage();
    await page.goto('https://canvas.instructure.com/login/canvas', {
      waitUntil: 'domcontentloaded',
      timeout: 45000,
    });

    // FAB mounts (content script matched the LMS origin).
    const fab = page.locator('button[aria-label="Maths tools"]');
    await expect(fab).toBeAttached({ timeout: 20000 });

    // Open the panel; opening must move focus into the dialog group.
    await fab.click();
    const dialog = page.locator('[role="dialog"][aria-label*="alculator"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeFocused();

    // A physical digit lands on the display (keyboard path).
    await page.keyboard.press('7');
    const display = dialog.locator('[aria-label="Calculator display"]');
    await expect(display).toHaveText('7');
    await dialog.getByRole('button', { name: 'Clear' }).click();
    await expect(display).toHaveText('0');

    // Evaluate 2+3 via the on-screen keypad (the accessible button path).
    await dialog.getByRole('button', { name: '2', exact: true }).click();
    await dialog.getByRole('button', { name: 'Plus' }).click();
    await dialog.getByRole('button', { name: '3', exact: true }).click();
    await dialog.getByRole('button', { name: 'Equals' }).click();
    await expect(display).toHaveText('5');

    await page.keyboard.press('Escape'); // clears entry
    await page.keyboard.press('Escape'); // closes panel
    await expect(dialog).toBeHidden();

    // Plant a large number, then switch formatting on — the storage change applies live.
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.id = 'assist-e2e-number';
      p.textContent = 'Budget: 30000 this year';
      document.body.appendChild(p);
    });
    await mergeSettings(popupPage, { maths: { enabled: true, numberFormat: true } });

    const wrapped = page.locator('#assist-e2e-number .assist-mathfmt');
    await expect(wrapped).toBeAttached({ timeout: 15000 });
    await expect(wrapped).toHaveText('30,000');
    const label = await wrapped.getAttribute('aria-label');
    expect(label).toMatch(/thirty thousand/i);

    // Off restores the original text.
    await mergeSettings(popupPage, { maths: { enabled: true, numberFormat: false } });
    await expect(wrapped).toHaveCount(0, { timeout: 15000 });
    await page.close();
  });
});
