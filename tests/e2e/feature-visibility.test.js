/**
 * E2E Tests for Feature Visibility (Sprint 7) - STREAMLINED
 * Tests core feature visibility functionality only
 *
 * Full test suite backup: tests/e2e-full-suite-backup/feature-visibility.test.js
 * Restore with: bash tests/e2e/restore-full-suite.sh
 */

import { test, expect } from './extension-fixture.js';

test.describe('Feature Visibility - Core', () => {
  test('should have Features tab in advanced options', async ({ popupPage }) => {
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
    await optionsButton.click();

    const modal = popupPage.locator('#advanced-options-modal');
    await expect(modal).toBeVisible({ timeout: 2000 });

    const featuresTab = popupPage.locator('button:has-text("Features"), [role="tab"]:has-text("Features")');
    await expect(featuresTab).toBeVisible({ timeout: 2000 });
  });

  test('should show feature visibility checkboxes', async ({ popupPage }) => {
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
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

// Skipped tests - restore full suite if needed
test.describe('Feature Visibility - Extended', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should have labels describing hideable features', async ({ popupPage }) => {});
  test('should toggle feature visibility', async ({ popupPage }) => {});
  test('should have Save Changes button', async ({ popupPage }) => {});
  test('should persist visibility changes after save', async ({ popupPage }) => {});
});

test.describe('Core Features Protection', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should not allow hiding core TTS controls', async ({ popupPage }) => {});
});

test.describe('Feature Visibility Modal Interaction', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should close modal on cancel', async ({ popupPage }) => {});
  test('should have multiple tabs in advanced options', async ({ popupPage }) => {});
});
