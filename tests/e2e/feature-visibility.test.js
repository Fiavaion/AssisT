/**
 * E2E tests for feature visibility: the Features tab of Advanced Options, where a student chooses
 * which tools the popup shows.
 *
 * Every test drives the real popup and checks two things: what the student sees afterwards, and
 * what was stored in `assist_settings.ui_visibility`. Saving a change reloads the popup, so each
 * save waits for the new document to finish starting before it looks at anything.
 *
 * The popup draws its tools in the Flat view, one row per tool (`[data-tool]`), and a tool hidden
 * here has no row. Every check that a tool disappeared first proves its row was on screen.
 */

import { test, expect, getSettings, waitForPopupReady } from './extension-fixture.js';

async function openAdvancedOptions(page) {
  await waitForPopupReady(page);
  await page.locator('#btn-options-compact').click();
  const dialog = page.getByRole('dialog', { name: 'Advanced Options' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** A Features tab checkbox, by the label the student reads. */
const featureBox = (dialog, name) =>
  dialog.locator('#tab-features').getByRole('checkbox', { name, exact: true });

/** Every "show this tool" checkbox in the Features tab. */
const visibilityBoxes = dialog =>
  dialog.locator('#tab-features input[type="checkbox"][id^="show-"]');

/** Press Save Changes and wait for the popup to reload and settle, as a change makes it do. */
async function saveAndReload(page, dialog) {
  const reloaded = page.waitForEvent('load');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await reloaded;
  await waitForPopupReady(page);
}

/** A tool's row in the Flat view. */
const toolRow = (page, id) => page.locator(`#flat-root .assist-flat__row[data-tool="${id}"]`);

/** Mark the document, so a later check can tell whether the popup reloaded. */
const markDocument = page => page.evaluate(() => (window.__notReloaded = true));
const stillSameDocument = page => page.evaluate(() => window.__notReloaded === true);

test.describe('Feature Visibility - Core', () => {
  test('should have Features tab in advanced options', async ({ popupPage }) => {
    const optionsButton = popupPage.locator('[data-testid="settings-button-compact"]');
    await optionsButton.click();

    const modal = popupPage.locator('#advanced-options-modal');
    await expect(modal).toBeVisible({ timeout: 2000 });

    const featuresTab = popupPage.locator('button:has-text("Features"), [role="tab"]:has-text("Features")');
    await expect(featuresTab).toBeVisible({ timeout: 2000 });
  });

  test('should show feature visibility checkboxes', async ({ popupPage }) => {
    const optionsButton = popupPage.locator('[data-testid="settings-button-compact"]');
    await optionsButton.click();

    const modal = popupPage.locator('#advanced-options-modal');
    await expect(modal).toBeVisible({ timeout: 2000 });

    const featuresTab = popupPage.locator('button:has-text("Features"), [role="tab"]:has-text("Features")').first();

    if (await featuresTab.isVisible()) {
      await featuresTab.click();
      await popupPage.waitForTimeout(300);
    }

    const checkboxes = popupPage.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    expect(count).toBeGreaterThan(3);
  });
});

test.describe('Feature Visibility - choosing what the popup shows', () => {
  test('every hideable tool is a checkbox named after the tool', async ({ popupPage }) => {
    const dialog = await openAdvancedOptions(popupPage);

    const boxes = visibilityBoxes(dialog);
    const count = await boxes.count();
    expect(count).toBeGreaterThan(15);
    for (let i = 0; i < count; i++) {
      await expect(boxes.nth(i)).toHaveAccessibleName(/\w/);
    }

    for (const name of [
      'OCR',
      'Text Customization',
      'Reading Guide',
      'Dyslexia Reading Mode',
      'Speech-to-Text',
    ]) {
      await expect(featureBox(dialog, name)).toBeVisible();
    }
  });

  test('unticking a tool and saving takes it out of the popup, ticking brings it back', async ({
    popupPage,
  }) => {
    await waitForPopupReady(popupPage);
    const guide = toolRow(popupPage, 'reading-guide');
    const textCustomization = toolRow(popupPage, 'text-customization');
    await expect(guide).toBeVisible();

    let dialog = await openAdvancedOptions(popupPage);
    await expect(featureBox(dialog, 'Reading Guide')).toBeChecked();
    await featureBox(dialog, 'Reading Guide').uncheck();
    await saveAndReload(popupPage, dialog);

    await expect(textCustomization).toBeVisible();
    await expect(guide).toHaveCount(0);

    dialog = await openAdvancedOptions(popupPage);
    await featureBox(dialog, 'Reading Guide').check();
    await saveAndReload(popupPage, dialog);
    await expect(guide).toBeVisible();
  });

  test('Save Changes works from the keyboard and returns focus to the gear', async ({
    popupPage,
  }) => {
    const dialog = await openAdvancedOptions(popupPage);
    await markDocument(popupPage);

    await dialog.getByRole('button', { name: 'Save Changes' }).focus();
    await popupPage.keyboard.press('Enter');

    await expect(popupPage.locator('#advanced-options-modal')).toHaveCount(0);
    await expect(popupPage.locator('#btn-options-compact')).toBeFocused();
    // Nothing was changed, so there is nothing to reload for.
    await popupPage.waitForTimeout(800);
    expect(await stillSameDocument(popupPage)).toBe(true);
  });

  test('a hidden tool stays hidden in a popup opened later', async ({
    popupPage,
    context,
    extensionId,
  }) => {
    const dialog = await openAdvancedOptions(popupPage);

    // Keyboard only: Space unticks the box, Enter presses Save.
    await featureBox(dialog, 'Reading Guide').focus();
    await popupPage.keyboard.press('Space');
    await expect(featureBox(dialog, 'Reading Guide')).not.toBeChecked();
    const reloaded = popupPage.waitForEvent('load');
    await dialog.getByRole('button', { name: 'Save Changes' }).focus();
    await popupPage.keyboard.press('Enter');
    await reloaded;

    await expect
      .poll(async () => (await getSettings(popupPage))?.ui_visibility?.show_reading_guide)
      .toBe(false);

    const later = await context.newPage();
    await later.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    const laterDialog = await openAdvancedOptions(later);
    await expect(featureBox(laterDialog, 'Reading Guide')).not.toBeChecked();
    await expect(featureBox(laterDialog, 'OCR')).toBeChecked();
    await later.close();
  });

  test('hiding Annotations & Sticky Notes takes the Sticky Notes switch out of the popup', async ({
    popupPage,
  }) => {
    await waitForPopupReady(popupPage);
    const stickyNotes = toolRow(popupPage, 'annotations');
    await expect(stickyNotes).toBeVisible();

    const dialog = await openAdvancedOptions(popupPage);
    await featureBox(dialog, 'Annotations & Sticky Notes').uncheck();
    await saveAndReload(popupPage, dialog);

    await expect(toolRow(popupPage, 'stt')).toBeVisible();
    await expect(stickyNotes).toHaveCount(0);
  });

  test('hiding Translation Features takes the translation controls out of the popup', async ({
    popupPage,
  }) => {
    await waitForPopupReady(popupPage);
    const translate = toolRow(popupPage, 'translation');
    await expect(translate).toBeVisible();

    const dialog = await openAdvancedOptions(popupPage);
    await featureBox(dialog, 'Translation Features').uncheck();
    await saveAndReload(popupPage, dialog);

    await expect(translate).toHaveCount(0);
    await expect(popupPage.locator('#flat-btn-translate-page')).toHaveCount(0);
  });
});

test.describe('Core Features Protection', () => {
  test('Read Aloud cannot be hidden, even with every other tool unticked', async ({
    popupPage,
  }) => {
    // Seventeen boxes unticked one at a time, then a save and a reload: past the 30s default.
    test.slow();
    await waitForPopupReady(popupPage);
    await popupPage.locator('#flat-tts').setChecked(true, { force: true });
    await expect.poll(async () => (await getSettings(popupPage))?.tts?.enabled).toBe(true);

    const dialog = await openAdvancedOptions(popupPage);
    const names = await dialog
      .locator('#tab-features input[type="checkbox"]')
      .evaluateAll(boxes =>
        boxes.map(box =>
          (box.labels?.[0]?.textContent || box.getAttribute('aria-label') || '').trim()
        )
      );
    expect(names.filter(name => /read aloud|text-to-speech|\btts\b/i.test(name))).toEqual([]);

    const boxes = visibilityBoxes(dialog);
    const count = await boxes.count();
    for (let i = 0; i < count; i++) {
      await boxes.nth(i).uncheck();
    }
    await saveAndReload(popupPage, dialog);

    // The save happened...
    expect((await getSettings(popupPage))?.ui_visibility?.show_ocr).toBe(false);
    // ...and reading aloud is all still there, with its voice and speed.
    await expect(popupPage.locator('#flat-tts')).toBeVisible();
    await expect(popupPage.locator('#flat-tts')).toBeChecked();
    await expect(popupPage.locator('#flat-voice-select')).toBeVisible();
    await expect(popupPage.locator('#flat-rate-slider')).toBeVisible();
  });
});

test.describe('Feature Visibility Modal Interaction', () => {
  test('Cancel closes the dialog, keeps nothing that was changed, and returns focus', async ({
    popupPage,
  }) => {
    let dialog = await openAdvancedOptions(popupPage);
    await markDocument(popupPage);
    await featureBox(dialog, 'Reading Guide').uncheck();

    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(popupPage.locator('#advanced-options-modal')).toHaveCount(0);
    await expect(popupPage.locator('#btn-options-compact')).toBeFocused();
    await popupPage.waitForTimeout(800);
    expect(await stillSameDocument(popupPage)).toBe(true);
    expect((await getSettings(popupPage))?.ui_visibility?.show_reading_guide).not.toBe(false);

    dialog = await openAdvancedOptions(popupPage);
    await expect(featureBox(dialog, 'Reading Guide')).toBeChecked();
  });

  test('Advanced Options has five tabs, and choosing one shows its panel alone', async ({
    popupPage,
  }) => {
    const dialog = await openAdvancedOptions(popupPage);
    const features = dialog.getByRole('tab', { name: 'Features', exact: true });
    const preferences = dialog.getByRole('tab', { name: 'Preferences', exact: true });

    await expect(dialog.getByRole('tab')).toHaveText([
      'Features',
      'Keyboard',
      'Preferences',
      'AI',
      'Your data',
    ]);
    await expect(features).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('#tab-features')).toBeVisible();

    await preferences.click();

    await expect(preferences).toHaveAttribute('aria-selected', 'true');
    await expect(features).toHaveAttribute('aria-selected', 'false');
    await expect(dialog.locator('#tab-preferences')).toBeVisible();
    await expect(dialog.locator('#tab-features')).toBeHidden();
  });
});
