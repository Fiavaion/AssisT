/**
 * Click-to-read must survive an in-page navigation.
 *
 * Canvas and Moodle are single-page apps: the document persists across route changes, so the
 * content script tears its document-level listeners down and puts them back when the URL moves.
 * For a long time the "put back" half handed addEventListener a null and registered nothing, so
 * the first navigation inside Canvas silently killed click-to-read and every keyboard shortcut
 * until the tab was reloaded. Unit tests could not see it; only a real navigation can.
 *
 * Observed through the content script's own console lines, which are the one signal that does not
 * depend on speech synthesis being audible in a test browser.
 */
import { test, expect, openReadyPopup } from './extension-fixture.js';

const CLEANED_UP = '[AssisT] Content script cleaned up for SPA navigation';
const READ_STARTED = '[AssisT][Click] Calling readChunked()';

async function enableTts(context, extensionId) {
  const popup = await openReadyPopup(context, extensionId);
  await popup.evaluate(async () => {
    const { assist_settings = {} } = await chrome.storage.local.get('assist_settings');
    assist_settings.tts = { ...(assist_settings.tts || {}), enabled: true };
    await chrome.storage.local.set({ assist_settings });
  });
  await popup.close();
}

test.describe('SPA navigation', () => {
  test('click-to-read still fires after the URL changes without a reload', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(90_000);
    await enableTts(context, extensionId);

    const page = await context.newPage();
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));

    // An LMS host, so the manifest injects the content script without any permission prompt.
    await page.goto('https://canvas.instructure.com/login/canvas', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await expect
      .poll(() => logs.some(l => l.includes('[AssisT] Ready!')), { timeout: 20_000 })
      .toBe(true);

    // Something readable that is ours, so the assertion does not depend on Canvas's markup.
    await page.evaluate(() => {
      const p = document.createElement('p');
      p.id = 'assist-e2e-target';
      p.textContent =
        'A bibliography is a list of the sources you used while researching your work.';
      document.body.prepend(p);
    });

    // Sanity: it reads before navigation, so a later failure means the navigation broke it.
    await page.click('#assist-e2e-target');
    await expect
      .poll(() => logs.filter(l => l.includes(READ_STARTED)).length, { timeout: 5_000 })
      .toBe(1);

    // The navigation itself: a pushState the way an SPA router does it, plus one DOM mutation
    // so the observer that watches for the URL change has a reason to look.
    await page.evaluate(() => {
      history.pushState({}, '', '/courses/1/assignments');
      document.title = 'Assignments';
    });
    await expect
      .poll(() => logs.some(l => l.includes(CLEANED_UP)), { timeout: 5_000 })
      .toBe(true);

    // The whole point.
    await page.click('#assist-e2e-target');
    await expect
      .poll(() => logs.filter(l => l.includes(READ_STARTED)).length, { timeout: 5_000 })
      .toBe(2);

    // And the back button, which takes the popstate path rather than the observer.
    await page.evaluate(() => history.back());
    await expect
      .poll(() => logs.filter(l => l.includes(CLEANED_UP)).length, { timeout: 5_000 })
      .toBe(2);
    await page.click('#assist-e2e-target');
    await expect
      .poll(() => logs.filter(l => l.includes(READ_STARTED)).length, { timeout: 5_000 })
      .toBe(3);
  });
});
