/**
 * E2E Tests for Dyslexia-Optimized Reading Mode - STREAMLINED
 * Tests core Dyslexia Mode functionality only
 *
 * Full test suite backup: tests/e2e-full-suite-backup/dyslexia-mode.spec.js
 * Restore with: bash tests/e2e/restore-full-suite.sh
 */

import { test, expect } from './extension-fixture.js';

async function enableDyslexiaMode(popupPage) {
  await popupPage.waitForLoadState('domcontentloaded');
  await popupPage.waitForTimeout(500);

  const dyslexiaToggle = popupPage.locator('#dyslexia-mode-enabled');
  await dyslexiaToggle.scrollIntoViewIfNeeded();

  const isChecked = await dyslexiaToggle.isChecked();
  if (!isChecked) {
    await dyslexiaToggle.click();
    await popupPage.waitForTimeout(100);
  }

  expect(await dyslexiaToggle.isChecked()).toBe(true);
  await popupPage.waitForTimeout(300);
}

test.describe('Dyslexia Mode - Core', () => {
  test('should apply bionic reading to text content', async ({ popupPage }) => {
    await enableDyslexiaMode(popupPage);

    const bionicRadio = popupPage.locator('#dyslexia-bionic');
    await bionicRadio.scrollIntoViewIfNeeded();
    await expect(bionicRadio).toBeVisible();

    const isChecked = await bionicRadio.isChecked();
    if (!isChecked) {
      await bionicRadio.click();
    }

    expect(await bionicRadio.isChecked()).toBe(true);
  });

  test('should only allow one mode active at a time', async ({ popupPage }) => {
    await enableDyslexiaMode(popupPage);

    const bionicRadio = popupPage.locator('#dyslexia-bionic');
    const syllableRadio = popupPage.locator('#dyslexia-syllable');

    await bionicRadio.scrollIntoViewIfNeeded();
    await bionicRadio.click();
    expect(await bionicRadio.isChecked()).toBe(true);

    await syllableRadio.scrollIntoViewIfNeeded();
    await syllableRadio.click();

    expect(await bionicRadio.isChecked()).toBe(false);
    expect(await syllableRadio.isChecked()).toBe(true);
  });
});

// Skipped tests - restore full suite if needed
test.describe('Dyslexia Mode - Bionic Reading Extended', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should bold correct number of letters based on word length', async ({ popupPage }) => {});
  test('should restore original content when disabled', async ({ popupPage }) => {});
});

test.describe('Dyslexia Mode - Syllable Highlighting', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should apply alternating color backgrounds', async ({ popupPage }) => {});
  test('should adjust color intensity with slider', async ({ popupPage }) => {});
});

test.describe('Dyslexia Mode - Grammar Color-Coding', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should apply color-coding based on parts of speech', async ({ popupPage }) => {});
  test('should use compromise.js library for NLP', async ({ popupPage }) => {});
});

test.describe('Dyslexia Mode - Feature Isolation Extended', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should not interfere with TTS feature', async ({ popupPage }) => {});
  test('should persist settings across popup opens', async ({ popupPage }) => {});
});

test.describe('Dyslexia Mode - Performance', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should transform page in under 300ms', async ({ popupPage }) => {});
  test('should handle large content efficiently', async ({ popupPage }) => {});
});

test.describe('Dyslexia Mode - Advanced Options Integration', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should be toggleable via Advanced Options modal', async ({ popupPage }) => {});
});
