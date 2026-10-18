/**
 * E2E tests for the popup: that it loads, and that the controls a student relies on do what
 * they say and remember what was chosen. Each test drives the real popup and checks what the
 * student sees and what was stored in `assist_settings`.
 *
 * The popup's face is the Flat view. Each control it draws (`#flat-<id>`) drives the hidden
 * accordion control of the same id (`#<id>`), whose handler does the work.
 */

import { test, expect, getSettings, waitForPopupReady } from './extension-fixture.js';

/** Switch Read Aloud on and wait until the choice is stored. */
async function switchOnReadAloud(page) {
  await page.locator('#flat-tts').setChecked(true, { force: true });
  await expect.poll(async () => (await getSettings(page))?.tts?.enabled).toBe(true);
}

/** Mark the document, so a later check can tell whether the popup reloaded. */
const markDocument = page => page.evaluate(() => (window.__notReloaded = true));
const stillSameDocument = page => page.evaluate(() => window.__notReloaded === true);

test.describe('Popup UI - Core', () => {
  test('should load popup successfully', async ({ popupPage }) => {
    // Check that popup loaded
    await expect(popupPage).toHaveTitle(/AssisT/i);

    // The compact header's title, the one on screen. One element, named: `h1, .header` matched
    // two and tripped strict mode, which read as a broken popup when nothing was wrong.
    const header = popupPage.locator('h1.popup-header-compact__title');
    await expect(header).toBeVisible();
    await expect(header).toHaveText('AssisT');
  });

  test('should display TTS controls when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable TTS
    await popupPage.locator('#flat-tts').setChecked(true, { force: true });
    await expect(popupPage.locator('[data-testid="tts-toggle"]')).toBeChecked();

    // Core controls should be drawn under Read Aloud
    await expect(popupPage.locator('#flat-voice-select')).toBeVisible();
    await expect(popupPage.locator('#flat-rate-slider')).toBeVisible();
  });
});

test.describe('Popup UI - controls keep their word', () => {
  test('Reset asks first: No changes nothing, Yes puts settings back to their defaults', async ({
    popupPage,
  }) => {
    await waitForPopupReady(popupPage);
    await switchOnReadAloud(popupPage);
    await popupPage.locator('#flat-rate-slider').fill('1.5');
    await expect.poll(async () => (await getSettings(popupPage))?.tts?.rate).toBe(1.5);

    // Reset lives in the header's More menu.
    const reset = popupPage.locator('#menu-reset');
    const openMenu = async () => {
      await popupPage.locator('#btn-header-more').click();
      await expect(reset).toBeVisible();
    };
    await openMenu();
    await expect(reset).toHaveAccessibleName('Reset all settings');

    // Declined: the same popup, the same settings.
    await markDocument(popupPage);
    let asked = '';
    popupPage.once('dialog', dialog => {
      asked = dialog.message();
      dialog.dismiss();
    });
    await reset.click();
    await popupPage.waitForTimeout(800);
    expect(asked).toMatch(/reset all settings/i);
    expect(await stillSameDocument(popupPage)).toBe(true);
    expect((await getSettings(popupPage))?.tts?.rate).toBe(1.5);
    await expect(popupPage.locator('#tts-enabled')).toBeChecked();

    // Confirmed: the popup reloads on the defaults.
    if (!(await reset.isVisible())) {
      await openMenu();
    }
    popupPage.once('dialog', dialog => dialog.accept());
    const reloaded = popupPage.waitForEvent('load');
    await reset.click();
    await reloaded;
    await waitForPopupReady(popupPage);

    const settings = await getSettings(popupPage);
    expect(settings?.tts?.rate).toBe(1);
    expect(settings?.tts?.enabled).toBe(false);
    await expect(popupPage.locator('#tts-enabled')).not.toBeChecked();
    await expect(popupPage.locator('#flat-tts')).not.toBeChecked();
    await expect(popupPage.locator('#flat-rate-slider')).toHaveCount(0);
  });

  test('the gear opens Advanced Options from the keyboard', async ({ popupPage }) => {
    await waitForPopupReady(popupPage);
    const gear = popupPage.getByRole('button', { name: 'Open advanced options' });
    await expect(gear).toBeVisible();

    await gear.focus();
    await popupPage.keyboard.press('Enter');

    const dialog = popupPage.getByRole('dialog', { name: 'Advanced Options' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab', { name: 'Features', exact: true })).toBeFocused();

    await popupPage.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(gear).toBeFocused();
  });

  test('switching Text Highlighting off hides its colour options and is remembered', async ({
    popupPage,
  }) => {
    await waitForPopupReady(popupPage);
    await switchOnReadAloud(popupPage);
    const highlighting = popupPage.locator('#flat-highlight');
    const colour = popupPage.locator('#flat-highlight-color');

    await expect(highlighting).toBeChecked();
    await expect(colour).toBeVisible();

    await highlighting.uncheck({ force: true });
    await expect(colour).toBeHidden();
    await expect
      .poll(async () => (await getSettings(popupPage))?.tts?.highlightEnabled)
      .toBe(false);

    await popupPage.reload();
    await waitForPopupReady(popupPage);
    await expect(highlighting).not.toBeChecked();
    await expect(colour).toBeHidden();

    await highlighting.check({ force: true });
    await expect(colour).toBeVisible();
    await expect
      .poll(async () => (await getSettings(popupPage))?.tts?.highlightEnabled)
      .toBe(true);
  });

  test('switching Text Customization on shows the font and spacing controls', async ({
    popupPage,
  }) => {
    await waitForPopupReady(popupPage);

    const textCustomization = popupPage.locator('#flat-text-customization');
    const font = popupPage.locator('#flat-text-font-family');
    const lineSpacing = popupPage.locator('#flat-text-line-spacing');

    await expect(textCustomization).toBeVisible();
    await expect(textCustomization).not.toBeChecked();
    await expect(font).toBeHidden();

    await textCustomization.check({ force: true });
    await expect(popupPage.locator('#text-customization-enabled')).toBeChecked();
    await expect(font).toBeVisible();
    await expect(lineSpacing).toBeVisible();

    await textCustomization.uncheck({ force: true });
    await expect(font).toBeHidden();
    await expect(lineSpacing).toBeHidden();
  });

  test('a chosen reading speed is stored and shown again after reopening', async ({
    popupPage,
  }) => {
    await waitForPopupReady(popupPage);
    await switchOnReadAloud(popupPage);

    await popupPage.locator('#flat-rate-slider').fill('1.5');
    await expect(popupPage.locator('#flat-rate-slider-value')).toHaveText('1.5x');
    await expect.poll(async () => (await getSettings(popupPage))?.tts?.rate).toBe(1.5);

    await popupPage.reload();
    await waitForPopupReady(popupPage);

    // Read Aloud was remembered too, so the speed control is on screen without switching it on.
    await expect(popupPage.locator('#flat-tts')).toBeChecked();
    await expect(popupPage.locator('#flat-rate-slider')).toBeVisible();
    await expect(popupPage.locator('#flat-rate-slider')).toHaveValue('1.5');
    await expect(popupPage.locator('#flat-rate-slider-value')).toHaveText('1.5x');
  });
});

test.describe('Popup UI - it holds still once it is ready', () => {
  // The permission banner used to be inserted a moment after the popup announced itself ready,
  // pushing every control down by about 160px, so a click aimed at a switch landed on whatever
  // slid into its place.
  test('no control moves after the popup says it is ready', async ({ popupPage }) => {
    await waitForPopupReady(popupPage);
    const tops = () =>
      popupPage.evaluate(() =>
        // Flat's switches: the accordion's are hidden, and a hidden element never moves.
        ['flat-ocr', 'flat-dyslexia-mode'].map(id =>
          Math.round(document.getElementById(id).getBoundingClientRect().top)
        )
      );

    const atReady = await tops();
    await popupPage.waitForTimeout(1500);

    expect(await tops()).toEqual(atReady);
  });
});
