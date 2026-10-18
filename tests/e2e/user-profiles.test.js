/**
 * User profiles live in Advanced Options → Preferences. An earlier version of this spec looked for
 * a profile selector in the main popup, a surface that was removed; the feature itself is intact.
 */

import { test, expect } from './extension-fixture.js';

async function openPreferences(popupPage) {
  // The gear in the popup's header.
  await popupPage.locator('#btn-options-compact').click();
  await popupPage.locator('.modal-tab[data-tab="preferences"]').click();
  return popupPage.locator('#tab-preferences');
}

test.describe('User Profiles - Core', () => {
  test('the Preferences tab shows the profile selector', async ({ popupPage }) => {
    const prefs = await openPreferences(popupPage);
    await expect(prefs.locator('#modal-profile-select')).toBeVisible();
  });

  test('default profiles are available', async ({ popupPage }) => {
    const prefs = await openPreferences(popupPage);
    const options = await prefs.locator('#modal-profile-select option').allTextContents();
    const text = options.join(' ');
    expect(text).toContain('Default');
    expect(text.toLowerCase()).toContain('reading');
  });
});
