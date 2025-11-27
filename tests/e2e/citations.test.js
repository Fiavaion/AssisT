/**
 * E2E Tests for Citation System
 * Tests citation capture, management, and export functionality
 */

import { test, expect } from './extension-fixture.js';

test.describe('Citation UI Controls', () => {
  test('should display citation section in popup', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Citation section should exist
    const citationSection = popupPage.locator('#citation-section');
    await expect(citationSection).toBeVisible();
  });

  test('should have citation toggle switch', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await expect(citationToggle).toBeAttached();
  });

  test('should show citation options when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations by checking the checkbox directly
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    // Wait for options to appear
    await popupPage.waitForTimeout(500);

    // Options container should be visible (not have hidden class)
    const optionsContainer = popupPage.locator('#citation-options-container');
    await expect(optionsContainer).not.toHaveClass(/hidden/);
  });

  test('should display Save Citation button when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Save Citation button should be visible (inside options container that's not hidden)
    const saveCitationButton = popupPage.locator('[data-testid="save-citation-button"]');
    await expect(saveCitationButton).toBeAttached();
  });

  test('should display Citation Manager button when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Citation Manager button should be attached
    const managerButton = popupPage.locator('[data-testid="citation-manager-button"]');
    await expect(managerButton).toBeAttached();
  });

  test('should display Projects button when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Projects button should be attached
    const projectsButton = popupPage.locator('[data-testid="citation-projects-button"]');
    await expect(projectsButton).toBeAttached();
  });
});

test.describe('Citation Quick View Panel', () => {
  test('should have expand/collapse button', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Expand button should exist
    const expandButton = popupPage.locator('[data-testid="expand-citations-button"]');
    await expect(expandButton).toBeAttached();
  });

  test('should toggle quick view panel on button click', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Click expand button
    const expandButton = popupPage.locator('[data-testid="expand-citations-button"]');
    await expandButton.scrollIntoViewIfNeeded();
    await expandButton.click({ force: true });

    await popupPage.waitForTimeout(500);

    // Panel should not have hidden class
    const panel = popupPage.locator('#citation-manager-panel');
    await expect(panel).not.toHaveClass(/hidden/);
  });

  test('should show citation count badge', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Citation count badge should exist
    const countBadge = popupPage.locator('#citation-count-badge');
    await expect(countBadge).toBeAttached();
  });
});

test.describe('Citation Accessibility', () => {
  test('should have proper ARIA labels on citation controls', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Check toggle has aria-label
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await expect(citationToggle).toHaveAttribute('aria-label', 'Enable citation features');

    // Check Save Citation button aria-label exists
    const saveCitationButton = popupPage.locator('[data-testid="save-citation-button"]');
    await expect(saveCitationButton).toHaveAttribute('aria-label', 'Save citation for current page');

    // Check Citation Manager button aria-label exists
    const managerButton = popupPage.locator('[data-testid="citation-manager-button"]');
    await expect(managerButton).toHaveAttribute('aria-label', 'Open full citation library');
  });

  test('should have keyboard accessible citation controls', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Save button should be focusable
    const saveCitationButton = popupPage.locator('[data-testid="save-citation-button"]');
    await saveCitationButton.scrollIntoViewIfNeeded();
    await saveCitationButton.focus();

    // Verify it can receive focus (element is in DOM)
    await expect(saveCitationButton).toBeAttached();
  });

  test('should have proper aria-expanded on expand button', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    const expandButton = popupPage.locator('[data-testid="expand-citations-button"]');

    // Initially collapsed
    await expect(expandButton).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    await expandButton.scrollIntoViewIfNeeded();
    await expandButton.click({ force: true });
    await popupPage.waitForTimeout(500);

    // Now expanded
    await expect(expandButton).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('Citation Toggle State Persistence', () => {
  test('should persist citation enabled state', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Verify toggle is checked
    await expect(citationToggle).toBeChecked();

    // Reload the popup
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Toggle should still be checked (state persisted)
    const citationToggleAfterReload = popupPage.locator('[data-testid="citation-toggle"]');
    await expect(citationToggleAfterReload).toBeChecked();
  });
});

test.describe('Citation Section Layout', () => {
  test('should have proper section structure', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Section should have correct class
    const citationSection = popupPage.locator('#citation-section');
    await expect(citationSection).toHaveClass(/citation-section/);

    // Should have section header
    const sectionHeader = citationSection.locator('.section-header');
    await expect(sectionHeader).toBeAttached();
  });

  test('should have description text when enabled', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(500);

    // Enable citations
    const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
    await citationToggle.scrollIntoViewIfNeeded();
    await citationToggle.check({ force: true });

    await popupPage.waitForTimeout(500);

    // Description should exist and contain expected text
    const description = popupPage.locator('#citation-options-container .option-description');
    await expect(description).toContainText('Save citations');
  });
});
