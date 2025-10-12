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
    // Wait for page to be fully loaded
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable TTS first (controls are hidden by default)
    const ttsToggle = popupPage.locator('#tts-enabled');

    // Scroll into view and check
    await ttsToggle.scrollIntoViewIfNeeded();
    await ttsToggle.check({ force: true });

    // Wait for options container to become visible
    await popupPage.waitForTimeout(300);

    // Voice selection dropdown should exist
    const voiceSelect = popupPage.locator('#voice-select');
    await expect(voiceSelect).toBeVisible();

    // Speed control should exist (rate-slider is the correct ID)
    const speedControl = popupPage.locator('#rate-slider');
    await expect(speedControl).toBeVisible();

    // Volume control should exist
    const volumeControl = popupPage.locator('#volume-slider');
    await expect(volumeControl).toBeVisible();
  });

  test('should have reset button', async ({ popupPage }) => {
    const resetButton = popupPage.locator('#btn-reset');
    await expect(resetButton).toBeVisible();
  });

  test('should have options button', async ({ popupPage }) => {
    const optionsButton = popupPage.locator('#btn-options');
    await expect(optionsButton).toBeVisible();
  });
});

test.describe('Feature Toggles', () => {
  test('should show text highlighting toggle', async ({ popupPage }) => {
    // Wait for page to be fully loaded
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable TTS first (highlighting controls are hidden by default)
    const ttsToggle = popupPage.locator('#tts-enabled');

    // Scroll into view and check
    await ttsToggle.scrollIntoViewIfNeeded();
    await ttsToggle.check({ force: true });

    // Wait for options container to become visible
    await popupPage.waitForTimeout(300);

    const highlightToggle = popupPage.locator('#highlight-enabled');
    await expect(highlightToggle).toBeVisible();
  });

  test('should show text customization section when enabled', async ({ popupPage }) => {
    // Find text customization toggle
    const textCustomToggle = popupPage.locator('#text-customization-enabled');

    if (await textCustomToggle.isVisible()) {
      // Enable if not already enabled
      const isChecked = await textCustomToggle.isChecked();
      if (!isChecked) {
        await textCustomToggle.check();
      }

      // Text customization options should be visible
      const fontSelect = popupPage.locator('#font-family-select');
      await expect(fontSelect).toBeVisible({ timeout: 2000 });
    }
  });
});

test.describe('Settings Persistence', () => {
  test('should persist speed setting', async ({ popupPage }) => {
    // Wait for page to be fully loaded
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable TTS first (rate slider is hidden by default)
    const ttsToggle = popupPage.locator('#tts-enabled');

    // Scroll into view and check
    await ttsToggle.scrollIntoViewIfNeeded();
    await ttsToggle.check({ force: true });

    // Wait for options container to become visible
    await popupPage.waitForTimeout(300);

    // Find speed slider (rate-slider is the correct ID)
    const speedSlider = popupPage.locator('#rate-slider');

    // Set to specific value
    await speedSlider.fill('1.5');

    // Wait for setting to save
    await popupPage.waitForTimeout(500);

    // Reload popup
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');

    // Re-enable TTS to show slider
    await popupPage.locator('#tts-enabled').check({ force: true });
    await popupPage.waitForTimeout(300);

    // Check value persisted
    const value = await popupPage.locator('#rate-slider').inputValue();
    expect(parseFloat(value)).toBeCloseTo(1.5, 1);
  });
});
