/**
 * E2E Tests for Popup UI
 * Tests basic popup functionality and UI interactions
 */

import { test, expect } from './extension-fixture.js';

test.describe('Popup UI', () => {
  test('should load popup successfully', async ({ popupPage }) => {
    // Check that popup loaded
    await expect(popupPage).toHaveTitle(/AssisT/i);

    // Check header exists
    const header = popupPage.locator('h1, .header');
    await expect(header).toBeVisible();
  });

  test('should display TTS controls', async ({ popupPage }) => {
    // Voice selection dropdown should exist
    const voiceSelect = popupPage.locator('#voiceSelect, select[name="voice"]');
    await expect(voiceSelect).toBeVisible();

    // Speed control should exist
    const speedControl = popupPage.locator('#speedControl, input[type="range"][id*="speed"]');
    await expect(speedControl).toBeVisible();

    // Volume control should exist
    const volumeControl = popupPage.locator('#volumeControl, input[type="range"][id*="volume"]');
    await expect(volumeControl).toBeVisible();
  });

  test('should have reset button', async ({ popupPage }) => {
    const resetButton = popupPage.locator('button:has-text("Reset")');
    await expect(resetButton).toBeVisible();
  });

  test('should have options button', async ({ popupPage }) => {
    const optionsButton = popupPage.locator('button:has-text("Options"), button:has-text("⚙")');
    await expect(optionsButton).toBeVisible();
  });
});

test.describe('Feature Toggles', () => {
  test('should show text highlighting toggle', async ({ popupPage }) => {
    const highlightToggle = popupPage.locator('input[type="checkbox"]#highlightToggle, label:has-text("Highlighting")');
    await expect(highlightToggle).toBeVisible();
  });

  test('should show text customization section when enabled', async ({ popupPage }) => {
    // Find text customization toggle
    const textCustomToggle = popupPage.locator('input[type="checkbox"]:near(:text("Text Customization"))').first();

    if (await textCustomToggle.isVisible()) {
      // Enable if not already enabled
      const isChecked = await textCustomToggle.isChecked();
      if (!isChecked) {
        await textCustomToggle.check();
      }

      // Text customization options should be visible
      const fontSelect = popupPage.locator('select:near(:text("Font"))').first();
      await expect(fontSelect).toBeVisible({ timeout: 2000 });
    }
  });
});

test.describe('Settings Persistence', () => {
  test('should persist speed setting', async ({ popupPage }) => {
    // Find speed slider
    const speedSlider = popupPage.locator('input[type="range"]').filter({ hasText: /speed/i }).or(
      popupPage.locator('#speedControl')
    ).first();

    // Set to specific value
    await speedSlider.fill('1.5');

    // Reload popup
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');

    // Check value persisted
    const value = await speedSlider.inputValue();
    expect(parseFloat(value)).toBeCloseTo(1.5, 1);
  });
});
