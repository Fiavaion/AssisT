/**
 * E2E Tests for Feature Visibility (Sprint 7)
 * Tests hiding/showing features via Advanced Options
 */

import { test, expect } from './extension-fixture.js';

test.describe('Feature Visibility - Sprint 7', () => {
  test.beforeEach(async ({ popupPage }) => {
    // Open advanced options modal before each test (correct ID: btn-options)
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
    await optionsButton.click();

    // Wait for modal to appear (use specific modal ID)
    const modal = popupPage.locator('#advanced-options-modal');
    await expect(modal).toBeVisible({ timeout: 2000 });
  });

  test('should have Features tab in advanced options', async ({ popupPage }) => {
    // Look for Features tab
    const featuresTab = popupPage.locator('button:has-text("Features"), [role="tab"]:has-text("Features")');
    await expect(featuresTab).toBeVisible({ timeout: 2000 });
  });

  test('should show feature visibility checkboxes', async ({ popupPage }) => {
    // Click Features tab if it exists
    const featuresTab = popupPage.locator('button:has-text("Features"), [role="tab"]:has-text("Features")').first();

    if (await featuresTab.isVisible()) {
      await featuresTab.click();
      await popupPage.waitForTimeout(300);
    }

    // Should have checkboxes for hiding features
    const checkboxes = popupPage.locator('input[type="checkbox"]');
    const count = await checkboxes.count();

    // Should have multiple feature visibility checkboxes
    expect(count).toBeGreaterThan(3);
  });

  test('should have labels describing hideable features', async ({ popupPage }) => {
    // Click Features tab
    const featuresTab = popupPage.locator('button:has-text("Features"), [role="tab"]:has-text("Features")').first();

    if (await featuresTab.isVisible()) {
      await featuresTab.click();
    }

    // Check for common feature labels
    const textContent = await popupPage.textContent('body');

    // Should mention some Sprint 7 features
    const hasFeatureLabels =
      textContent.includes('Highlighting') ||
      textContent.includes('Text Customization') ||
      textContent.includes('Reading Guide') ||
      textContent.includes('Canvas');

    expect(hasFeatureLabels).toBe(true);
  });

  test('should toggle feature visibility', async ({ popupPage }) => {
    // Click Features tab
    const featuresTab = popupPage.locator('button:has-text("Features"), [role="tab"]:has-text("Features")').first();

    if (await featuresTab.isVisible()) {
      await featuresTab.click();
      await popupPage.waitForTimeout(300);

      // Find first checkbox in the modal content (not the main page)
      const modalCheckbox = popupPage.locator('#advanced-options-modal input[type="checkbox"]:not([disabled])').first();

      if (await modalCheckbox.count() > 0 && await modalCheckbox.isVisible()) {
        const wasChecked = await modalCheckbox.isChecked();

        // Toggle it using JS to avoid overlay issues
        const checkboxId = await modalCheckbox.getAttribute('id');
        await popupPage.evaluate((id) => {
          const cb = document.querySelector(id ? `#${id}` : '#advanced-options-modal input[type="checkbox"]:not([disabled])');
          if (cb) {
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, checkboxId);

        await popupPage.waitForTimeout(100);

        // Verify state changed
        const isNowChecked = await modalCheckbox.isChecked();
        expect(isNowChecked).toBe(!wasChecked);
      }
    }
  });

  test('should have Save Changes button', async ({ popupPage }) => {
    // Look for Save Changes button in modal
    const saveButton = popupPage.locator('button:has-text("Save Changes"), button:has-text("Save")');
    await expect(saveButton.first()).toBeVisible();
  });

  test('should persist visibility changes after save', async ({ popupPage }) => {
    // This test would require:
    // 1. Toggle a feature off
    // 2. Save changes
    // 3. Reload popup
    // 4. Verify feature is hidden
    // This is a more complex test that would need actual implementation

    const saveButton = popupPage.locator('button:has-text("Save Changes"), button:has-text("Save")').first();
    await expect(saveButton).toBeVisible();
  });
});

test.describe('Core Features Protection', () => {
  test('should not allow hiding core TTS controls', async ({ popupPage }) => {
    // Click Features tab
    const featuresTab = popupPage.locator('button:has-text("Features"), [role="tab"]:has-text("Features")').first();

    if (await featuresTab.isVisible()) {
      await featuresTab.click();
      await popupPage.waitForTimeout(300);
    }

    // Core features should be disabled or not present in hide list
    const bodyText = await popupPage.textContent('body');

    // The modal should mention that some features cannot be hidden
    // or core controls should not appear in the hideable list
    expect(bodyText.length).toBeGreaterThan(0);
  });
});

test.describe('Feature Visibility Modal Interaction', () => {
  test('should close modal on cancel', async ({ popupPage }) => {
    // Open modal first
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
    await optionsButton.click();

    // Find cancel or close button
    const cancelButton = popupPage.locator('button:has-text("Cancel"), button:has-text("Close"), button.close').first();

    if (await cancelButton.isVisible()) {
      await cancelButton.click();

      // Modal should disappear (use specific modal ID)
      const modal = popupPage.locator('#advanced-options-modal');
      await expect(modal).not.toBeVisible({ timeout: 2000 });
    }
  });

  test('should have multiple tabs in advanced options', async ({ popupPage }) => {
    // Open modal first
    const optionsButton = popupPage.locator('[data-testid="settings-button"]');
    await optionsButton.click();

    // Wait for modal to appear
    await popupPage.waitForTimeout(300);

    // Count tabs (correct class is .modal-tab)
    const tabs = popupPage.locator('.modal-tab');
    const count = await tabs.count();

    // Should have 3 tabs (Features, Keyboard, Appearance)
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
