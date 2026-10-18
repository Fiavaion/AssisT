/**
 * E2E Tests for Annotations & Sticky Notes Feature
 *
 * Tests the complete annotation system, driven against the real built extension in real
 * Chrome, on a fixture served at an instructure.com URL so the manifest injects the content
 * script the same way it does on a live Canvas page (see tests/e2e/release-pass-page-tools.spec.js
 * and tests/e2e/sweep/ for the same technique):
 * 1. Sticky note creation, customization, and persistence
 * 2. Inline annotation creation from text selection
 * 3. Annotation sidebar functionality
 * 4. Accessibility compliance
 * 5. Storage persistence across a reload
 *
 * WHERE POSSIBLE, every test drives the real interface a student uses: selecting text and
 * using the highlight menu's "Add Annotation" dialog, or the Alt+N sticky-note shortcut.
 * `window.assistFeatures.*` — the object the content script's own modules register on
 * themselves — is NOT reachable from `page.evaluate`: the content script declares no `world`
 * in manifest.json, so it runs in the isolated world, and that global lives on the isolated
 * world's `window`. `page.evaluate` runs in the page's main world, where it does not exist.
 * The two places a test genuinely cannot reach the same effect through the real UI in this
 * harness (an exact sticky-note position off screen, and opening the sidebar without a real
 * popup click, which would resolve to the wrong tab — see sendToContentScript below) go
 * through the extension's own message path from an extension page instead, the way
 * tests/e2e/reading-mode.test.js:97-126 does for Reading Mode.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';

const LMS_ORIGIN = 'https://annotations-spec.instructure.com';
const PAGE_URL_PART = 'annotations-test';
const PAGE_URL = `${LMS_ORIGIN}/courses/1/pages/${PAGE_URL_PART}`;

/**
 * A plain content page: a heading, two paragraphs with enough text to make a selection
 * meaningful, and a tall filler area so a note placed low on the page needs a scroll to
 * reach. Deliberately carries no other focusable element ahead of the paragraphs, so a
 * keyboard Tab from a fresh page lands on the first thing AssisT adds, not on page chrome.
 */
const ARTICLE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Annotations test page</title></head>
<body>
<h1 id="heading">Test Page for Annotations</h1>
<p id="para1">This is the first paragraph with some text content that we can annotate.
It has enough text to make selection meaningful.</p>
<p id="para2">This is the second paragraph with different content.
We can test multiple annotations on the same page.</p>
<div id="content-area" style="min-height: 1000px; padding: 20px;">
<p>Additional content area for testing scroll and positioning.</p>
</div>
</body></html>`;

/** Serve the fixture for the whole LMS origin, so the manifest's instructure.com match injects. */
async function routeLms(context) {
  await context.route(`${LMS_ORIGIN}/**`, route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE_HTML })
  );
}

/**
 * Write settings the way the popup does — nested feature keys under `assist_settings` — from
 * an extension page, which is the only realm with chrome.storage.
 */
async function store(context, extensionId, features) {
  const page = await openReadyPopup(context, extensionId);
  await page.evaluate(
    features =>
      new Promise(resolve => {
        chrome.storage.local.get('assist_settings', stored => {
          const settings = stored.assist_settings || {};
          for (const [key, patch] of Object.entries(features)) {
            settings[key] = { ...settings[key], ...patch };
          }
          chrome.storage.local.set({ assist_settings: settings }, () => resolve());
        });
      }),
    features
  );
  await page.close();
}

/**
 * Send a message to the content script running on the fixture tab, exactly the way the
 * popup's own "Create Note" and "View Annotations" buttons do (src/popup/popup.js:9865-9906):
 * `chrome.tabs.sendMessage(tab.id, message)` from an extension page.
 *
 * Used ONLY where the real UI cannot be driven to the same effect in this harness:
 * - A real popup resolves its target tab from `chrome.tabs.query({active: true,
 *   currentWindow: true})`. A popup opened as an ordinary Playwright tab (there is no way to
 *   open a real toolbar popup under Playwright) IS itself the active tab at that moment, so
 *   that query would return the popup, not the fixture page — the same constraint
 *   tests/e2e/reading-mode.test.js:97-101 documents for Reading Mode. `chrome.tabs.query({})`
 *   plus a URL match sidesteps it, the way that file's `toggleFromPopupPath` does.
 * - Placing a sticky note at a specific off-screen position (for the sidebar scroll test):
 *   the only real-UI route to a note, the Alt+N shortcut, always centers it.
 *
 * @returns {Promise<Object>} The content script's reply.
 */
async function sendToContentScript(context, extensionId, message) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  const reply = await page.evaluate(
    ({ urlPart, message }) =>
      new Promise(resolve => {
        chrome.tabs.query({}, tabs => {
          const target = tabs.find(tab => tab.url && tab.url.includes(urlPart));
          if (!target) {
            resolve({ success: false, error: 'fixture tab not found' });
            return;
          }
          chrome.tabs.sendMessage(target.id, message, response =>
            resolve(response || { success: false, error: chrome.runtime.lastError?.message })
          );
        });
      }),
    { urlPart: PAGE_URL_PART, message }
  );
  await page.close();
  return reply;
}

/**
 * Open the fixture and wait until the content script has finished evaluating. The annotation
 * sidebar mounts unconditionally at import time, so its presence is the signal the bundle ran
 * (sticky-note.js, inline-annotations.js and annotation-sidebar.js are all self-initializing
 * and are all imported unconditionally by content-simple.js).
 */
async function openLmsPage(context, url = PAGE_URL) {
  const page = await context.newPage();
  await page.goto(url);
  await page.waitForSelector('#assist-annotation-sidebar', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(500);
  return page;
}

/** Reload and wait for the content script to have re-run, the same way openLmsPage does. */
async function reloadLmsPage(page) {
  await page.reload();
  await page.waitForSelector('#assist-annotation-sidebar', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(500);
}

/**
 * Create an inline annotation the way a student does: select text, open the highlight menu
 * (a document-level mouseup listener shows it — see the technique in
 * release-pass-page-tools.spec.js's Speed Read test), choose "Add Annotation", fill the
 * comment and colour in the real dialog, and Save. No privileged global is touched.
 *
 * The triple-click is deliberate and is real student behaviour: it is how people select a
 * paragraph. Chrome ends that selection at the START of the NEXT block — endContainer is the
 * following `<p>`, endOffset 0 (measured: `{sc:'#text', so:0, ec:'P', eo:0}`) — and
 * `resolveBoundary` in src/features/annotations/annotation-range.js:206 cannot resolve that
 * boundary, so the highlight is never drawn and the record is stored unanchored. Every test that
 * goes through this helper therefore fails until that is fixed; do NOT swap the selection method
 * to make them green, because the defect is the thing worth knowing about.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} textLocator - Element whose text to select.
 * @param {string} comment - Comment to type into the dialog.
 * @param {string} [color='yellow'] - Colour to pick; yellow is the dialog's own default.
 */
async function createAnnotationViaUI(page, textLocator, comment, color = 'yellow') {
  await textLocator.click({ clickCount: 3 });

  const menuButton = page.locator('#assist-highlight-menu button[aria-label="Add Annotation"]');
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const modal = page.locator('.assist-annotation-modal-overlay');
  await expect(modal).toBeVisible();

  await page.locator('#annotation-comment').fill(comment);
  if (color !== 'yellow') {
    await page.locator(`.assist-annotation-color-option[data-color="${color}"]`).click();
  }

  await page.locator('.assist-annotation-btn-save').click();
  await expect(modal).not.toBeVisible();
}

test.beforeEach(() => {
  // A real profile, a real page and a settled content script: the 30s project default is not
  // enough for any of these.
  test.setTimeout(120000);
});

// ============================================================
// STICKY NOTES TESTS
// ============================================================

test.describe('Annotations - Sticky Notes', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await store(context, extensionId, { annotations: { enabled: true } });
    await routeLms(context);
  });

  test('should create sticky note at center position', async ({ context }) => {
    const page = await openLmsPage(context);

    // Alt+N is the real shortcut src/features/annotations/sticky-note.js:1263-1286 registers,
    // and it always centers the note — which is what this test's own name promises (the old
    // body instead asserted a hardcoded 200,200, which was never actually the centered case).
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();

    const expected = await page.evaluate(() => ({
      left: `${window.innerWidth / 2 - 100}px`,
      top: `${window.innerHeight / 2 - 100}px`,
    }));
    const position = await note.evaluate(el => ({ left: el.style.left, top: el.style.top }));
    expect(position).toEqual(expected);
  });

  test('should drag sticky note to new position', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();
    const header = note.locator('.assist-sticky-note-header');
    const initialPos = await note.boundingBox();

    // The drag is delta-based (src/features/annotations/sticky-note.js:936-950: the new position
    // is initialLeft + (clientX - startX)), so the move has to be measured from where the mouse
    // actually grabbed the header — its centre — not from the note's top-left corner. Moving to
    // `initialPos.x + 100` landed almost exactly back on the grab point, so the note travelled
    // 0px horizontally and the test read as a broken drag.
    const grip = await header.boundingBox();
    const grabX = grip.x + grip.width / 2;
    const grabY = grip.y + grip.height / 2;

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 100, grabY + 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const newPos = await note.boundingBox();
    expect(newPos.x).toBeGreaterThan(initialPos.x);
    expect(newPos.y).toBeGreaterThan(initialPos.y);
  });

  test('should change sticky note color', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();

    const initialBg = await note.evaluate(el => el.style.backgroundColor);
    expect(initialBg).toContain('254, 243, 199'); // Yellow

    const colorBtn = note.locator('.assist-sticky-note-color-btn');
    await colorBtn.click();

    const bluePicker = page.locator('.assist-color-option[data-color="blue"]');
    await expect(bluePicker).toBeVisible();
    await bluePicker.click();
    await page.waitForTimeout(300);

    const newBg = await note.evaluate(el => el.style.backgroundColor);
    expect(newBg).toContain('219, 234, 254'); // Blue
  });

  test('should resize sticky note', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();
    const resizeHandle = note.locator('.assist-sticky-note-resize-handle');

    const initialSize = await note.evaluate(el => ({
      width: parseInt(el.style.width),
      height: parseInt(el.style.height),
    }));

    // Resizing is delta-based too (sticky-note.js:1040-1051), so the drag is measured from the
    // handle itself. The old absolute target (300, 350) sat up and to the LEFT of the handle on a
    // centred note, so it shrank the note to its 150px floor and read as a broken resize.
    const grip = await resizeHandle.boundingBox();
    const grabX = grip.x + grip.width / 2;
    const grabY = grip.y + grip.height / 2;

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 100, grabY + 100, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const newSize = await note.evaluate(el => ({
      width: parseInt(el.style.width),
      height: parseInt(el.style.height),
    }));

    expect(newSize.width).toBeGreaterThan(initialSize.width);
    expect(newSize.height).toBeGreaterThan(initialSize.height);
  });

  test('should delete sticky note', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();

    const deleteBtn = note.locator('.assist-sticky-note-delete');
    await deleteBtn.click();

    await expect(note).not.toBeVisible();
  });

  test('should persist sticky note content on blur', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();
    const content = note.locator('.assist-sticky-note-content');

    await content.click();
    await content.fill('This is my note content');
    await page.locator('#heading').click();
    await page.waitForTimeout(300);

    const savedContent = await content.textContent();
    expect(savedContent).toBe('This is my note content');
  });

  test('should add and display tags on sticky note', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();
    const tagsContainer = note.locator('.assist-sticky-note-tags');

    await tagsContainer.click();
    const tagModal = page.locator('.assist-tag-edit-modal-overlay');
    await expect(tagModal).toBeVisible();

    const tagInput = page.locator('#tag-input-container input');
    await tagInput.fill('important');
    await tagInput.press('Enter');
    await tagInput.fill('work');
    await tagInput.press('Enter');

    const saveBtn = page.locator('.assist-tag-edit-btn-save');
    await saveBtn.click();
    await page.waitForTimeout(300);

    const tagPills = tagsContainer.locator('.assist-tag-pill');
    expect(await tagPills.count()).toBe(2);
  });
});

// ============================================================
// INLINE ANNOTATIONS TESTS
// ============================================================

test.describe('Annotations - Inline Annotations', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await store(context, extensionId, { annotations: { enabled: true } });
    await routeLms(context);
  });

  test('should create annotation from text selection', async ({ context }) => {
    const page = await openLmsPage(context);
    await createAnnotationViaUI(
      page,
      page.locator('#para1'),
      'This is an important annotation',
      'yellow'
    );

    const highlight = page.locator('.assist-inline-annotation').first();
    await expect(highlight).toBeVisible();
    expect(await highlight.getAttribute('data-annotation-id')).toBeTruthy();
  });

  test('should show tooltip on annotation hover', async ({ context }) => {
    const page = await openLmsPage(context);
    await createAnnotationViaUI(page, page.locator('#para1'), 'Hover to see this comment', 'blue');

    const highlight = page.locator('.assist-inline-annotation').first();
    await expect(highlight).toBeVisible();

    await highlight.hover();
    const tooltip = page.locator('.assist-annotation-tooltip');
    await expect(tooltip).toBeVisible();

    // The tooltip now also carries the Alt+click/Delete hint under the comment (see report), so
    // the comment itself is asserted from its own child rather than the tooltip's whole text.
    const commentText = await tooltip.locator('.assist-annotation-tooltip-comment').textContent();
    expect(commentText).toBe('Hover to see this comment');
  });

  test('should open edit modal on annotation click', async ({ context }) => {
    const page = await openLmsPage(context);
    await createAnnotationViaUI(page, page.locator('#para1'), 'Click to edit', 'yellow');

    const highlight = page.locator('.assist-inline-annotation').first();
    await highlight.click();

    const modal = page.locator('.assist-annotation-modal-overlay');
    await expect(modal).toBeVisible();

    const modalTitle = page.locator('#annotation-modal-title');
    expect(await modalTitle.textContent()).toBe('Edit Annotation');

    const textarea = page.locator('#annotation-comment');
    expect(await textarea.inputValue()).toBe('Click to edit');
  });

  test('should edit annotation comment and color', async ({ context }) => {
    const page = await openLmsPage(context);
    await createAnnotationViaUI(page, page.locator('#para1'), 'Original comment', 'yellow');

    const highlight = page.locator('.assist-inline-annotation').first();
    await highlight.click();

    const textarea = page.locator('#annotation-comment');
    await textarea.fill('Updated comment text');

    const greenColor = page.locator('.assist-annotation-color-option[data-color="green"]');
    await greenColor.click();

    const saveBtn = page.locator('.assist-annotation-btn-save');
    await saveBtn.click();
    await page.waitForTimeout(300);

    // The palette moved from the old fixed swatches to a page-contrast-aware theme (see report):
    // on this plain black-on-white fixture the light palette's green underline is #15803d.
    const borderColor = await highlight.evaluate(el => el.style.borderBottom);
    expect(borderColor).toContain('21, 128, 61'); // Green (#15803d)
  });

  test('should delete annotation from edit modal', async ({ context }) => {
    const page = await openLmsPage(context);
    await createAnnotationViaUI(page, page.locator('#para1'), 'Annotation to delete', 'yellow');

    const highlight = page.locator('.assist-inline-annotation').first();
    await expect(highlight).toBeVisible();

    await highlight.click();
    const modal = page.locator('.assist-annotation-modal-overlay');
    await expect(modal).toBeVisible();

    // The delete flow no longer opens a native confirm() dialog (see report): the button arms
    // itself on the first press and only deletes on the second.
    const deleteBtn = page.locator('.assist-annotation-btn-delete');
    await deleteBtn.click();
    await expect(deleteBtn).toHaveText('Confirm delete');
    await deleteBtn.click();

    await expect(modal).not.toBeVisible();
    await expect(page.locator('.assist-inline-annotation')).toHaveCount(0);
  });
});

// ============================================================
// SIDEBAR TESTS
// ============================================================

test.describe('Annotations - Sidebar', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await store(context, extensionId, { annotations: { enabled: true } });
    await routeLms(context);
  });

  test('should open and close sidebar', async ({ context, extensionId }) => {
    const page = await openLmsPage(context);

    await sendToContentScript(context, extensionId, { type: 'toggleAnnotationSidebar' });
    await page.waitForTimeout(500);

    const sidebar = page.locator('#assist-annotation-sidebar');
    await expect(sidebar).toBeVisible();
    // The panel is opened with `transform = 'translateX(0)'` (annotation-sidebar.js:373); Chrome
    // normalises a unitless zero length to `0px` when the inline style is read back.
    expect(await sidebar.evaluate(el => el.style.transform)).toBe('translateX(0px)');

    // Closing is real UI: clicking the panel's own button.
    const closeBtn = sidebar.locator('#sidebar-close-btn');
    await closeBtn.click();
    await page.waitForTimeout(500);

    expect(await sidebar.evaluate(el => el.style.transform)).toBe('translateX(100%)');
  });

  test('should display annotations in sidebar', async ({ context, extensionId }) => {
    const page = await openLmsPage(context);

    await page.keyboard.press('Alt+N');
    await expect(page.locator('.assist-sticky-note')).toBeVisible();

    await createAnnotationViaUI(page, page.locator('#para1'), 'Sidebar test annotation', 'yellow');

    await sendToContentScript(context, extensionId, { type: 'toggleAnnotationSidebar' });
    await page.waitForTimeout(500);

    const sidebar = page.locator('#assist-annotation-sidebar');
    const items = sidebar.locator('.assist-sidebar-item');
    expect(await items.count()).toBe(2);

    const count = sidebar.locator('#sidebar-count');
    expect(await count.textContent()).toBe('2');
  });

  test('should show empty state when no annotations', async ({ context, extensionId }) => {
    const page = await openLmsPage(context);

    await sendToContentScript(context, extensionId, { type: 'toggleAnnotationSidebar' });
    await page.waitForTimeout(500);

    const sidebar = page.locator('#assist-annotation-sidebar');
    const emptyState = sidebar.locator('.assist-sidebar-empty');
    await expect(emptyState).toBeVisible();

    // The panel currently says "No annotations match filters" here: openSidebar always renders
    // through applyFilters() (annotation-sidebar.js:368 → 730 → 926), so the filtered branch's
    // copy at annotation-sidebar.js:938 is what a student with no annotations and no filters set
    // is shown, and the correct copy at annotation-sidebar.js:1288 is unreachable on open. The
    // assertion stays on the right words on purpose.
    const emptyText = sidebar.locator('.assist-sidebar-empty-text');
    expect(await emptyText.textContent()).toBe('No annotations on this page');
  });

  test('should scroll to annotation when clicked in sidebar', async ({ context, extensionId }) => {
    const page = await openLmsPage(context);

    // The only real UI for placing a note (Alt+N) always centers it; scrolling to a note needs
    // one genuinely off screen, so this one goes through the same message path the popup's own
    // "Create Note" button uses (see sendToContentScript above).
    await sendToContentScript(context, extensionId, {
      action: 'createStickyNote',
      x: 200,
      y: 800,
      content: 'Scroll target note',
    });
    await expect(page.locator('.assist-sticky-note')).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await sendToContentScript(context, extensionId, { type: 'toggleAnnotationSidebar' });
    await page.waitForTimeout(500);

    const sidebar = page.locator('#assist-annotation-sidebar');
    const item = sidebar.locator('.assist-sidebar-item').first();
    await item.click();
    await page.waitForTimeout(800);

    const note = page.locator('.assist-sticky-note');
    expect(await note.isVisible()).toBe(true);
  });

  test('should close sidebar with Escape key', async ({ context, extensionId }) => {
    const page = await openLmsPage(context);

    await sendToContentScript(context, extensionId, { type: 'toggleAnnotationSidebar' });
    await page.waitForTimeout(500);

    const sidebar = page.locator('#assist-annotation-sidebar');
    await expect(sidebar).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    expect(await sidebar.evaluate(el => el.style.transform)).toBe('translateX(100%)');
  });
});

// ============================================================
// ACCESSIBILITY TESTS
// ============================================================

test.describe('Annotations - Accessibility', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await store(context, extensionId, { annotations: { enabled: true } });
    await routeLms(context);
  });

  test('sticky note should have proper ARIA attributes', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();

    expect(await note.getAttribute('role')).toBe('article');
    expect(await note.getAttribute('aria-label')).toBe('Sticky note');
    expect(await note.getAttribute('tabindex')).toBe('0');

    const content = note.locator('.assist-sticky-note-content');
    expect(await content.getAttribute('role')).toBe('textbox');
    expect(await content.getAttribute('aria-label')).toBe('Note content');
  });

  test('inline annotation should be keyboard accessible', async ({ context }) => {
    const page = await openLmsPage(context);
    await createAnnotationViaUI(
      page,
      page.locator('#para1'),
      'Keyboard accessible annotation',
      'yellow'
    );

    const highlight = page.locator('.assist-inline-annotation').first();
    await expect(highlight).toBeVisible();
    expect(await highlight.getAttribute('role')).toBe('mark');
    expect(await highlight.getAttribute('tabindex')).toBe('0');

    // Saving the dialog already lands focus on the new highlight (SC 2.4.3). Click a
    // non-focusable element first to return to the fresh-page baseline this test means to
    // check: an unfocused document, with Tab landing on the first focusable thing on the page.
    await page.locator('#heading').click();

    await page.keyboard.press('Tab');
    const isFocused = await highlight.evaluate(el => el === document.activeElement);
    expect(isFocused).toBe(true);

    await page.keyboard.press('Enter');
    const modal = page.locator('.assist-annotation-modal-overlay');
    await expect(modal).toBeVisible();
  });

  test('sidebar should have proper ARIA labels', async ({ context, extensionId }) => {
    const page = await openLmsPage(context);

    await sendToContentScript(context, extensionId, { type: 'toggleAnnotationSidebar' });
    await page.waitForTimeout(500);

    const sidebar = page.locator('#assist-annotation-sidebar');
    expect(await sidebar.getAttribute('role')).toBe('complementary');
    expect(await sidebar.getAttribute('aria-label')).toBe('Annotations sidebar');

    const closeBtn = sidebar.locator('#sidebar-close-btn');
    expect(await closeBtn.getAttribute('aria-label')).toBe('Close sidebar');
  });

  test('color picker buttons should have ARIA labels', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    const note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();
    const colorBtn = note.locator('.assist-sticky-note-color-btn');

    expect(await colorBtn.getAttribute('aria-label')).toBe('Change note color');

    await colorBtn.click();
    const colorPicker = page.locator('.assist-color-picker');
    await expect(colorPicker).toBeVisible();
    const colorOptions = colorPicker.locator('.assist-color-option');

    const firstOptionLabel = await colorOptions.first().getAttribute('aria-label');
    expect(firstOptionLabel).toBeTruthy();
  });
});

// ============================================================
// PERSISTENCE TESTS
// ============================================================

test.describe('Annotations - Persistence', () => {
  test.beforeEach(async ({ context, extensionId }) => {
    await store(context, extensionId, { annotations: { enabled: true } });
    await routeLms(context);
  });

  test('sticky note should persist after page reload', async ({ context }) => {
    const page = await openLmsPage(context);
    await page.keyboard.press('Alt+N');

    let note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();
    const content = note.locator('.assist-sticky-note-content');
    await content.click();
    await content.fill('Persistent note');
    await page.locator('#heading').click();
    await page.waitForTimeout(300);

    await reloadLmsPage(page);

    note = page.locator('.assist-sticky-note');
    await expect(note).toBeVisible();
    const reloadedContent = note.locator('.assist-sticky-note-content');
    expect(await reloadedContent.textContent()).toBe('Persistent note');
  });

  test('annotation should persist after page reload', async ({ context }) => {
    const page = await openLmsPage(context);
    await createAnnotationViaUI(page, page.locator('#para1'), 'Persistent annotation', 'blue');

    let highlight = page.locator('.assist-inline-annotation');
    await expect(highlight.first()).toBeVisible();

    await reloadLmsPage(page);

    highlight = page.locator('.assist-inline-annotation');
    await expect(highlight.first()).toBeVisible();
  });
});
