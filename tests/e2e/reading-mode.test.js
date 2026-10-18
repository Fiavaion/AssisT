/**
 * E2E tests for Reading Mode, in real Chrome against the built extension.
 *
 * This file used to hold two popup checks and a skipped "Extended" block whose five test bodies
 * were the comment `// ... test content` — tests that were never written, only implied. They are
 * gone. What is here now drives the feature the way a student does: a fixture article served at an
 * instructure.com URL so the manifest injects the content script (the technique proven in
 * tests/e2e/release-pass-page-tools.spec.js and tests/e2e/annotations.spec.js), reading mode
 * switched on through the same `READING_MODE_TOGGLE` message the popup's button sends, and the
 * overlay judged on what the browser actually paints and where it actually puts focus.
 *
 * Reading mode's own extraction runs Mozilla's Readability over the live document, so only a real
 * browser can tell us whether a student gets the article or an `alert()` saying it could not be
 * read. jsdom cannot: it lays nothing out and reads no stylesheet.
 *
 * One case is marked `test.fail()`: the overlay is not a modal dialog and does not manage focus.
 * It is expected to fail, and to start failing as a PASS the day the source is fixed — see the
 * comment on that test for the lines.
 */

import { test, expect } from './extension-fixture.js';

const LMS_ORIGIN = 'https://reading-mode-spec.instructure.com';
const PAGE_URL = `${LMS_ORIGIN}/courses/1/pages/working-memory`;

/**
 * An article page with enough real prose for Readability to accept it, plus the clutter a student
 * turns reading mode on to escape: a navigation bar, a sidebar of related links and a footer.
 * The tall filler makes the scroll position observable.
 */
const ARTICLE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Working memory and reading - Canvas</title>
<style>
 body { margin: 0; font: 16px/1.6 system-ui, sans-serif; }
 #sidebar { float: right; width: 200px; }
 #filler { height: 2200px; }
</style></head>
<body>
<nav id="nav"><a href="/courses/1">Course home</a> <a href="/courses/1/grades">Grades</a></nav>
<aside id="sidebar"><h2>Related</h2><ul><li><a href="/x">Decoding</a></li>
<li><a href="/y">Fluency</a></li></ul></aside>
<article id="article">
<h1 id="heading">Working memory and reading</h1>
<p class="byline">By J. Snell</p>
<p id="para1">Working memory holds what a reader has just decoded while the next words arrive, and
its capacity is limited enough that a single unfamiliar word can empty it. This is why a reader who
decodes accurately but slowly can still finish a sentence with no idea what it said: the beginning
was gone before the end arrived. Instruction that reduces the decoding load therefore raises
comprehension without teaching comprehension at all, which is one of the more counter-intuitive
findings in the reading literature and one of the most reliably replicated.</p>
<p id="para2">The same account explains why re-reading helps some students far more than others.
A reader whose decoding is effortful spends the first pass recovering the words and has nothing
left for the argument, so the second pass is the first one that can be about meaning. A reader who
decodes fluently has already spent the first pass on meaning, and gains much less from a second.
Any support that shortens the distance between the eye and the word — larger text, wider spacing,
fewer competing elements on the page — buys capacity back for the argument itself.</p>
<p id="para3">Clutter is not a neutral cost. Each element competing for attention is an element the
reader must actively suppress, and suppression draws on the same limited pool that holds the
sentence. A page stripped back to its article is therefore not merely more pleasant to look at; for
a reader whose capacity is already committed to decoding, it can be the difference between
finishing the paragraph with its meaning intact and finishing it with nothing.</p>
</article>
<div id="filler">Course materials continue below.</div>
<footer id="footer">Contact the department office for support.</footer>
</body></html>`;

/** Serve the fixture for the whole LMS origin, so the manifest's instructure.com match injects. */
async function routeLms(context) {
  await context.route(`${LMS_ORIGIN}/**`, route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE_HTML })
  );
}

/**
 * Open the fixture and wait until the content script has finished evaluating. The annotation
 * sidebar mounts at import time, so its presence is the signal the bundle ran. Console output,
 * page errors and any native dialog are collected: an `alert()` here means extraction failed, and
 * reading mode has no other way of telling the student so.
 */
async function openLmsPage(context) {
  const page = await context.newPage();
  const logs = [];
  const errors = [];
  const dialogs = [];
  page.on('console', message => logs.push(message.text()));
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.goto(PAGE_URL);
  await page.waitForSelector('#assist-annotation-sidebar', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(1000);
  return { page, logs, errors, dialogs };
}

/**
 * Send the message the popup's "Toggle Reading Mode" button sends
 * (src/popup/popup.js:8803-8806 → src/content/content-simple.js:1366), from an extension page,
 * which is the only realm with chrome.tabs. This is the real switch-on path; the content script's
 * `window.assistFeatures` lives in the isolated world and cannot be reached from page.evaluate.
 *
 * @returns {Promise<Object>} The content script's reply: `{ success, active }`.
 */
async function toggleFromPopupPath(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  const reply = await page.evaluate(
    urlPart =>
      new Promise(resolve => {
        chrome.tabs.query({}, tabs => {
          const target = tabs.find(tab => tab.url && tab.url.includes(urlPart));
          if (!target) {
            resolve({ success: false, error: 'fixture tab not found' });
            return;
          }
          chrome.tabs.sendMessage(target.id, { type: 'READING_MODE_TOGGLE' }, response =>
            resolve(response || { success: false, error: chrome.runtime.lastError?.message })
          );
        });
      }),
    'pages/working-memory'
  );
  await page.close();
  return reply;
}

const OVERLAY = '#assist-reading-mode-overlay';
const CONTENT = '#assist-reading-mode-content';
const CLOSE = '#assist-reading-mode-close';

test.beforeEach(() => {
  // A real profile, a real page, a real Readability parse: the 30s project default is not enough.
  test.setTimeout(120000);
});

test.describe('Reading Mode - the popup control', () => {
  test('the popup carries the Reading Mode switch and the button that opens it', async ({
    popupPage,
  }) => {
    // Both are declared in the tool registry (src/popup/registry/tools/reading.js). The accordion
    // controls are hidden behind the Flat view, which drives them, so presence is what is checked
    // for them, and Flat's own switch is what a student sees.
    await expect(popupPage.locator('#reading-mode-enabled')).toHaveCount(1);
    await expect(popupPage.locator('#btn-toggle-reading-mode')).toHaveCount(1);
    await expect(popupPage.locator('#flat-reading-mode')).toBeVisible();
  });

  test('the switch is a real checkbox with a name a screen reader can read', async ({
    popupPage,
  }) => {
    const toggle = popupPage.locator('#flat-reading-mode');
    expect(await toggle.getAttribute('type')).toBe('checkbox');
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAccessibleName(/\w/);
  });
});

test.describe('Reading Mode - on a Canvas page', () => {
  test.beforeEach(async ({ context }) => {
    await routeLms(context);
  });

  test('opens the article, and only the article', async ({ context, extensionId }) => {
    const { page, dialogs, errors } = await openLmsPage(context);

    const reply = await toggleFromPopupPath(context, extensionId);
    expect(reply.success).toBe(true);
    expect(reply.active).toBe(true);

    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible();
    // Extraction failing is reported only by a native alert(); there must not be one.
    expect(dialogs).toEqual([]);

    const text = await page.locator(CONTENT).textContent();
    expect(text).toContain('Working memory holds what a reader has just decoded');
    expect(text).toContain('Clutter is not a neutral cost');
    // The clutter the student asked to be rid of does not come with it.
    expect(text).not.toContain('Contact the department office');
    expect(text).not.toContain('Course home');
    expect(await page.locator(`${OVERLAY} nav`).count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test('covers the page it is over, and reads over the page', async ({ context, extensionId }) => {
    const { page } = await openLmsPage(context);
    await toggleFromPopupPath(context, extensionId);
    await expect(page.locator(OVERLAY)).toBeVisible();

    const box = await page.locator(OVERLAY).boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 2);

    const layer = await page.evaluate(
      selector => Number(getComputedStyle(document.querySelector(selector)).zIndex),
      OVERLAY
    );
    expect(layer).toBeGreaterThan(100000);

    // The article text has to be readable against the reading-mode background, not the page's.
    const painted = await page.evaluate(
      selector => getComputedStyle(document.querySelector(selector)).backgroundColor,
      OVERLAY
    );
    expect(painted).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('the Exit button is there, named, and reachable by keyboard', async ({
    context,
    extensionId,
  }) => {
    const { page } = await openLmsPage(context);
    await toggleFromPopupPath(context, extensionId);

    const close = page.locator(CLOSE);
    await expect(close).toBeVisible();
    await expect(close).toHaveAttribute('aria-label', 'Exit Reading Mode');

    await close.focus();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('assist-reading-mode-close');

    await page.keyboard.press('Enter');

    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test('the Exit button also works with the mouse, and leaves nothing behind', async ({
    context,
    extensionId,
  }) => {
    const { page } = await openLmsPage(context);
    await toggleFromPopupPath(context, extensionId);

    await page.locator(CLOSE).click();

    await expect(page.locator(OVERLAY)).toHaveCount(0);
    expect(await page.locator('[id^="assist-reading-mode"]').count()).toBe(0);
    // The page underneath is the student's page again.
    await expect(page.locator('#heading')).toBeVisible();
    await expect(page.locator('#footer')).toBeVisible();
  });

  test('Escape leaves reading mode from anywhere on the page', async ({ context, extensionId }) => {
    const { page } = await openLmsPage(context);
    await toggleFromPopupPath(context, extensionId);
    await expect(page.locator(OVERLAY)).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test('the Alt+R shortcut opens it and closes it again', async ({ context }) => {
    const { page } = await openLmsPage(context);

    // Alt+R is the shipped default (src/utils/keyboard-shortcuts.js:37), registered by the feature
    // at content-script load, so it works with no configuration.
    await page.keyboard.press('Alt+r');
    await expect(page.locator(OVERLAY)).toBeVisible({ timeout: 20000 });

    await page.keyboard.press('Alt+r');
    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test('a second toggle closes it, and the content script reports the state honestly', async ({
    context,
    extensionId,
  }) => {
    const { page } = await openLmsPage(context);

    expect((await toggleFromPopupPath(context, extensionId)).active).toBe(true);
    await expect(page.locator(OVERLAY)).toBeVisible();

    expect((await toggleFromPopupPath(context, extensionId)).active).toBe(false);
    await expect(page.locator(OVERLAY)).toHaveCount(0);
  });

  test('gives the scroll position back on the way out', async ({ context, extensionId }) => {
    const { page } = await openLmsPage(context);
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => Math.round(window.scrollY));
    expect(before).toBeGreaterThan(500);

    await toggleFromPopupPath(context, extensionId);
    await expect(page.locator(OVERLAY)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(OVERLAY)).toHaveCount(0);
    await page.waitForTimeout(300);

    // A student who was halfway down a long page must not be dropped back at the top.
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(before - 50);
  });

  test('opening it twice over does not stack two overlays', async ({ context, extensionId }) => {
    const { page, errors } = await openLmsPage(context);
    await toggleFromPopupPath(context, extensionId);
    await expect(page.locator(OVERLAY)).toBeVisible();

    await page.keyboard.press('Alt+r'); // toggles, then back on
    await page.waitForTimeout(500);
    await page.keyboard.press('Alt+r');
    await page.waitForTimeout(1500);

    expect(await page.locator(OVERLAY).count()).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test('says how to leave, out loud, in a live region', async ({ context, extensionId }) => {
    const { page } = await openLmsPage(context);

    // The toast removes itself after about two seconds, so the wait starts before the toggle. It
    // waits for this announcement in particular: other features use the same toast.
    const announced = page.waitForFunction(
      () => {
        const toast = document.getElementById('assist-toast');
        return toast && /reading mode/i.test(toast.textContent) ? toast : null;
      },
      null,
      { timeout: 30000 }
    );
    await toggleFromPopupPath(context, extensionId);
    const toast = (await announced).asElement();

    // The toast is the extension's only announcement route; it carries role="status".
    expect(await toast.getAttribute('role')).toBe('status');
    expect((await toast.textContent()).toUpperCase()).toContain('ESC');
  });

  /**
   * The overlay is a full-page layer, so it behaves like a dialog: `role="dialog"`, the page beneath
   * it inert and out of the accessibility tree, focus moved in on open and given back on exit.
   *
   * It carries no `aria-modal`: AssisT's own page tools stay reachable behind it - a student reading
   * an article still needs to start and stop the voice - and `aria-modal="true"` would tell a screen
   * reader that nothing outside the overlay exists. Tab therefore cycles the overlay together with
   * those tools, and never walks onto the page underneath.
   */
  test('the overlay is a dialog that takes focus, keeps Tab in, and gives focus back', async ({
    context,
    extensionId,
  }) => {
    const { page } = await openLmsPage(context);
    await page.locator('#nav a').first().focus();

    await toggleFromPopupPath(context, extensionId);
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible();

    await expect(overlay).toHaveAttribute('role', 'dialog');
    expect(await overlay.getAttribute('aria-modal')).toBeNull();
    expect(
      await page.evaluate(
        selector => document.querySelector(selector).contains(document.activeElement),
        OVERLAY
      )
    ).toBe(true);

    // A Tab from inside stays in the reading-mode cycle: the overlay, or one of AssisT's own tools.
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(selector => {
        const active = document.activeElement;
        return Boolean(
          document.querySelector(selector)?.contains(active) ||
            active?.closest('[id^="assist-"]')
        );
      }, OVERLAY)
    ).toBe(true);

    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  });
});
