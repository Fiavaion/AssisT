/**
 * Popup theme — the Chrome gate.
 *
 * The bug this guards against only appears in a real browser: nothing declared `color-scheme`, so
 * Chrome painted its own selects, sliders and scrollbars to the SYSTEM preference while the CSS
 * painted everything else to the student's. On a dark desktop with a light popup that produced a
 * half-dark, half-light interface. jsdom has no native widgets and no system preference, so only
 * this can catch it.
 *
 * The hard case is therefore run explicitly: a machine set to dark, and a student who asked for
 * light.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';

/** What the popup is actually painting. */
async function readTheme(page) {
  return page.evaluate(() => ({
    dark: document.body.classList.contains('dark-mode'),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }));
}

test.describe('popup theme', () => {
  test('follows the system when the student has not chosen', async ({ context, extensionId }) => {
    const page = await openReadyPopup(context, extensionId);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await page.waitForSelector('.popup-container');
    await page.waitForTimeout(800);

    expect(await readTheme(page)).toEqual({ dark: true, colorScheme: 'dark' });
    await page.close();
  });

  test('an explicit light choice beats a dark machine, natives included', async ({
    context,
    extensionId,
  }) => {
    // This is the exact combination that produced the split interface.
    const page = await openReadyPopup(context, extensionId);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(
      () => new Promise(r => chrome.storage.local.set({ popupTheme: 'light' }, r))
    );
    await page.reload();
    await page.waitForSelector('.popup-container');
    await page.waitForTimeout(800);

    const theme = await readTheme(page);
    expect(theme.dark).toBe(false);
    // The half that was missing: the browser must paint its own widgets light too, or the selects
    // and scrollbars stay dark inside a light popup.
    expect(theme.colorScheme).toBe('light');
    await page.close();
  });

  test('an explicit dark choice holds on a light machine', async ({ context, extensionId }) => {
    const page = await openReadyPopup(context, extensionId);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(
      () => new Promise(r => chrome.storage.local.set({ popupTheme: 'dark' }, r))
    );
    await page.reload();
    await page.waitForSelector('.popup-container');
    await page.waitForTimeout(800);

    expect(await readTheme(page)).toEqual({ dark: true, colorScheme: 'dark' });
    await page.close();
  });

  test('an old Dark Mode choice survives the migration', async ({ context, extensionId }) => {
    const page = await openReadyPopup(context, extensionId);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.evaluate(
      () =>
        new Promise(r =>
          chrome.storage.local.set({ popup_dark_mode: true, popupTheme: undefined }, () =>
            chrome.storage.local.remove('popupTheme', r)
          )
        )
    );
    await page.reload();
    await page.waitForSelector('.popup-container');
    await page.waitForTimeout(800);

    expect((await readTheme(page)).dark).toBe(true);
    await page.close();
  });

  test('the theme control in Flat changes the popup and holds after reopening', async ({
    context,
    extensionId,
  }) => {
    const page = await openReadyPopup(context, extensionId);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForSelector('#flat-root .assist-flat__row');

    await page.locator('[data-theme-choice="dark"]').click();
    await expect(page.locator('body')).toHaveClass(/dark-mode/);
    expect((await readTheme(page)).colorScheme).toBe('dark');

    // It is a real preference, not a session flourish.
    await page.reload();
    await page.waitForSelector('.popup-container');
    await page.waitForTimeout(800);
    expect((await readTheme(page)).dark).toBe(true);
    await page.close();
  });

  test('Flat and the popup around it are painted the same way', async ({
    context,
    extensionId,
  }) => {
    // The reported symptom, stated as a check: Flat must never be one theme inside another.
    const page = await openReadyPopup(context, extensionId);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(
      () => new Promise(r => chrome.storage.local.set({ popupTheme: 'light' }, r))
    );
    await page.reload();
    await page.waitForSelector('.popup-container');
    await page.waitForTimeout(800);
    await page.waitForSelector('#flat-root .assist-flat__row');

    const contrast = await page.evaluate(() => {
      const luminance = colour => {
        const [r, g, b] = colour.match(/\d+/g).map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const row = document.querySelector('#flat-root .assist-flat__row');
      const name = document.querySelector('#flat-root .assist-flat__name');
      return {
        rowLuminance: luminance(getComputedStyle(row).backgroundColor),
        textLuminance: luminance(getComputedStyle(name).color),
      };
    });

    // A light row must carry dark text. When the two followed different settings, both came out
    // light and the text vanished into the surface.
    expect(contrast.rowLuminance).toBeGreaterThan(128);
    expect(contrast.textLuminance).toBeLessThan(128);
    await page.close();
  });
});
