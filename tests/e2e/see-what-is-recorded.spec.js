/**
 * "See what is recorded", in real Chrome.
 *
 * The popup asks the page to open the learning record, and closes itself once the page says it has.
 * Two defects stood between the button and that: the panel's stylesheet was stripped by the
 * sanitiser, so it rendered as loose text at the foot of the page and wider than the screen; and the
 * content script's main router answered the message first with "Unknown message type", so the popup
 * reported a failure and stayed open even though the panel had appeared.
 *
 * WHAT IS STUBBED, AND WHY. The popup finds its page with chrome.tabs.query({active, currentWindow}).
 * Opened as an ordinary Playwright tab, the popup IS the active tab, so that query is pointed at the
 * fixture page instead (as annotations.spec.js does). window.close is recorded rather than run, so
 * the test can see the popup chose to close.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';
import { renderedId } from '../../src/popup/registry/control-renderer.js';

const LMS_ORIGIN = 'https://record.instructure.com';
const PAGE_URL = `${LMS_ORIGIN}/courses/1/pages/reading`;

const PAGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Reading - Canvas</title></head>
<body><main><h1>Reading and working memory</h1>
<div class="user_content"><p>Working memory holds what a reader has just decoded.</p></div>
</main></body></html>`;

async function openFlatPopup(context, extensionId) {
  const page = await openReadyPopup(context, extensionId);
  await page.waitForSelector('#flat-root .assist-flat__row', { timeout: 15000 });
  return page;
}

/** Point the popup's active-tab lookup at the fixture page, and record window.close. */
async function aimPopupAt(popup, urlPart) {
  await popup.evaluate(async part => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find(tab => tab.url && tab.url.includes(part));
    Object.defineProperty(chrome.tabs, 'query', {
      value: async () => [target],
      configurable: true,
      writable: true,
    });
    window.__closed = false;
    window.close = () => {
      window.__closed = true;
    };
  }, urlPart);
}

/** Whether the content script in the fixture tab is up and answering. */
function pingPage(popup, urlPart) {
  return popup.evaluate(async part => {
    const tabs = await chrome.tabs.query({});
    const target = tabs.find(tab => tab.url && tab.url.includes(part));
    if (!target) {
      return false;
    }
    try {
      const reply = await chrome.tabs.sendMessage(target.id, { type: 'PING' });
      return Boolean(reply && reply.loaded);
    } catch {
      return false;
    }
  }, urlPart);
}

function pageScrollsSideways(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
}

test.describe('See what is recorded', () => {
  test('opens a styled dialog over the page, and the popup closes itself', async ({
    context,
    extensionId,
  }) => {
    await context.route(`${LMS_ORIGIN}/**`, route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: PAGE_HTML })
    );
    // Switched on in the popup first, as a student would, so the page starts with the record on.
    const popup = await openFlatPopup(context, extensionId);
    await popup.locator('#flat-learning-profile').setChecked(true, { force: true });
    await expect
      .poll(() =>
        popup.evaluate(() =>
          chrome.storage.local
            .get('cognitiveProfileSettings')
            .then(r => r.cognitiveProfileSettings?.enabled)
        )
      )
      .toBe(true);

    const lms = await context.newPage();
    await lms.goto(PAGE_URL);
    // The content script lives in an isolated world the page cannot see, so ask it from here.
    await expect
      .poll(() => pingPage(popup, 'record.instructure.com'), { timeout: 15000 })
      .toBe(true);

    await aimPopupAt(popup, 'record.instructure.com');
    await popup.locator(`#${renderedId('btn-see-learning-record')}`).click();

    // The popup heard the page say yes, so it closed, and it reported no failure.
    await expect.poll(() => popup.evaluate(() => window.__closed)).toBe(true);
    await expect(popup.locator('#learning-profile-delete-status')).not.toContainText(
      'Could not open your record'
    );

    // The dialog is fixed over the page, not loose text at its foot.
    const dialog = lms.getByRole('dialog', { name: /recorded about how you work/ });
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el => getComputedStyle(el).position)).toBe('fixed');
    const box = await dialog.boundingBox();
    const viewport = lms.viewportSize();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(await pageScrollsSideways(lms)).toBe(false);

    // Escape closes it.
    await lms.bringToFront();
    await dialog.focus();
    await lms.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // And so does Done, reopened the same way.
    await aimPopupAt(popup, 'record.instructure.com');
    await popup.locator(`#${renderedId('btn-see-learning-record')}`).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toHaveCount(0);

    await popup.close();
    await lms.close();
  });
});
