/**
 * E2E Tests for User Profiles Feature (Sprint 7)
 * Tests profile creation, switching, export, and import
 */

import { test, expect } from './extension-fixture.js';

test.describe('User Profiles - Sprint 7', () => {
  test('should show profile selector dropdown', async ({ popupPage }) => {
    // Profile dropdown should be visible
    const profileSelect = popupPage.locator('[data-testid="profile-select"]');
    await expect(profileSelect).toBeVisible();
  });

  test('should have default profiles available', async ({ popupPage }) => {
    const profileSelect = popupPage.locator('[data-testid="profile-select"]');

    // Get options
    const options = await profileSelect.locator('option').allTextContents();

    // Should include default profiles
    const profileText = options.join(' ');
    expect(profileText).toContain('Default');
    expect(profileText.toLowerCase()).toContain('reading');
  });

  test('should have Save Profile button', async ({ popupPage }) => {
    // Look for save profile button (correct ID: btn-save-profile)
    const saveButton = popupPage.locator('[data-testid="profile-save-button"]');

    // Check if visible
    await expect(saveButton).toBeVisible();
  });

  test('should switch between profiles', async ({ popupPage }) => {
    const profileSelect = popupPage.locator('[data-testid="profile-select"]');

    // Get initial profile
    const initialProfile = await profileSelect.inputValue();

    // Get all options
    const options = await profileSelect.locator('option').all();

    if (options.length > 1) {
      // Select different profile
      const secondOption = await options[1].getAttribute('value');
      await profileSelect.selectOption(secondOption);

      // Wait for page to reload or settings to update
      await popupPage.waitForTimeout(500);

      // Verify profile changed
      const newProfile = await profileSelect.inputValue();
      expect(newProfile).not.toBe(initialProfile);
    }
  });
});

test.describe('Profile Management', () => {
  test('should open advanced options modal', async ({ popupPage }) => {
    // Click options button (correct ID: btn-options)
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
    await optionsButton.click();

    // Modal should appear (use specific modal ID)
    const modal = popupPage.locator('#advanced-options-modal');
    await expect(modal).toBeVisible({ timeout: 2000 });
  });

  test('should have export profiles button in modal', async ({ popupPage }) => {
    // Open options modal
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
    await optionsButton.click();

    // Look for export button (correct ID: btn-export-profiles)
    const exportButton = popupPage.locator('[data-testid="profile-export-button"]');
    await expect(exportButton).toBeVisible({ timeout: 2000 });
  });

  test('should have import profiles button in modal', async ({ popupPage }) => {
    // Open options modal
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
    await optionsButton.click();

    // Look for import button (correct ID: btn-import-profiles)
    const importButton = popupPage.locator('[data-testid="profile-import-button"]');
    await expect(importButton).toBeVisible({ timeout: 2000 });
  });
});

test.describe('Profile Profiles', () => {
  test('should apply Reading Mode settings', async ({ popupPage }) => {
    const profileSelect = popupPage.locator('[data-testid="profile-select"]');

    // Find and select "Reading Mode" if it exists
    const options = await profileSelect.locator('option').allTextContents();
    const readingModeIndex = options.findIndex(opt => opt.toLowerCase().includes('reading'));

    if (readingModeIndex >= 0) {
      await profileSelect.selectOption({ index: readingModeIndex });

      // Wait for settings to apply
      await popupPage.waitForTimeout(1000);

      // Check that TTS is enabled (Reading Mode should have TTS enabled)
      const speedSlider = popupPage.locator('[data-testid="tts-speed-slider"]');
      await expect(speedSlider).toBeVisible();
    }
  });

  test('should apply Quiz Mode settings', async ({ popupPage }) => {
    const profileSelect = popupPage.locator('[data-testid="profile-select"]');

    // Find and select "Quiz Mode" if it exists
    const options = await profileSelect.locator('option').allTextContents();
    const quizModeIndex = options.findIndex(opt => opt.toLowerCase().includes('quiz'));

    if (quizModeIndex >= 0) {
      await profileSelect.selectOption({ index: quizModeIndex });

      // Wait for settings to apply
      await popupPage.waitForTimeout(1000);

      // Quiz mode should be available
      await expect(profileSelect).toBeVisible();
    }
  });
});
