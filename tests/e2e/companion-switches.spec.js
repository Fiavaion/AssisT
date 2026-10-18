/**
 * Companion switches in the popup — the Chrome gate.
 *
 * When the classic layout was retired the companion switches were left behind in it, built at
 * runtime where Flat could not reach them, and a student could not switch any companion feature on
 * or off. This opens the real popup, finds a switch for every companion feature in Flat, turns one
 * off, reopens the popup and checks it is still off, in the popup and in storage.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';
import { COMPANION_FEATURES } from '../../src/features/companion/companion-settings.js';
import { renderedId } from '../../src/popup/registry/control-renderer.js';

const flatSwitchId = key => `#${renderedId(`companion-${key}`)}`;

/** Open the popup and wait until its setup, and Flat, are finished. */
async function openFlatPopup(context, extensionId) {
  const page = await openReadyPopup(context, extensionId);
  await page.waitForSelector('#flat-root .assist-flat__row', { timeout: 15000 });
  return page;
}

function storedCompanionFeatures(page) {
  return page.evaluate(
    () =>
      new Promise(resolve => {
        chrome.storage.local.get('companionFeatures', result =>
          resolve(result.companionFeatures || {})
        );
      })
  );
}

test.describe('Companion switches', () => {
  test('every companion feature has a switch in the popup, and one switched off stays off', async ({
    context,
    extensionId,
  }) => {
    let page = await openFlatPopup(context, extensionId);

    for (const feature of COMPANION_FEATURES) {
      const flatSwitch = page.locator(flatSwitchId(feature.key));
      await expect(flatSwitch).toHaveCount(1);
      await expect(flatSwitch).toHaveAttribute('role', 'switch');
      await expect(flatSwitch).toHaveAttribute('aria-label', feature.label);
    }
    await expect(page.locator('#flat-root')).not.toContainText(/preview/i);

    const flashcards = page.locator(flatSwitchId('flashcards'));
    await expect(flashcards).toBeChecked();
    // Keyboard, as a student without a mouse would: focus the switch and press Space.
    await flashcards.focus();
    await page.keyboard.press('Space');
    await expect(flashcards).not.toBeChecked();

    await expect.poll(async () => (await storedCompanionFeatures(page)).flashcards).toBe(false);
    await page.close();

    page = await openFlatPopup(context, extensionId);
    await expect(page.locator(flatSwitchId('flashcards'))).not.toBeChecked();
    await expect(page.locator(flatSwitchId('lecture'))).toBeChecked();
    expect((await storedCompanionFeatures(page)).flashcards).toBe(false);
    await page.close();
  });
});
