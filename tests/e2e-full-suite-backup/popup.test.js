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
    // Use the correct data-testid selector with force to bypass overlays
    const ttsToggle = popupPage.locator('[data-testid="tts-toggle"]');
    await ttsToggle.scrollIntoViewIfNeeded();
    await ttsToggle.check({ force: true });

    // Wait for options container to become visible
    await popupPage.waitForTimeout(300);

    // Voice selection dropdown should exist
    const voiceSelect = popupPage.locator('[data-testid="tts-voice-select"]');
    await expect(voiceSelect).toBeVisible();

    // Speed control should exist (rate-slider is the correct ID)
    const speedControl = popupPage.locator('[data-testid="tts-speed-slider"]');
    await expect(speedControl).toBeVisible();

    // Volume control should exist
    const volumeControl = popupPage.locator('[data-testid="tts-volume-slider"]');
    await expect(volumeControl).toBeVisible();
  });

  test('should have reset button', async ({ popupPage }) => {
    const resetButton = popupPage.locator('[data-testid="reset-button"]');
    await expect(resetButton).toBeVisible();
  });

  test('should have options button', async ({ popupPage }) => {
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
    await expect(optionsButton).toBeVisible();
  });
});

test.describe('Feature Toggles', () => {
  test('should show text highlighting toggle', async ({ popupPage }) => {
    // Wait for page to be fully loaded
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable TTS first (highlighting controls are hidden by default)
    const ttsToggle = popupPage.locator('[data-testid="tts-toggle"]');

    // Scroll into view and check
    await ttsToggle.scrollIntoViewIfNeeded();
    await ttsToggle.check({ force: true });

    // Wait for options container to become visible
    await popupPage.waitForTimeout(300);

    const highlightToggle = popupPage.locator('[data-testid="tts-highlight-toggle"]');
    await expect(highlightToggle).toBeVisible();
  });

  test('should show text customization section when enabled', async ({ popupPage }) => {
    // Wait for page to be fully loaded
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Find text customization toggle (using checkbox for state check)
    const textCustomToggle = popupPage.locator('[data-testid="text-customization-toggle"]');

    // Scroll into view
    await textCustomToggle.scrollIntoViewIfNeeded();

    // Enable using JavaScript to ensure state change and trigger event
    await popupPage.evaluate(() => {
      const checkbox = document.querySelector('[data-testid="text-customization-toggle"]');
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Wait for toggle state to update
    await popupPage.waitForTimeout(300);

    // Verify the toggle is now checked
    await expect(textCustomToggle).toBeChecked();

    // Text customization section should exist (may be in collapsed accordion)
    const textCustomSection = popupPage.locator('#text-customization-section');
    await expect(textCustomSection).toBeAttached();
  });
});

test.describe('Settings Persistence', () => {
  test('should persist speed setting', async ({ popupPage }) => {
    // Wait for page to be fully loaded
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable TTS first (rate slider is hidden by default)
    const ttsToggle = popupPage.locator('[data-testid="tts-toggle"]');

    // Scroll into view and check
    await ttsToggle.scrollIntoViewIfNeeded();
    await ttsToggle.check({ force: true });

    // Wait for options container to become visible
    await popupPage.waitForTimeout(300);

    // Find speed slider (rate-slider is the correct ID)
    const speedSlider = popupPage.locator('[data-testid="tts-speed-slider"]');

    // Set to specific value
    await speedSlider.fill('1.5');

    // Wait for setting to save
    await popupPage.waitForTimeout(500);

    // Reload popup
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');

    // Re-enable TTS to show slider
    await popupPage.locator('[data-testid="tts-toggle"]').check({ force: true });
    await popupPage.waitForTimeout(300);

    // Check value persisted
    const value = await popupPage.locator('[data-testid="tts-speed-slider"]').inputValue();
    expect(parseFloat(value)).toBeCloseTo(1.5, 1);
  });
});
