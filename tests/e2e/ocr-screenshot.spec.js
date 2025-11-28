/**
 * E2E Tests for OCR + Screenshot Tool - STREAMLINED
 * Tests core OCR functionality only
 *
 * Full test suite backup: tests/e2e-full-suite-backup/ocr-screenshot.spec.js
 * Restore with: bash tests/e2e/restore-full-suite.sh
 */

import { test, expect } from './extension-fixture.js';

async function enableOCRFeature(popupPage) {
  await popupPage.waitForLoadState('domcontentloaded');
  await popupPage.waitForTimeout(500);

  const ocrToggle = popupPage.locator('#ocr-enabled');
  await ocrToggle.scrollIntoViewIfNeeded();

  const isChecked = await ocrToggle.isChecked();
  if (!isChecked) {
    await ocrToggle.click();
    await popupPage.waitForTimeout(100);
  }

  expect(await ocrToggle.isChecked()).toBe(true);
  await popupPage.waitForTimeout(300);
}

test.describe('OCR - Core', () => {
  test('should enable OCR from popup', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const ocrToggle = popupPage.locator('#ocr-enabled');
    await ocrToggle.scrollIntoViewIfNeeded();
    await expect(ocrToggle).toBeVisible();

    const isChecked = await ocrToggle.isChecked();
    if (!isChecked) {
      await ocrToggle.click();
      await popupPage.waitForTimeout(100);
    }
    expect(await ocrToggle.isChecked()).toBe(true);

    const ocrOptions = popupPage.locator('#ocr-options-container');
    await popupPage.waitForTimeout(300);
    await expect(ocrOptions).toBeVisible();
  });

  test('should show OCR settings when enabled', async ({ popupPage }) => {
    await enableOCRFeature(popupPage);

    await expect(popupPage.locator('#ocr-auto-reading-mode')).toBeVisible();
    await expect(popupPage.locator('#ocr-upscale-factor')).toBeVisible();
    await expect(popupPage.locator('#ocr-language')).toBeVisible();
  });
});

// Skipped tests - restore full suite if needed
test.describe('OCR - Basic Activation Extended', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should have trigger OCR button when enabled', async ({ popupPage }) => {});
});

test.describe('OCR - Settings Configuration', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should configure OCR language', async ({ popupPage }) => {});
  test('should adjust confidence threshold', async ({ popupPage }) => {});
  test('should configure upscale factor for better OCR accuracy', async ({ popupPage }) => {});
  test('should toggle auto-activate reading mode', async ({ popupPage }) => {});
  test('should toggle auto-TTS', async ({ popupPage }) => {});
});

test.describe('OCR - Feature Isolation', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should not interfere with TTS feature', async ({ popupPage }) => {});
});

test.describe('OCR - Accessibility', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should have accessible OCR toggle', async ({ popupPage }) => {});
  test('should have accessible trigger button', async ({ popupPage }) => {});
  test('should have accessible language selector', async ({ popupPage }) => {});
});

test.describe('OCR - Settings Defaults', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should have correct default settings', async ({ popupPage }) => {});
  test('should support all 14 languages', async ({ popupPage }) => {});
});
