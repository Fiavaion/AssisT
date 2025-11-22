/**
 * E2E Tests for OCR + Screenshot Tool
 * Phase 2 - Feature 1 Implementation
 *
 * Tests the OCR settings and configuration UI:
 * 1. Enable/disable OCR feature
 * 2. Settings configuration (language, confidence, upscale, auto-TTS)
 * 3. Feature visibility controls
 * 4. Settings persistence
 * 5. Accessibility compliance
 */

import { test, expect } from './extension-fixture.js';

test.describe('OCR - Basic Activation', () => {

  test('should enable OCR from popup', async ({ popupPage }) => {
    // Wait for popup to load
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Verify OCR toggle exists
    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await expect(ocrToggle).toBeVisible();

    // Enable OCR
    await ocrToggle.check({ force: true });
    expect(await ocrToggle.isChecked()).toBe(true);

    // Verify OCR options become visible
    const ocrOptions = popupPage.locator('#ocr-options-container');
    await popupPage.waitForTimeout(300);
    await expect(ocrOptions).toBeVisible();

    // Verify trigger button is visible
    const triggerButton = popupPage.locator('#btn-trigger-ocr');
    await expect(triggerButton).toBeVisible();
  });

  test('should show OCR settings when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable OCR
    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });

    // Wait for options to appear
    await popupPage.waitForTimeout(300);

    // Verify all settings are visible
    await expect(popupPage.locator('#ocr-auto-activate-reading')).toBeVisible();
    await expect(popupPage.locator('#ocr-upscale-factor')).toBeVisible();
    await expect(popupPage.locator('#ocr-language')).toBeVisible();
    await expect(popupPage.locator('#ocr-confidence-threshold')).toBeVisible();
    await expect(popupPage.locator('#ocr-auto-tts')).toBeVisible();
  });

  test('should have trigger OCR button when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable OCR
    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });

    await popupPage.waitForTimeout(300);

    // Verify trigger button exists and has correct text
    const triggerButton = popupPage.locator('#btn-trigger-ocr');
    await expect(triggerButton).toBeVisible();
    const buttonText = await triggerButton.textContent();
    expect(buttonText).toContain('Start OCR');
  });
});

test.describe('OCR - Settings Configuration', () => {

  test('should configure OCR language', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const languageSelect = popupPage.locator('#ocr-language');
    await languageSelect.scrollIntoViewIfNeeded();

    // Change to Spanish
    await languageSelect.selectOption('spa');
    expect(await languageSelect.inputValue()).toBe('spa');

    // Verify other languages are available
    const options = await languageSelect.locator('option').allTextContents();
    expect(options).toContain('English');
    expect(options).toContain('Spanish');
    expect(options).toContain('French');
    expect(options).toContain('German');
  });

  test('should adjust confidence threshold', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const confidenceSlider = popupPage.locator('#ocr-confidence-threshold');
    const confidenceValue = popupPage.locator('#confidence-value');

    await confidenceSlider.scrollIntoViewIfNeeded();

    // Set to 80%
    await confidenceSlider.fill('80');
    expect(await confidenceValue.textContent()).toBe('80%');

    // Set to 50%
    await confidenceSlider.fill('50');
    expect(await confidenceValue.textContent()).toBe('50%');
  });

  test('should configure upscale factor for better OCR accuracy', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const upscaleSlider = popupPage.locator('#ocr-upscale-factor');
    const upscaleLabel = popupPage.locator('#upscale-label');

    await upscaleSlider.scrollIntoViewIfNeeded();

    // Set to Low (1.0x)
    await upscaleSlider.fill('1.0');
    expect(await upscaleLabel.textContent()).toContain('Low');

    // Set to Medium (1.5x)
    await upscaleSlider.fill('1.5');
    expect(await upscaleLabel.textContent()).toContain('Medium');

    // Set to High (2.0x)
    await upscaleSlider.fill('2.0');
    expect(await upscaleLabel.textContent()).toContain('High');
  });

  test('should toggle auto-activate reading mode', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const autoReadingToggle = popupPage.locator('#ocr-auto-activate-reading');
    await autoReadingToggle.scrollIntoViewIfNeeded();

    // Enable auto-activate
    await autoReadingToggle.check({ force: true });
    expect(await autoReadingToggle.isChecked()).toBe(true);

    // Disable auto-activate
    await autoReadingToggle.uncheck({ force: true });
    expect(await autoReadingToggle.isChecked()).toBe(false);
  });

  test('should toggle auto-TTS', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const autoTTSToggle = popupPage.locator('#ocr-auto-tts');
    await autoTTSToggle.scrollIntoViewIfNeeded();

    // Enable auto-TTS
    await autoTTSToggle.check({ force: true });
    expect(await autoTTSToggle.isChecked()).toBe(true);

    // Disable auto-TTS
    await autoTTSToggle.uncheck({ force: true });
    expect(await autoTTSToggle.isChecked()).toBe(false);
  });
});

test.describe('OCR - Feature Isolation', () => {

  test('should not interfere with TTS feature', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Find TTS toggle
    const ttsToggle = popupPage.locator('#toggle-tts');
    await ttsToggle.scrollIntoViewIfNeeded();

    // Enable TTS
    await ttsToggle.check({ force: true });

    // Find and enable OCR
    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });

    // Verify both are enabled
    expect(await ttsToggle.isChecked()).toBe(true);
    expect(await ocrToggle.isChecked()).toBe(true);
  });
});

test.describe('OCR - Accessibility', () => {

  test('should have accessible OCR toggle', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();

    // Check ARIA attributes
    const ariaLabel = await ocrToggle.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain('Enable OCR');
  });

  test('should have accessible trigger button', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const triggerButton = popupPage.locator('#btn-trigger-ocr');
    await triggerButton.scrollIntoViewIfNeeded();

    // Check ARIA attributes
    const ariaLabel = await triggerButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toContain('OCR');
  });

  test('should have accessible language selector', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const languageSelect = popupPage.locator('#ocr-language');
    await languageSelect.scrollIntoViewIfNeeded();

    // Check ARIA attributes
    const ariaLabel = await languageSelect.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });
});

test.describe('OCR - Settings Defaults', () => {

  test('should have correct default settings', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    // Scroll to each element before checking
    await popupPage.locator('#ocr-language').scrollIntoViewIfNeeded();
    await popupPage.locator('#ocr-confidence-threshold').scrollIntoViewIfNeeded();
    await popupPage.locator('#ocr-upscale-factor').scrollIntoViewIfNeeded();
    await popupPage.locator('#ocr-auto-activate-reading').scrollIntoViewIfNeeded();
    await popupPage.locator('#ocr-auto-tts').scrollIntoViewIfNeeded();

    // Verify defaults
    expect(await popupPage.locator('#ocr-language').inputValue()).toBe('eng');
    expect(await popupPage.locator('#ocr-confidence-threshold').inputValue()).toBe('60');
    expect(await popupPage.locator('#ocr-upscale-factor').inputValue()).toBe('1.5');
    expect(await popupPage.locator('#ocr-auto-activate-reading').isChecked()).toBe(false);
    expect(await popupPage.locator('#ocr-auto-tts').isChecked()).toBe(false);
  });

  test('should support all 14 languages', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#toggle-ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await ocrToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const languageSelect = popupPage.locator('#ocr-language');
    await languageSelect.scrollIntoViewIfNeeded();
    const optionCount = await languageSelect.locator('option').count();

    // Should have 14 language options
    expect(optionCount).toBe(14);

    // Test specific languages
    const languages = await languageSelect.locator('option').allTextContents();
    expect(languages).toContain('English');
    expect(languages).toContain('Spanish');
    expect(languages).toContain('French');
    expect(languages).toContain('German');
    expect(languages).toContain('Chinese (Simplified)');
    expect(languages).toContain('Japanese');
    expect(languages).toContain('Korean');
    expect(languages).toContain('Arabic');
  });
});
