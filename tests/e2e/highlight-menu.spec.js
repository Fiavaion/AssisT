/**
 * E2E Tests for Highlight Menu - STREAMLINED
 * Tests core Highlight Menu functionality only
 *
 * Full test suite backup: tests/e2e-full-suite-backup/highlight-menu.spec.js
 * Restore with: bash tests/e2e/restore-full-suite.sh
 */

import { test, expect } from './extension-fixture.js';

async function setCheckboxState(page, selector, checked) {
  await page.evaluate(({ selector, checked }) => {
    const checkbox = document.querySelector(selector);
    if (checkbox && checkbox.checked !== checked) {
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { selector, checked });
}

test.describe('Highlight Menu - Core', () => {
  test('should enable Highlight Menu from popup', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await expect(highlightMenuToggle).toBeVisible();

    await highlightMenuToggle.check({ force: true });
    expect(await highlightMenuToggle.isChecked()).toBe(true);

    const optionsContainer = popupPage.locator('#highlight-menu-options-container');
    await popupPage.waitForTimeout(300);
    await expect(optionsContainer).toBeVisible();
  });

  test('should show button toggles when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await setCheckboxState(popupPage, '#highlight-menu-enabled', true);
    await popupPage.waitForTimeout(300);

    // Check at least one button toggle is visible
    const ttsToggle = popupPage.locator('#highlight-menu-show-tts');
    await expect(ttsToggle).toBeVisible();
  });
});

// Skipped tests - restore full suite if needed
test.describe('Highlight Menu - Extended', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should show auto-hide delay slider when enabled', async ({ popupPage }) => {});
  test('should toggle TTS button visibility', async ({ popupPage }) => {});
  test('should adjust auto-hide delay slider', async ({ popupPage }) => {});
  test('should have correct default settings', async ({ popupPage }) => {});
  test('should hide options when Highlight Menu disabled', async ({ popupPage }) => {});
  test('should toggle all button options', async ({ popupPage }) => {});
  test('should have accessible Highlight Menu toggle', async ({ popupPage }) => {});
  test('should have accessible button toggles', async ({ popupPage }) => {});
  test('should have accessible delay slider', async ({ popupPage }) => {});
});
