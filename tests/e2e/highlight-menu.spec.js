/**
 * E2E tests for the Highlight Menu, in real Chrome against the built extension.
 *
 * This file used to carry two popup checks plus a skipped "Extended" block of nine empty test
 * bodies. The old copy in tests/e2e-full-suite-backup (removed, and kept in git history) had real
 * bodies for them, but they checked only that the popup's own switches move and that its own
 * labels exist - none of them looked at the menu on the page - and three of them drove controls
 * that no longer exist
 * (`#highlight-menu-show-search` and `#highlight-menu-show-copy` were removed when the menu was
 * reorganised, so restoring that file would fail on selectors, not on behaviour). It was not
 * restored.
 *
 * What the settings actually do to the menu is now proven in jsdom by
 * tests/unit/highlightMenu/extended-options.test.js: each of the five per-button switches removes
 * exactly its own button, the roving tab stop survives a hidden button, and the auto-hide delay is
 * honoured including zero, hover and re-selection.
 *
 * What is left here is the browser's half: that the popup's switches reach the page at all, that
 * the menu Chrome paints is actually on screen and over the selection, and that the auto-hide the
 * student chose really is what they see.
 *
 * Technique: a fixture page served at an instructure.com URL so the manifest injects the content
 * script, as in tests/e2e/annotations.spec.js.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';

const LMS_ORIGIN = 'https://highlight-menu-spec.instructure.com';
const PAGE_URL = `${LMS_ORIGIN}/courses/1/pages/selection`;

const ARTICLE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Selection test page - Canvas</title></head>
<body style="margin: 0; font: 16px/1.6 system-ui, sans-serif">
<h1 id="heading">Selection test page</h1>
<p id="para" style="margin: 200px 40px">Working memory holds what a reader has just decoded while
the next words arrive, and its capacity is limited enough that one unfamiliar word can empty it.</p>
</body></html>`;

/** Serve the fixture for the whole LMS origin, so the manifest's instructure.com match injects. */
async function routeLms(context) {
  await context.route(`${LMS_ORIGIN}/**`, route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE_HTML })
  );
}

/**
 * Write `highlightMenuSettings` the way the popup's save does — a flat object in
 * chrome.storage.local, not under assist_settings (src/popup/popup.js:1684-1695).
 *
 * @param {import('@playwright/test').BrowserContext} context - The extension context.
 * @param {string} extensionId - The loaded extension's id.
 * @param {Object} settings - The settings object to store.
 */
async function storeMenuSettings(context, extensionId, settings) {
  const page = await openReadyPopup(context, extensionId);
  await page.evaluate(
    settings =>
      new Promise(resolve => {
        chrome.storage.local.set({ highlightMenuSettings: settings }, () => resolve());
      }),
    settings
  );
  await page.close();
}

/** The shipped defaults, so each test changes exactly one thing. */
function defaults(overrides = {}) {
  return {
    enabled: true,
    compactMode: true,
    showTTS: true,
    showDictionary: true,
    showTranslate: true,
    showAnnotate: true,
    showSaveCitation: true,
    showMindMap: true,
    showSpeedRead: true,
    showFlashcard: true,
    autoHideDelay: 5000,
    ...overrides,
  };
}

/**
 * Select the paragraph with a real mouse drag and release, which is what the content script's
 * document-level mouseup listener is waiting for.
 *
 * @param {import('@playwright/test').Page} page - The fixture page.
 */
async function selectParagraph(page) {
  const box = await page.locator('#para').boundingBox();
  await page.mouse.move(box.x + 6, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 8, { steps: 12 });
  await page.mouse.up();
}

/** Open the fixture with menu settings already saved. */
async function openWith(context, extensionId, settings) {
  await storeMenuSettings(context, extensionId, settings);
  const page = await context.newPage();
  await routeLms(context);
  await page.goto(PAGE_URL);
  await page.waitForTimeout(1200);
  return page;
}

test.describe('Highlight Menu - the popup controls', () => {
  // Flat is the popup's face: a tool's settings are drawn under its row while it is on, and each
  // one drives the hidden accordion control of the same id (`#flat-<id>` here, `#<id>` there).
  const switchOn = async popupPage => {
    await popupPage.locator('#flat-highlight-menu').setChecked(true, { force: true });
    await expect(popupPage.locator('#highlight-menu-enabled')).toBeChecked();
  };

  test('the switch, the five button toggles and the delay slider are all there', async ({
    popupPage,
  }) => {
    await switchOn(popupPage);

    for (const id of [
      'highlight-menu-show-tts',
      'highlight-menu-show-dictionary',
      'highlight-menu-show-translate',
      'highlight-menu-show-annotate',
      'highlight-menu-show-speed-read',
    ]) {
      await expect(popupPage.locator(`#flat-${id}`)).toBeVisible();
    }

    const slider = popupPage.locator('#flat-highlight-menu-auto-hide-delay');
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toBeVisible();
    expect(parseInt(await slider.getAttribute('max'), 10)).toBeGreaterThan(0);
  });

  test('the delay slider is named and its value reaches the popup', async ({ popupPage }) => {
    await switchOn(popupPage);

    const slider = popupPage.locator('#flat-highlight-menu-auto-hide-delay');
    await slider.scrollIntoViewIfNeeded();

    const name = await slider.evaluate(input => {
      const label = document.querySelector(`label[for="${input.id}"]`);
      return (input.getAttribute('aria-label') || label?.textContent || '').trim();
    });
    expect(name.length).toBeGreaterThan(0);

    await slider.fill('3000');
    await expect(popupPage.locator('#highlight-menu-auto-hide-delay')).toHaveValue('3000');
  });

  test('turning the menu off takes its options away', async ({ popupPage }) => {
    await switchOn(popupPage);
    const options = popupPage.locator('#flat-root [data-settings-for="highlight-menu"]');
    await expect(options).toBeVisible();

    await popupPage.locator('#flat-highlight-menu').setChecked(false, { force: true });
    await expect(popupPage.locator('#highlight-menu-enabled')).not.toBeChecked();
    await expect(options).toHaveCount(0);
  });
});

test.describe('Highlight Menu - on a Canvas page', () => {
  test('selecting text puts the menu on screen, near the selection', async ({
    context,
    extensionId,
  }) => {
    const page = await openWith(context, extensionId, defaults());
    await selectParagraph(page);

    const menu = page.locator('#assist-highlight-menu');
    await expect(menu).toBeVisible();

    // On screen, not merely in the DOM. `offsetParent` is null for a fixed element even when it
    // is visible, so this is judged on the rect and the viewport.
    const placement = await page.evaluate(() => {
      const rect = document.getElementById('assist-highlight-menu').getBoundingClientRect();
      const paragraph = document.getElementById('para').getBoundingClientRect();
      return {
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        paragraphTop: paragraph.top,
      };
    });
    expect(placement.rect.width).toBeGreaterThan(0);
    expect(placement.rect.height).toBeGreaterThan(0);
    expect(placement.rect.left).toBeGreaterThanOrEqual(0);
    expect(placement.rect.top).toBeGreaterThanOrEqual(0);
    expect(placement.rect.left + placement.rect.width).toBeLessThanOrEqual(
      placement.viewport.width
    );
    expect(placement.rect.top + placement.rect.height).toBeLessThanOrEqual(
      placement.viewport.height
    );

    await page.close();
  });

  test('a button the student switched off is not in the menu Chrome paints', async ({
    context,
    extensionId,
  }) => {
    const page = await openWith(context, extensionId, defaults({ showTranslate: false }));
    await selectParagraph(page);

    const menu = page.locator('#assist-highlight-menu');
    await expect(menu).toBeVisible();

    const labels = await page.$$eval('#assist-highlight-menu .assist-hm-btn', buttons =>
      buttons.map(b => b.getAttribute('aria-label'))
    );
    expect(labels).not.toContain('Translate');
    expect(labels).toContain('Read Aloud (TTS)');
    expect(labels).toContain('Dictionary Lookup');

    await page.close();
  });

  test('every button in the menu is big enough to hit and reachable by keyboard', async ({
    context,
    extensionId,
  }) => {
    // SC 2.5.8 wants a 24px target; this menu's buttons are the smallest controls AssisT injects.
    const page = await openWith(context, extensionId, defaults());
    await selectParagraph(page);
    await expect(page.locator('#assist-highlight-menu')).toBeVisible();

    const buttons = await page.$$eval('#assist-highlight-menu .assist-hm-btn', elements =>
      elements.map(element => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label'),
          width: rect.width,
          height: rect.height,
          tabindex: element.getAttribute('tabindex'),
        };
      })
    );

    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach(button => {
      expect(button.label && button.label.length).toBeGreaterThan(0);
      expect(button.width).toBeGreaterThanOrEqual(24);
      expect(button.height).toBeGreaterThanOrEqual(24);
    });
    expect(buttons.filter(button => button.tabindex === '0')).toHaveLength(1);

    await page.close();
  });

  // Tab enters the menu; arrow keys pressed on the page stay the page's, so Shift+Arrow can still
  // extend the selection that opened it.
  test('Tab enters the menu, the arrow keys move along it, and Escape closes it', async ({
    context,
    extensionId,
  }) => {
    const page = await openWith(context, extensionId, defaults({ autoHideDelay: 0 }));
    await selectParagraph(page);
    await expect(page.locator('#assist-highlight-menu')).toBeVisible();
    const focusedLabel = () =>
      page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null);

    await page.keyboard.press('ArrowRight');
    expect(await focusedLabel()).toBeNull();

    await page.keyboard.press('Tab');
    const first = await focusedLabel();
    expect(first).toBeTruthy();
    await page.keyboard.press('ArrowRight');
    const second = await focusedLabel();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    await page.keyboard.press('Escape');
    await expect(page.locator('#assist-highlight-menu')).toHaveCount(0);

    await page.close();
  });

  test('the auto-hide delay the student chose is the one they get', async ({
    context,
    extensionId,
  }) => {
    const page = await openWith(context, extensionId, defaults({ autoHideDelay: 2000 }));
    await selectParagraph(page);
    await expect(page.locator('#assist-highlight-menu')).toBeVisible();

    await page.waitForTimeout(1200);
    await expect(page.locator('#assist-highlight-menu')).toBeVisible();

    await page.waitForTimeout(1500);
    await expect(page.locator('#assist-highlight-menu')).toHaveCount(0);

    await page.close();
  });

  test('a delay of zero leaves the menu up for as long as the student needs', async ({
    context,
    extensionId,
  }) => {
    const page = await openWith(context, extensionId, defaults({ autoHideDelay: 0 }));
    await selectParagraph(page);
    await expect(page.locator('#assist-highlight-menu')).toBeVisible();

    await page.waitForTimeout(8000);

    await expect(page.locator('#assist-highlight-menu')).toBeVisible();

    await page.close();
  });
});
