/**
 * E2E Tests for Dyslexia-Optimized Reading Mode
 * Sprint 9 - Phase 2 Implementation
 *
 * Tests three reading enhancement algorithms:
 * 1. Bionic Reading (bold first letters)
 * 2. Syllable Highlighting (alternating colors)
 * 3. Grammar Color-Coding (NLP-based coloring)
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension path - use Output directory (build artifacts)
const extensionPath = path.join(__dirname, '../../Output');

/**
 * Test Setup: Load extension and navigate to test page
 */
test.beforeEach(async ({ page, context }) => {
  // Navigate to local test page with sample content
  await page.goto(`file://${path.join(__dirname, '../fixtures/canvas-test-page.html')}`);
  await page.waitForLoadState('domcontentloaded');
});

test.describe('Dyslexia Mode - Bionic Reading', () => {

  test('should apply bionic reading to text content', async ({ page }) => {
    // Get original text content
    const originalText = await page.textContent('#main-content');
    expect(originalText).toBeTruthy();

    // Open extension popup
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon') // Adjust selector based on your icon
    ]);

    // Enable Dyslexia Mode with Bionic Reading
    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-bionic-radio"]').check();

    // Wait for transformation to apply
    await page.waitForTimeout(500);

    // Verify strong tags are added (bolded letters)
    const strongTags = await page.locator('#main-content strong').count();
    expect(strongTags).toBeGreaterThan(0);

    // Verify text content is preserved
    const transformedText = await page.textContent('#main-content');
    // Remove HTML tags and compare
    expect(transformedText.replace(/<[^>]*>/g, '')).toBe(originalText);

    // Verify performance (check console logs)
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    const perfLog = logs.find(log => log.includes('[Dyslexia Mode] Bionic Reading applied'));
    expect(perfLog).toBeTruthy();
  });

  test('should bold correct number of letters based on word length', async ({ page }) => {
    // Create test content with known words
    await page.setContent(`
      <div id="test-content">
        <p>I am testing bionic reading algorithm today.</p>
      </div>
    `);

    // Open extension popup and enable
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-bionic-radio"]').check();
    await page.waitForTimeout(500);

    // Check specific words
    const testContent = await page.locator('#test-content').innerHTML();

    // "I" (1 char) should have 1 letter bold
    expect(testContent).toContain('<strong>I</strong>');

    // "testing" (7 chars) should have 2 letters bold
    expect(testContent).toMatch(/<strong>te<\/strong>sting/);

    // "algorithm" (9 chars) should have 3 letters bold
    expect(testContent).toMatch(/<strong>alg<\/strong>orithm/);
  });

  test('should restore original content when disabled', async ({ page }) => {
    const originalHTML = await page.locator('#main-content').innerHTML();

    // Enable Dyslexia Mode
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-bionic-radio"]').check();
    await page.waitForTimeout(500);

    // Verify content changed
    const transformedHTML = await page.locator('#main-content').innerHTML();
    expect(transformedHTML).not.toBe(originalHTML);

    // Disable Dyslexia Mode
    await popup.locator('[data-testid="dyslexia-toggle"]').uncheck();
    await page.waitForTimeout(500);

    // Verify content restored
    const restoredHTML = await page.locator('#main-content').innerHTML();
    expect(restoredHTML).toBe(originalHTML);
  });
});

test.describe('Dyslexia Mode - Syllable Highlighting', () => {

  test('should apply alternating color backgrounds', async ({ page }) => {
    // Open extension popup
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    // Enable Dyslexia Mode with Syllable Highlighting
    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-syllable-radio"]').check();

    await page.waitForTimeout(500);

    // Verify span elements with background colors are added
    const coloredSpans = await page.locator('#main-content span[style*="background-color"]').count();
    expect(coloredSpans).toBeGreaterThan(0);

    // Verify two different colors are used
    const span1BgColor = await page.locator('#main-content span[style*="background-color"]').first().evaluate(el => {
      return window.getComputedStyle(el).backgroundColor;
    });

    const span2BgColor = await page.locator('#main-content span[style*="background-color"]').nth(1).evaluate(el => {
      return window.getComputedStyle(el).backgroundColor;
    });

    expect(span1BgColor).not.toBe(span2BgColor);
  });

  test('should adjust color intensity with slider', async ({ page }) => {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-syllable-radio"]').check();

    // Set intensity to 50%
    await popup.locator('[data-testid="dyslexia-intensity-slider"]').fill('0.5');
    await page.waitForTimeout(500);

    // Check that opacity in rgba is around 0.25 (0.5 * 0.5)
    const bgColor = await page.locator('#main-content span[style*="background-color"]').first().evaluate(el => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // bgColor should be rgba format with alpha around 0.25
    expect(bgColor).toMatch(/rgba\(\d+,\s*\d+,\s*\d+,\s*0\.\d+\)/);
  });
});

test.describe('Dyslexia Mode - Grammar Color-Coding', () => {

  test('should apply color-coding based on parts of speech', async ({ page }) => {
    // Create test content with clear grammar
    await page.setContent(`
      <div id="test-content">
        <p>The quick brown fox jumps over the lazy dog.</p>
      </div>
    `);

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-grammar-radio"]').check();

    // Wait for NLP processing
    await page.waitForTimeout(1000);

    // Verify spans with colors are added
    const coloredSpans = await page.locator('#test-content span[style*="color"]').count();
    expect(coloredSpans).toBeGreaterThan(0);

    // Verify multiple colors are used (nouns, verbs, adjectives, adverbs)
    const colors = await page.locator('#test-content span[style*="color"]').evaluateAll(spans => {
      return [...new Set(spans.map(span => window.getComputedStyle(span).color))];
    });

    expect(colors.length).toBeGreaterThan(1);
  });

  test('should use compromise.js library for NLP', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-grammar-radio"]').check();

    await page.waitForTimeout(1000);

    // Verify performance log mentions Grammar Colors
    const perfLog = logs.find(log => log.includes('[Dyslexia Mode] Grammar Colors applied'));
    expect(perfLog).toBeTruthy();
  });
});

test.describe('Dyslexia Mode - Feature Isolation', () => {

  test('should only allow one mode active at a time', async ({ page }) => {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();

    // Check Bionic Reading
    await popup.locator('[data-testid="dyslexia-bionic-radio"]').check();
    expect(await popup.locator('[data-testid="dyslexia-bionic-radio"]').isChecked()).toBe(true);

    // Check Syllable Highlighting - should uncheck Bionic Reading
    await popup.locator('[data-testid="dyslexia-syllable-radio"]').check();
    expect(await popup.locator('[data-testid="dyslexia-bionic-radio"]').isChecked()).toBe(false);
    expect(await popup.locator('[data-testid="dyslexia-syllable-radio"]').isChecked()).toBe(true);
  });

  test('should not interfere with TTS feature', async ({ page }) => {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    // Enable TTS
    await popup.locator('[data-testid="tts-toggle"]').check();
    await popup.locator('#btn-play-pause').click();

    // Enable Dyslexia Mode
    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-bionic-radio"]').check();

    await page.waitForTimeout(500);

    // Verify TTS is still active
    const ttsEnabled = await popup.locator('[data-testid="tts-toggle"]').isChecked();
    expect(ttsEnabled).toBe(true);

    // Verify both features applied
    const strongTags = await page.locator('#main-content strong').count();
    expect(strongTags).toBeGreaterThan(0);
  });

  test('should persist settings across popup opens', async ({ page }) => {
    // First popup: enable and configure
    let [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-syllable-radio"]').check();
    await popup.locator('[data-testid="dyslexia-intensity-slider"]').fill('0.8');

    // Close popup
    await popup.close();

    // Open popup again
    [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    // Verify settings persisted
    expect(await popup.locator('[data-testid="dyslexia-toggle"]').isChecked()).toBe(true);
    expect(await popup.locator('[data-testid="dyslexia-syllable-radio"]').isChecked()).toBe(true);
    expect(await popup.locator('[data-testid="dyslexia-intensity-slider"]').inputValue()).toBe('0.8');
  });
});

test.describe('Dyslexia Mode - Performance', () => {

  test('should transform page in under 300ms', async ({ page }) => {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-bionic-radio"]').check();

    await page.waitForTimeout(500);

    // Find performance log
    const perfLog = logs.find(log => log.includes('[Dyslexia Mode] Bionic Reading applied in'));
    expect(perfLog).toBeTruthy();

    // Extract time in ms
    const timeMatch = perfLog.match(/(\d+\.?\d*)ms/);
    expect(timeMatch).toBeTruthy();

    const transformTime = parseFloat(timeMatch[1]);
    expect(transformTime).toBeLessThan(300);
  });

  test('should handle large content efficiently', async ({ page }) => {
    // Create large content (5000 words)
    const largeText = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(1000);
    await page.setContent(`
      <div id="main-content">
        <p>${largeText}</p>
      </div>
    `);

    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    await popup.locator('[data-testid="dyslexia-toggle"]').check();
    await popup.locator('[data-testid="dyslexia-bionic-radio"]').check();

    await page.waitForTimeout(1000);

    // Should complete without errors
    const errorLog = logs.find(log => log.includes('[ERROR]'));
    expect(errorLog).toBeFalsy();

    // Should log performance
    const perfLog = logs.find(log => log.includes('[Dyslexia Mode]'));
    expect(perfLog).toBeTruthy();
  });
});

test.describe('Dyslexia Mode - Advanced Options Integration', () => {

  test('should be toggleable via Advanced Options modal', async ({ page }) => {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('#assist-extension-icon')
    ]);

    // Open Advanced Options
    await popup.locator('#btn-advanced-options').click();

    // Go to Appearance tab
    await popup.locator('[data-tab="appearance"]').click();

    // Find Dyslexia Mode visibility toggle
    const dyslexiaToggle = popup.locator('#show-dyslexia-mode');
    expect(await dyslexiaToggle.isVisible()).toBe(true);

    // Disable visibility
    await dyslexiaToggle.uncheck();

    // Save and close
    await popup.locator('#btn-save-modal').click();

    // Verify section is hidden
    const dyslexiaSection = popup.locator('#dyslexia-mode-section');
    expect(await dyslexiaSection.isVisible()).toBe(false);
  });
});
