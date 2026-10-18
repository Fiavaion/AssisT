/**
 * Flat popup — the Chrome gate.
 *
 * jsdom proves the modules agree with each other. This proves the extension actually works: the
 * real popup, loaded by a real Chrome with the real build, with a support switched on through
 * Flat, the popup's only face.
 *
 * The thing being verified is the design's one load-bearing claim — that Flat drives the controls
 * the hidden accordion owns, so a change made in Flat is the change the accordion's handler makes.
 * If the ids ever drift, this fails here rather than in a student's browser.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';

/**
 * Open the popup and wait for Flat.
 *
 * Flat is drawn near the end of the popup's own setup, several async storage reads after the
 * markup appears, so wait for the popup to say it is ready first.
 */
async function openFlatPopup(context, extensionId) {
  const page = await openReadyPopup(context, extensionId);
  await page.waitForSelector('#flat-root .assist-flat__row', { timeout: 15000 });
  return page;
}

test.describe('Flat popup', () => {
  test('shows every support on one screen', async ({ context, extensionId }) => {
    const page = await openFlatPopup(context, extensionId);

    const rows = page.locator('#flat-root .assist-flat__row');
    expect(await rows.count()).toBeGreaterThan(20);

    // Grouped, with the count always visible.
    const groups = await page.locator('#flat-root .assist-flat__group').allTextContents();
    expect(groups).toEqual(['Reading', 'Writing', 'Seeing', 'Focus', 'Study']);
    await expect(page.locator('#flat-root .assist-flat__count')).toContainText('supports');

    // The accordion is still in the document — Flat drives it — but out of the way.
    await expect(page.locator('.popup-main')).toBeHidden();
    await page.close();
  });

  test('switching a support on in Flat switches it on in the popup itself', async ({
    context,
    extensionId,
  }) => {
    const page = await openFlatPopup(context, extensionId);

    const flatSwitch = page.locator('#flat-tts');
    const realSwitch = page.locator('#tts-enabled');
    const wasOn = await realSwitch.isChecked();

    await flatSwitch.setChecked(!wasOn, { force: true });
    await expect(realSwitch).toBeChecked({ checked: !wasOn });

    // And the setting behind it actually moved, which is the handler's doing, not Flat's.
    const stored = await page.evaluate(
      () =>
        new Promise(resolve => {
          chrome.storage.local.get('assist_settings', result =>
            resolve(result.assist_settings?.tts?.enabled)
          );
        })
    );
    expect(stored).toBe(!wasOn);
    await page.close();
  });

  test('a switched-on support shows its settings under its own row', async ({
    context,
    extensionId,
  }) => {
    const page = await openFlatPopup(context, extensionId);

    await page.locator('#flat-tts').setChecked(true, { force: true });
    const settings = page.locator('#flat-root .assist-flat__settings').first();
    await expect(settings).toBeVisible();

    // Named with its tool, never a bare "Speed". Flat namespaces every id it draws (see
    // renderedId in control-renderer.js), so the accordion's #rate-slider is #flat-rate-slider here.
    await expect(page.locator('#flat-root #flat-rate-slider')).toHaveAttribute(
      'aria-label',
      'Read Aloud — Speed'
    );
    await page.close();
  });

  test('the supports inside Read Aloud come and go with it', async ({ context, extensionId }) => {
    const page = await openFlatPopup(context, extensionId);

    // Off: not on the screen at all, and Read Aloud's own row says what it is holding.
    await page.locator('#flat-tts').setChecked(false, { force: true });
    await expect(page.locator('#flat-root [data-nested-under="tts"]')).toHaveCount(0);
    await expect(page.locator('#flat-root [data-tool="tts"] .assist-flat__holds')).toContainText(
      'Highlight While Reading'
    );

    await page.locator('#flat-tts').setChecked(true, { force: true });

    // On: inside Read Aloud, in a group announced by its name, each with its own switch.
    const nested = page.locator('#flat-root [data-nested-under="tts"]');
    await expect(nested).toHaveAttribute('aria-label', 'Read Aloud options');
    await expect(nested.locator('.assist-flat__row')).toHaveCount(2);
    await expect(nested.locator('#flat-highlight')).toHaveAttribute('role', 'switch');

    // And a nested switch drives the accordion's own control, exactly as a top-level one does.
    await nested.locator('#flat-word-by-word').setChecked(true, { force: true });
    await expect(page.locator('#word-by-word-enabled')).toBeChecked();
    await expect(nested.locator('[data-settings-for="word-by-word"]')).toHaveCount(1);
    await page.close();
  });

  test('the filter collapses the list and one press brings it all back', async ({
    context,
    extensionId,
  }) => {
    const page = await openFlatPopup(context, extensionId);

    const rows = page.locator('#flat-root .assist-flat__row');
    const total = await rows.count();

    await page.locator('#flat-root .assist-flat__filter').click();
    await expect(page.locator('#flat-root .assist-flat__count')).toContainText('hidden');
    expect(await rows.count()).toBeLessThan(total);

    await page.locator('#flat-root .assist-flat__filter').click();
    expect(await rows.count()).toBe(total);
    await page.close();
  });

  test('there is no switch back to the accordion popup', async ({ context, extensionId }) => {
    const page = await openFlatPopup(context, extensionId);

    await expect(page.locator('#new-experience-toggle')).toHaveCount(0);
    await expect(page.locator('.popup-main')).toBeHidden();
    await expect(page.locator('.popup-header')).toHaveCount(0);
    await expect(page.locator('.popup-header-compact')).toBeVisible();
    await page.close();
  });

  test('every support is reachable by keyboard', async ({ context, extensionId }) => {
    const page = await openFlatPopup(context, extensionId);

    // Each row's switch is a real focusable control with an accessible name — the thing a
    // screen-reader user needs and the thing a purely visual check would miss.
    const named = await page
      .locator('#flat-root .assist-flat__row input[type="checkbox"]')
      .evaluateAll(inputs =>
        inputs.every(
          input =>
            input.getAttribute('role') === 'switch' &&
            (input.getAttribute('aria-label') || '').length > 0 &&
            input.getAttribute('aria-checked') !== null
        )
      );
    expect(named).toBe(true);
    await page.close();
  });
});
