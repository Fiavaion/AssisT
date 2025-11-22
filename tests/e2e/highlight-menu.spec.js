/**
 * E2E Tests for Highlight Menu Feature
 * Phase 2 - Feature 2 Implementation
 *
 * Tests the Highlight Menu floating toolbar:
 * 1. Enable/disable Highlight Menu feature
 * 2. Settings configuration (button toggles, auto-hide delay)
 * 3. Button visibility based on settings
 * 4. Settings persistence
 * 5. Accessibility compliance
 */

import { test, expect } from './extension-fixture.js';

test.describe('Highlight Menu - Basic Activation', () => {

  test('should enable Highlight Menu from popup', async ({ popupPage }) => {
    // Wait for popup to load
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Verify Highlight Menu toggle exists
    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await expect(highlightMenuToggle).toBeVisible();

    // Enable Highlight Menu
    await highlightMenuToggle.check({ force: true });
    expect(await highlightMenuToggle.isChecked()).toBe(true);

    // Verify options become visible
    const optionsContainer = popupPage.locator('#highlight-menu-options-container');
    await popupPage.waitForTimeout(300);
    await expect(optionsContainer).toBeVisible();
  });

  test('should show button toggles when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable Highlight Menu
    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await highlightMenuToggle.check({ force: true });

    // Wait for options to appear
    await popupPage.waitForTimeout(300);

    // Verify all button toggles are visible
    await expect(popupPage.locator('#highlight-menu-show-tts')).toBeVisible();
    await expect(popupPage.locator('#highlight-menu-show-dictionary')).toBeVisible();
    await expect(popupPage.locator('#highlight-menu-show-translate')).toBeVisible();
    await expect(popupPage.locator('#highlight-menu-show-search')).toBeVisible();
    await expect(popupPage.locator('#highlight-menu-show-annotate')).toBeVisible();
    await expect(popupPage.locator('#highlight-menu-show-copy')).toBeVisible();
  });

  test('should show auto-hide delay slider when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable Highlight Menu
    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await highlightMenuToggle.check({ force: true });

    await popupPage.waitForTimeout(300);

    // Verify auto-hide delay slider exists
    const delaySlider = popupPage.locator('#highlight-menu-auto-hide-delay');
    await expect(delaySlider).toBeVisible();

    // Verify delay label shows correct value
    const delayLabel = popupPage.locator('#highlight-menu-delay-label');
    await expect(delayLabel).toBeVisible();
    const labelText = await delayLabel.textContent();
    expect(labelText).toMatch(/\d+ seconds?/);
  });
});

test.describe('Highlight Menu - Settings Configuration', () => {

  test('should toggle TTS button visibility', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await highlightMenuToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    // Toggle TTS button
    const ttsToggle = popupPage.locator('#highlight-menu-show-tts');
    await ttsToggle.scrollIntoViewIfNeeded();

    // Initial state (should be checked by default)
    expect(await ttsToggle.isChecked()).toBe(true);

    // Uncheck TTS button
    await ttsToggle.uncheck({ force: true });
    expect(await ttsToggle.isChecked()).toBe(false);

    // Check TTS button again
    await ttsToggle.check({ force: true });
    expect(await ttsToggle.isChecked()).toBe(true);
  });

  test('should adjust auto-hide delay slider', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await highlightMenuToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const delaySlider = popupPage.locator('#highlight-menu-auto-hide-delay');
    await delaySlider.scrollIntoViewIfNeeded();

    // Set to 3 seconds (3000ms)
    await delaySlider.fill('3000');
    expect(await delaySlider.inputValue()).toBe('3000');

    // Verify label updates
    const delayLabel = popupPage.locator('#highlight-menu-delay-label');
    const labelText = await delayLabel.textContent();
    expect(labelText).toContain('3 seconds');

    // Set to 1 second (1000ms)
    await delaySlider.fill('1000');
    expect(await delaySlider.inputValue()).toBe('1000');

    // Verify singular label
    const singularLabel = await delayLabel.textContent();
    expect(singularLabel).toContain('1 second');
  });

  test('should have correct default settings', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await highlightMenuToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    // All buttons should be enabled by default
    expect(await popupPage.locator('#highlight-menu-show-tts').isChecked()).toBe(true);
    expect(await popupPage.locator('#highlight-menu-show-dictionary').isChecked()).toBe(true);
    expect(await popupPage.locator('#highlight-menu-show-translate').isChecked()).toBe(true);
    expect(await popupPage.locator('#highlight-menu-show-search').isChecked()).toBe(true);
    expect(await popupPage.locator('#highlight-menu-show-annotate').isChecked()).toBe(true);
    expect(await popupPage.locator('#highlight-menu-show-copy').isChecked()).toBe(true);

    // Default delay should be 5 seconds (5000ms)
    const delaySlider = popupPage.locator('#highlight-menu-auto-hide-delay');
    expect(await delaySlider.inputValue()).toBe('5000');
  });
});

test.describe('Highlight Menu - Feature Visibility', () => {

  test('should hide options when Highlight Menu disabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();

    // Enable first
    await highlightMenuToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    const optionsContainer = popupPage.locator('#highlight-menu-options-container');
    await expect(optionsContainer).toBeVisible();

    // Disable Highlight Menu
    await highlightMenuToggle.uncheck({ force: true });
    await popupPage.waitForTimeout(300);

    // Verify options are hidden
    await expect(optionsContainer).not.toBeVisible();
  });

  test('should toggle all button options', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await highlightMenuToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    // Test each button toggle
    const buttonToggles = [
      '#highlight-menu-show-tts',
      '#highlight-menu-show-dictionary',
      '#highlight-menu-show-translate',
      '#highlight-menu-show-search',
      '#highlight-menu-show-annotate',
      '#highlight-menu-show-copy',
    ];

    for (const toggleId of buttonToggles) {
      const toggle = popupPage.locator(toggleId);
      await toggle.scrollIntoViewIfNeeded();

      // Verify toggle is visible
      await expect(toggle).toBeVisible();

      // Verify toggle is checked by default
      expect(await toggle.isChecked()).toBe(true);

      // Uncheck toggle
      await toggle.uncheck({ force: true });
      expect(await toggle.isChecked()).toBe(false);

      // Check toggle again
      await toggle.check({ force: true });
      expect(await toggle.isChecked()).toBe(true);
    }
  });
});

test.describe('Highlight Menu - Accessibility', () => {

  test('should have accessible Highlight Menu toggle', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();

    // Verify toggle has label (use first label with text content)
    const label = popupPage.locator('label[for="highlight-menu-enabled"].toggle-label').first();
    await expect(label).toBeVisible();
    const labelText = await label.textContent();
    expect(labelText.length).toBeGreaterThan(0);
  });

  test('should have accessible button toggles', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await highlightMenuToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    // Verify all button toggles have labels
    const buttonToggles = [
      { id: 'highlight-menu-show-tts', label: 'TTS' },
      { id: 'highlight-menu-show-dictionary', label: 'Dictionary' },
      { id: 'highlight-menu-show-translate', label: 'Translate' },
      { id: 'highlight-menu-show-search', label: 'Search' },
      { id: 'highlight-menu-show-annotate', label: 'Annotate' },
      { id: 'highlight-menu-show-copy', label: 'Copy' },
    ];

    for (const button of buttonToggles) {
      const label = popupPage.locator(`label[for="${button.id}"]`);
      await expect(label).toBeVisible();
      const labelText = await label.textContent();
      expect(labelText.toLowerCase()).toContain(button.label.toLowerCase());
    }
  });

  test('should have accessible delay slider', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const highlightMenuToggle = popupPage.locator('#highlight-menu-enabled');
    await highlightMenuToggle.scrollIntoViewIfNeeded();
    await highlightMenuToggle.check({ force: true });
    await popupPage.waitForTimeout(300);

    // Verify slider has label
    const delaySlider = popupPage.locator('#highlight-menu-auto-hide-delay');
    const ariaLabel = await delaySlider.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel.length).toBeGreaterThan(0);

    // Verify slider has min/max attributes
    const min = await delaySlider.getAttribute('min');
    const max = await delaySlider.getAttribute('max');
    expect(parseInt(min)).toBeGreaterThanOrEqual(0);
    expect(parseInt(max)).toBeGreaterThan(0);
  });
});
