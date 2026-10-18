/**
 * On a site the manifest does not match, AssisT has to be put into the page by the service worker.
 * It must happen EVERY time, not most times.
 *
 * A real-web tester found it non-deterministic: on the same article the script was injected three
 * times and never appeared at all twice, once after 69 seconds of waiting, with nothing logged and
 * nothing said to the student. The cause was a 100ms timer armed inside the service worker, which a
 * worker shutdown discards. A unit gate now forbids the timer; this is the test that judges the
 * behaviour, because only a real browser can shut a real service worker down.
 *
 * It runs against a copy of the build granted every site (`allSites` in extension-fixture.js), the
 * state of a student who has allowed AssisT on all sites.
 */

import { test, expect } from './extension-fixture.js';

test.use({ allSites: true });

/** A host the manifest does not match, so only the service worker can get AssisT into it. */
const HOST = 'https://not-a-learning-platform.test';

const ARTICLE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Working memory</title></head><body>
<h1>Working memory</h1>
<p id="p1">Working memory holds a small amount of information ready to use.</p>
<p id="p2">It is limited, and it tires. Reading on a screen taxes it further.</p>
<div style="height:2000px"></div>
</body></html>`;

/** How many times in a row it has to work. Two failures in five is what was reported. */
const ATTEMPTS = 6;

async function serveArticle(context) {
  await context.route(`${HOST}/**`, route =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ARTICLE })
  );
}

/**
 * Wait for AssisT to appear in the page, and say how long it took.
 * Returns null when it never arrives, rather than throwing, so the caller can count.
 */
async function waitForAssisT(page, timeout = 15000) {
  const started = Date.now();
  try {
    await page.waitForFunction(
      () => document.querySelector('[id^="assist-"], [class*="assist-"]') !== null,
      undefined,
      { timeout }
    );
    return Date.now() - started;
  } catch {
    return null;
  }
}

test.describe('getting AssisT into an ordinary page', () => {
  test('happens on every fresh tab, not most of them', async ({ context }) => {
    test.setTimeout(180000);
    await serveArticle(context);

    const timings = [];
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const page = await context.newPage();
      await page.goto(`${HOST}/article/${attempt}`, { waitUntil: 'load' });
      const took = await waitForAssisT(page);
      timings.push(took);
      console.log(`attempt ${attempt}: ${took === null ? 'NEVER INJECTED' : took + 'ms'}`);
      await page.close();
    }

    const missed = timings.filter(t => t === null).length;
    console.log(`injected ${ATTEMPTS - missed}/${ATTEMPTS}`);
    expect(missed, `AssisT never arrived on ${missed} of ${ATTEMPTS} fresh tabs`).toBe(0);
  });

  test('happens again after navigating within one tab', async ({ context }) => {
    test.setTimeout(180000);
    await serveArticle(context);

    const page = await context.newPage();
    const results = [];
    for (let visit = 1; visit <= ATTEMPTS; visit++) {
      await page.goto(`${HOST}/page/${visit}`, { waitUntil: 'load' });
      const took = await waitForAssisT(page);
      results.push(took);
      console.log(`visit ${visit}: ${took === null ? 'NEVER INJECTED' : took + 'ms'}`);
    }
    await page.close();

    expect(results.filter(t => t === null)).toEqual([]);
  });

  test('puts AssisT in exactly once, however many times the page settles', async ({ context }) => {
    await serveArticle(context);

    const page = await context.newPage();
    await page.goto(`${HOST}/once`, { waitUntil: 'load' });
    expect(await waitForAssisT(page)).not.toBeNull();
    await page.waitForTimeout(2500);

    // The annotation sidebar is created once per injection, so a second copy means a second run.
    const sidebars = await page.locator('#assist-annotation-sidebar').count();
    expect(sidebars).toBe(1);
    await page.close();
  });
});
