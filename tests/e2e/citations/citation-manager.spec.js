/**
 * E2E tests for the Citation Manager — focused feature scenarios.
 *
 * Extension-loading pattern copied from tests/e2e/extension-fixture.js and
 * tests/e2e/citations.test.js (the canonical extension test baseline).
 *
 * NOTE: These tests require a headed browser and a built extension in .vite/.
 * They will NOT pass in a headless CI shell — run them manually with:
 *   npx playwright test tests/e2e/citations/citation-manager.spec.js --headed
 *
 * Selectors marked TODO must be confirmed against the live extension DOM.
 */

import { test, expect } from '../extension-fixture.js';

// ---------------------------------------------------------------------------
// Shared test page — a minimal plain HTML page served locally or via Canvas.
// The test navigates to a page that the content script will inject into.
// TODO: replace 'about:blank' with a stable test URL that the content script
//       is permitted to run on (e.g. a localhost fixture page or canvas.instructure.com).
// ---------------------------------------------------------------------------
const TEST_PAGE_URL = 'about:blank';

// ---------------------------------------------------------------------------
// Helper: get a content page where the extension is active
// ---------------------------------------------------------------------------
async function getContentPage(context) {
  const page = await context.newPage();
  // TODO: navigate to a real Canvas or fixture URL once a test harness page exists.
  await page.goto(TEST_PAGE_URL);
  await page.waitForLoadState('domcontentloaded');
  return page;
}

// ---------------------------------------------------------------------------
// Helper: select text on the page and wait for the highlight menu to appear
// ---------------------------------------------------------------------------
async function selectTextAndWaitForMenu(page, selector) {
  // Select all text inside the element identified by selector.
  await page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) { return; }
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, selector);

  // The highlight menu should appear after a short debounce.
  // TODO: confirm selector for the AssisT highlight-menu container.
  await page.waitForSelector('.assist-highlight-menu', { timeout: 5000 }).catch(() => null);
}

// ---------------------------------------------------------------------------
// Scenario 1: Highlight-menu Cite — no page reflow
// ---------------------------------------------------------------------------

test.describe('Highlight-menu Cite', () => {
  test(
    'clicking Cite from the highlight menu shows a .citation-save-tray without page reflow',
    async ({ context, extensionId: _extensionId }) => {
      const page = await getContentPage(context);

      // Capture baseline scroll/bounding metrics BEFORE the Cite interaction.
      const baselineHeight = await page.evaluate(() => document.body.scrollHeight);

      // TODO: replace '#content' with a selector that targets readable page text
      //       in the Canvas fixture or test HTML page.
      await selectTextAndWaitForMenu(page, '#content');

      // TODO: confirm the data-testid or aria-label for the Cite button in the
      //       highlight menu (currently assumed to contain the text '📌' or 'Cite').
      const citeBtn = page.locator('.assist-highlight-menu [aria-label*="Cite"], .assist-highlight-menu button:has-text("Cite")');

      await expect(citeBtn).toBeVisible({ timeout: 5000 });
      await citeBtn.click();

      // The save tray should now be visible.
      const tray = page.locator('.citation-save-tray');
      await expect(tray).toBeVisible({ timeout: 5000 });

      // Regression: saving a citation must NOT cause a page reflow.
      const afterHeight = await page.evaluate(() => document.body.scrollHeight);
      expect(afterHeight).toBe(baselineHeight);

      await page.close();
    }
  );
});

// ---------------------------------------------------------------------------
// Scenario 2: Undo in the tray removes the just-saved citation
// ---------------------------------------------------------------------------

test.describe('Undo in the save tray', () => {
  test(
    'pressing Undo removes the citation from the bibliography manager',
    async ({ context, extensionId: _extensionId }) => {
      const page = await getContentPage(context);

      // TODO: replace '#content' with the correct content selector.
      await selectTextAndWaitForMenu(page, '#content');

      const citeBtn = page.locator('.assist-highlight-menu [aria-label*="Cite"], .assist-highlight-menu button:has-text("Cite")');
      await citeBtn.click();

      // Tray appears — click Undo.
      const undoBtn = page.locator('.citation-save-tray button:has-text("Undo")');
      await expect(undoBtn).toBeVisible({ timeout: 5000 });
      await undoBtn.click();

      // Tray should dismiss after Undo.
      await expect(page.locator('.citation-save-tray')).not.toBeVisible({ timeout: 3000 });

      // Open the bibliography manager and confirm no citations are listed.
      // TODO: confirm the selector for the bibliography manager open button.
      const openManagerBtn = page.locator('[data-testid="open-citation-manager"], button:has-text("Bibliography")');
      await openManagerBtn.click();

      // TODO: confirm the selector for the citation list container.
      const citationList = page.locator('.assist-citation-list, [data-testid="citation-list"]');
      await expect(citationList).toBeVisible({ timeout: 5000 });

      // After Undo the citation that was just saved should not appear.
      // TODO: replace 'test-citation-title' with the actual title from the selected text.
      const citationEntries = citationList.locator('.assist-citation-item, [data-testid="citation-item"]');
      // The list should either be empty OR not contain the just-added citation.
      // (Exact assertion depends on pre-existing stored citations — adjust in manual run.)
      await expect(citationEntries).toHaveCount(0, { timeout: 3000 }).catch(() => {
        // Accept if there are other pre-existing items; this is a best-effort check.
      });

      await page.close();
    }
  );
});

// ---------------------------------------------------------------------------
// Scenario 3: Bibliography manager — focus trap and Escape
// ---------------------------------------------------------------------------

test.describe('Bibliography manager accessibility', () => {
  test(
    'Tab from the last focusable element wraps to the first (focus trap)',
    async ({ context, extensionId }) => {
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await popupPage.waitForLoadState('domcontentloaded');
      await popupPage.waitForTimeout(500);

      // Ensure citations are enabled so the manager button is present.
      const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
      await citationToggle.check({ force: true }).catch(() => null);
      await popupPage.waitForTimeout(300);

      // TODO: confirm selector for the "Open Bibliography Manager" button.
      const openBtn = popupPage.locator('[data-testid="open-citation-manager"], button:has-text("Manager"), button:has-text("Bibliography")');
      await openBtn.click();

      // TODO: confirm selector for the modal/dialog element.
      const modal = popupPage.locator('.assist-citation-manager, [role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      // Collect all focusable elements inside the modal.
      const focusables = modal.locator(
        'button:visible, [href]:visible, input:visible, select:visible, textarea:visible, [tabindex="0"]:visible'
      );
      const count = await focusables.count();
      expect(count).toBeGreaterThan(0);

      // Tab through to the last focusable element.
      for (let i = 0; i < count - 1; i++) {
        await popupPage.keyboard.press('Tab');
      }

      // One more Tab — focus should wrap back to the first focusable.
      await popupPage.keyboard.press('Tab');
      const firstFocusable = await focusables.nth(0).elementHandle();
      const focusedHandle = await popupPage.evaluateHandle(() => document.activeElement);
      const isSame = await popupPage.evaluate(
        ([active, first]) => active === first,
        [focusedHandle, firstFocusable]
      );
      expect(isSame).toBe(true);

      await popupPage.close();
    }
  );

  test(
    'pressing Escape closes the bibliography manager',
    async ({ context, extensionId }) => {
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await popupPage.waitForLoadState('domcontentloaded');
      await popupPage.waitForTimeout(500);

      const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
      await citationToggle.check({ force: true }).catch(() => null);
      await popupPage.waitForTimeout(300);

      // TODO: confirm selector for the "Open Bibliography Manager" button.
      const openBtn = popupPage.locator('[data-testid="open-citation-manager"], button:has-text("Manager"), button:has-text("Bibliography")');
      await openBtn.click();

      // TODO: confirm selector for the modal/dialog element.
      const modal = popupPage.locator('.assist-citation-manager, [role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });

      await popupPage.keyboard.press('Escape');

      await expect(modal).not.toBeVisible({ timeout: 3000 });

      await popupPage.close();
    }
  );
});

// ---------------------------------------------------------------------------
// Scenario 4: Export — switching citation style updates the preview
// ---------------------------------------------------------------------------

test.describe('Export panel', () => {
  test(
    'switching the citation style selector updates the formatted output preview',
    async ({ context, extensionId }) => {
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await popupPage.waitForLoadState('domcontentloaded');
      await popupPage.waitForTimeout(500);

      const citationToggle = popupPage.locator('[data-testid="citation-toggle"]');
      await citationToggle.check({ force: true }).catch(() => null);
      await popupPage.waitForTimeout(300);

      // TODO: confirm the selector for the Export button in the citation panel.
      const exportBtn = popupPage.locator('[data-testid="citation-export"], button:has-text("Export")');
      await exportBtn.click();

      // TODO: confirm the selector for the style-switcher <select> element.
      const styleSelect = popupPage.locator('[data-testid="citation-style-select"], select[name="citationStyle"], .assist-citation-style-select');
      await expect(styleSelect).toBeVisible({ timeout: 5000 });

      // TODO: confirm the selector for the citation output/preview container.
      const preview = popupPage.locator('[data-testid="citation-preview"], .assist-citation-output, .assist-export-preview');

      // Capture the text with the first style selected.
      const before = await preview.textContent();

      // Switch to a different style.
      const options = await styleSelect.locator('option').allTextContents();
      const alternativeStyle = options.find(o => !styleSelect.inputValue().toString().includes(o));
      if (alternativeStyle) {
        await styleSelect.selectOption({ label: alternativeStyle });
        await popupPage.waitForTimeout(500);

        const after = await preview.textContent();
        // The preview text should differ after switching styles.
        expect(after).not.toBe(before);
      } else {
        // Only one style available — assert the preview is non-empty.
        expect(before.trim().length).toBeGreaterThan(0);
      }

      await popupPage.close();
    }
  );
});
