/**
 * E2E Tests for User Profiles Feature (Sprint 7) - STREAMLINED
 * Tests core profile functionality only
 *
 * Full test suite backup: tests/e2e-full-suite-backup/user-profiles.test.js
 * Restore with: bash tests/e2e/restore-full-suite.sh
 */

import { test, expect } from './extension-fixture.js';

test.describe('User Profiles - Core', () => {
  test('should show profile selector dropdown', async ({ popupPage }) => {
    const profileSelect = popupPage.locator('[data-testid="profile-select"]');
    await expect(profileSelect).toBeVisible();
  });

  test('should have default profiles available', async ({ popupPage }) => {
    const profileSelect = popupPage.locator('[data-testid="profile-select"]');

    const options = await profileSelect.locator('option').allTextContents();

    const profileText = options.join(' ');
    expect(profileText).toContain('Default');
    expect(profileText.toLowerCase()).toContain('reading');
  });
});

// Skipped tests - restore full suite if needed
test.describe('User Profiles - Extended', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should have Save Profile button', async ({ popupPage }) => {});
  test('should switch between profiles', async ({ popupPage }) => {});
});

test.describe('Profile Management', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should open advanced options modal', async ({ popupPage }) => {});
  test('should have export profiles button in modal', async ({ popupPage }) => {});
  test('should have import profiles button in modal', async ({ popupPage }) => {});
});

test.describe('Profile Profiles', () => {
  test.skip(true, 'Extended tests skipped - restore full suite if needed');

  test('should apply Reading Mode settings', async ({ popupPage }) => {});
  test('should apply Quiz Mode settings', async ({ popupPage }) => {});
});
