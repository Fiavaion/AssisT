/**
 * Release pass: the page tools (content script), in real Chrome.
 *
 * Every case here is one defect overnight release testing found on a live page and the fixes in
 * 178770b..8a5bba5 closed. None of them was visible to jsdom: they are about what the browser
 * actually paints, where the browser actually puts focus, and which requests the browser actually
 * makes. So each one is asserted here, against the built extension, on a fixture served at an
 * instructure.com URL so the manifest injects the content script into it.
 *
 * Kept deliberately narrow — one defect per test, the exact id, role or sentence the fix shipped.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';

const LMS_ORIGIN = 'https://releasepass.instructure.com';
const PAGE_URL = `${LMS_ORIGIN}/courses/1/assignments/5`;
const EDITOR_URL = `${LMS_ORIGIN}/courses/1/assignments/5/edit`;
const OFF_LMS_URL = 'https://release-pass.example.org/';
const THUMBS_UP = '\u{1F44D}';

const sleep = (page, ms) => page.waitForTimeout(ms);

/**
 * A Canvas assignment page carrying the shapes the fixes were made against: `.description
 * .user_content` for the LMS adapter, a same-page anchor, an abbreviation with its expansion, a
 * cite, a q and a bdi for the dyslexia restore, an emoji, a text field with a control below it for
 * the microphone button, and a fixed Submit button in the bottom-left corner for the chip dock.
 */
const ARTICLE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Essay 1 - Canvas</title>
<style>
 body { margin: 0; padding: 24px; font: 16px/1.6 system-ui, sans-serif; }
 textarea { display: block; width: 60%; height: 120px; }
 #bottom { position: fixed; left: 12px; bottom: 12px; }
 #filler { height: 1400px; }
</style></head>
<body><main>
<h1 id="top">Reading and working memory</h1>
<nav><a id="jump" href="#later">Skip to the later section</a></nav>
<div id="content" class="description user_content">
<p id="lead">Dyslexia, also called <abbr id="abbr" title="specific learning difficulty">SLD</abbr>,
affects <a id="link" href="/courses/1/pages/reading" class="internal">reading</a> and writing
<q id="quote" cite="https://example.org/source">in many writing systems</q>
<bdi id="bdi" dir="rtl">العربية</bdi> and works well ${THUMBS_UP}.</p>
<p id="second">Working memory holds what a reader has just decoded while the next words arrive.</p>
<ol><li id="ref"><cite id="cite" class="citation journal">Snell, J. (2024).
<i id="italic">Acta Psychologica</i>, 251.</cite></li></ol>
</div>
<p id="later">The later section, further down the page.</p>
<label for="draft">Your draft</label>
<textarea id="draft"></textarea>
<button id="next-control" type="button">Attach a file</button>
<div id="filler"></div>
<button id="bottom" type="button">Submit</button>
</main></body></html>`;

/** A page whose editing area is an iframe — the TinyMCE shape Canvas uses. */
const EDITOR_HOST_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Edit assignment - Canvas</title></head>
<body><h1>Edit assignment</h1><iframe id="editor" src="/editor-frame" width="600" height="300"
 title="Rich Content Editor"></iframe></body></html>`;

/** The editor's own document: its body IS the student's field. */
const EDITOR_FRAME_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Rich Content Editor</title></head>
<body class="mce-content-body" contenteditable="true"></body></html>`;

const OFF_LMS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Not a learning platform</title></head>
<body><p id="p">An ordinary page on an ordinary site.</p></body></html>`;

/** Serve the fixture for the whole LMS origin; the editor's frame URL gets the editor document. */
async function routeLms(context, main = ARTICLE_HTML) {
  await context.route(`${LMS_ORIGIN}/**`, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: route.request().url().includes('editor-frame') ? EDITOR_FRAME_HTML : main,
    })
  );
}

/**
 * Write settings the way the popup does — nested feature keys under `assist_settings`, plus any
 * top-level keys — from an extension page, which is the only realm with chrome.storage.
 */
async function store(context, extensionId, { features = {}, top = {} } = {}) {
  const page = await openReadyPopup(context, extensionId);
  await page.evaluate(
    ({ features, top }) =>
      new Promise(resolve => {
        chrome.storage.local.get('assist_settings', stored => {
          const settings = stored.assist_settings || {};
          for (const [key, patch] of Object.entries(features)) {
            settings[key] = { ...settings[key], ...patch };
          }
          chrome.storage.local.set({ assist_settings: settings, ...top }, () => resolve());
        });
      }),
    { features, top }
  );
  await page.close();
}

/**
 * Open the fixture and wait until the content script has finished evaluating. The annotation
 * sidebar mounts at import time, so its presence is the signal that the bundle ran.
 */
async function openLmsPage(context, url = PAGE_URL) {
  const page = await context.newPage();
  const logs = [];
  page.on('console', message => logs.push(message.text()));
  page.on('pageerror', error => logs.push(`pageerror: ${error.message}`));
  await page.goto(url);
  await page.waitForSelector('#assist-annotation-sidebar', { state: 'attached', timeout: 30000 });
  await sleep(page, 2500);
  return { page, logs };
}

/** Do two boxes overlap at all? */
function overlaps(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Every AssisT element a student could actually see right now, by id. */
function visibleAssistIds(page) {
  return page.evaluate(() => {
    const onScreen = el => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }
      if (Number(style.opacity) === 0) {
        return false;
      }
      const box = el.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.right > 0 &&
        box.bottom > 0 &&
        box.left < window.innerWidth &&
        box.top < window.innerHeight
      );
    };
    return [...document.querySelectorAll('[id^="assist-"]')]
      .filter(onScreen)
      .map(el => el.id)
      .sort();
  });
}

const SUPPORT_KEYS = [
  'tts',
  'stt',
  'annotations',
  'dyslexiaMode',
  'screenOverlay',
  'readingGuide',
  'textCustomization',
  'maths',
  'citation',
];
const COMPANION_KEYS = [
  'studySuite',
  'personalisedAi',
  'mathReadAloud',
  'authorship',
  'flashcards',
  'summaryDial',
  'lecture',
  'voiceCommands',
];
const allSupports = enabled => Object.fromEntries(SUPPORT_KEYS.map(key => [key, { enabled }]));
const allCompanions = value => Object.fromEntries(COMPANION_KEYS.map(key => [key, value]));

test.describe('Release pass: page tools', () => {
  test.beforeEach(() => {
    // A real profile, a real page and a settled content script: the 30s project default is not
    // enough for any of these.
    test.setTimeout(120000);
  });

  test('the Canvas adapter loads once, and nothing is denied or fails', async ({
    context,
    extensionId,
  }) => {
    await store(context, extensionId, { features: { canvasIntegration: { enabled: true } } });
    await routeLms(context);
    const page = await context.newPage();
    const logs = [];
    const adapterRequests = [];
    page.on('console', message => logs.push(message.text()));
    page.on('request', request => {
      if (/assets\/canvas-adapter-.*\.js/.test(request.url())) {
        adapterRequests.push(request.url());
      }
    });
    await page.goto(PAGE_URL);
    await expect(page.locator('#content.description.user_content')).toHaveCount(1);
    await page.waitForFunction(
      () => document.getElementById('assist-annotation-sidebar') !== null,
      null,
      { timeout: 30000 }
    );
    await sleep(page, 6000);

    expect(logs.filter(line => line.includes('[Canvas] Adapter loaded'))).toHaveLength(1);
    expect(logs.filter(line => /Failed to load adapter|Denying load/.test(line))).toEqual([]);
    // The adapter is cached after the first import, so a second request is the regression.
    expect(adapterRequests.length).toBeLessThanOrEqual(1);
  });

  test('a page outside the learning platforms asks for no adapter', async ({ context }) => {
    await context.route(`${OFF_LMS_URL}**`, route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: OFF_LMS_HTML })
    );
    const page = await context.newPage();
    const logs = [];
    const adapterRequests = [];
    page.on('console', message => logs.push(message.text()));
    page.on('request', request => {
      if (/assets\/(canvas|moodle|google-classroom)-adapter-.*\.js/.test(request.url())) {
        adapterRequests.push(request.url());
      }
    });
    await page.goto(OFF_LMS_URL);
    await sleep(page, 5000);

    const injected = logs.some(line => line.includes('[AssisT] Ready'));
    test.skip(
      !injected,
      'All Sites Mode is not granted in this profile, so no content script runs off the LMS ' +
        'domains and there is nothing here to regress.'
    );
    expect(adapterRequests).toEqual([]);
    expect(logs.filter(line => /Adapter loaded/.test(line))).toEqual([]);
  });

  test('read aloud survives an anchor jump, and Escape gives the paragraph back', async ({
    context,
    extensionId,
  }) => {
    await store(context, extensionId, {
      features: { tts: { enabled: true, highlightEnabled: true, wordByWordEnabled: true } },
    });
    await routeLms(context);
    const { page } = await openLmsPage(context);
    expect(await page.locator('#second').getAttribute('style')).toBeNull();

    await page.locator('#second').click();
    await page.waitForFunction(() => window.speechSynthesis.speaking, null, { timeout: 20000 });

    await page.locator('#jump').click();
    await sleep(page, 2000);
    expect(await page.evaluate(() => location.hash)).toBe('#later');
    expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.speechSynthesis.speaking, null, { timeout: 15000 });
    await sleep(page, 500);
    expect(await page.locator('.assist-word').count()).toBe(0);
    expect(await page.locator('#second').getAttribute('style')).toBeNull();
  });

  test('the closed annotations sidebar stays out of the tab order', async ({
    context,
    extensionId,
  }) => {
    await store(context, extensionId, { features: { annotations: { enabled: true } } });
    await routeLms(context);
    const { page } = await openLmsPage(context);
    await expect(page.locator('#assist-annotation-sidebar')).toHaveAttribute('inert', '');

    await page.locator('#bottom').focus();
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press('Tab');
      const landedInside = await page.evaluate(() => {
        const panel = document.getElementById('assist-annotation-sidebar');
        return panel !== null && panel.contains(document.activeElement);
      });
      expect(landedInside).toBe(false);
    }
  });

  test('bionic reading keeps an emoji whole, spares AssisT panels, and restores the page', async ({
    context,
    extensionId,
  }) => {
    await store(context, extensionId, { features: { dyslexiaMode: { enabled: false } } });
    await routeLms(context);
    const { page } = await openLmsPage(context);
    const leadBefore = await page.locator('#lead').innerHTML();

    await store(context, extensionId, {
      features: {
        dyslexiaMode: { enabled: true, bionicReading: true, syllableHighlighting: false },
      },
    });
    await page.waitForFunction(() => document.querySelectorAll('.assist-bionic').length > 0, null, {
      timeout: 20000,
    });

    const lead = await page.locator('#lead').textContent();
    expect(lead).toContain(THUMBS_UP);
    expect(lead).not.toContain('�');
    // AssisT's own panels carry their own words; bionic reading must leave every one of them alone.
    const panelText = await page.locator('#assist-annotation-sidebar').textContent();
    expect(panelText.trim().length).toBeGreaterThan(10);
    expect(await page.locator('[id^="assist-"] .assist-bionic').count()).toBe(0);

    await store(context, extensionId, { features: { dyslexiaMode: { enabled: false } } });
    await page.waitForFunction(
      () => document.querySelectorAll('.assist-bionic').length === 0,
      null,
      { timeout: 20000 }
    );
    expect(await page.locator('#lead').innerHTML()).toBe(leadBefore);
  });

  test('the Speed button hands the keyboard to the speed reading dialog', async ({ context }) => {
    await routeLms(context);
    const { page } = await openLmsPage(context);
    await page.locator('#second').click({ clickCount: 3 });
    const speedButton = page.locator(
      '#assist-highlight-menu button[aria-label="Speed Read (RSVP)"]'
    );
    await expect(speedButton).toBeVisible();

    await speedButton.click();

    // The menu used to float over the tool it had just opened, and Tab walked out onto it.
    await expect(page.locator('#assist-highlight-menu')).toHaveCount(0);
    const overlay = page.locator('#assist-rsvp-overlay');
    await expect(overlay).toHaveAttribute('role', 'dialog');
    await expect(overlay).toHaveAttribute('aria-modal', 'true');
    const focusInside = await page.evaluate(
      () =>
        document.getElementById('assist-rsvp-overlay')?.contains(document.activeElement) === true
    );
    expect(focusInside).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('#assist-rsvp-overlay')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement.tagName)).not.toBe('BODY');
  });

  test('the microphone button is one Tab from the field and clear of the next control', async ({
    context,
    extensionId,
  }) => {
    await store(context, extensionId, {
      features: { stt: { enabled: true, floatingButton: true } },
    });
    await routeLms(context);
    const { page } = await openLmsPage(context);
    await page.locator('#draft').focus();
    const mic = page.locator('.assist-stt-mic-button');
    await expect(mic).toBeVisible();

    await page.keyboard.press('Tab');
    const focusedClass = await page.evaluate(() => document.activeElement?.className || '');
    expect(focusedClass).toContain('assist-stt-mic-button');
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('draft');

    expect(
      overlaps(await mic.boundingBox(), await page.locator('#next-control').boundingBox())
    ).toBe(false);

    await page.evaluate(() => window.scrollBy(0, 300));
    await sleep(page, 600);
    await mic.hover();
    const tooltip = page.locator('.assist-stt-mic-tooltip');
    await expect(tooltip).toHaveClass(/visible/);
    const tip = await tooltip.boundingBox();
    const button = await mic.boundingBox();
    // The tooltip used to be positioned from page coordinates, so a scroll left it hundreds of
    // pixels from the button it belongs to.
    expect(Math.abs(tip.y + tip.height - button.y)).toBeLessThan(60);
    expect(Math.abs(tip.x + tip.width / 2 - (button.x + button.width / 2))).toBeLessThan(60);
  });

  test('AssisT puts nothing into a document that is itself the writing surface', async ({
    context,
  }) => {
    await routeLms(context, EDITOR_HOST_HTML);
    const page = await context.newPage();
    await page.goto(EDITOR_URL);
    await page.waitForSelector('#assist-annotation-sidebar', { state: 'attached', timeout: 30000 });

    const editor = page.frameLocator('#editor');
    await editor.locator('body').click();
    await page.keyboard.type('Typed OK.');
    await sleep(page, 2000);

    expect(await editor.locator('body [id^="assist-"]').count()).toBe(0);
    expect((await editor.locator('body').textContent()).trim()).toBe('Typed OK.');
  });

  test('the chip dock keeps off the page’s own buttons and reads in visual order', async ({
    context,
    extensionId,
  }) => {
    await store(context, extensionId, {
      features: { citation: { enabled: true } },
      top: { companionFeatures: allCompanions(true) },
    });
    await routeLms(context);
    const { page } = await openLmsPage(context);
    const dock = page.locator('#assist-companion-dock');
    await expect(dock).toHaveCount(1);
    await expect(dock).toHaveAttribute('role', 'region');
    await expect(dock).toHaveAttribute('aria-label', 'AssisT controls');

    const submitBox = await page.locator('#bottom').boundingBox();
    const atCentre = await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.id, {
      x: submitBox.x + submitBox.width / 2,
      y: submitBox.y + submitBox.height / 2,
    });
    expect(atCentre).toBe('bottom');

    const positions = await dock
      // The put-away handle is hidden while the chips show; everything else must follow the screen.
      .locator('button:not([hidden]), [tabindex]:not([tabindex="-1"])')
      .evaluateAll(elements =>
        elements.map(el => {
          const box = el.getBoundingClientRect();
          // Chips on one row differ by a few pixels of baseline; group them by row.
          return { top: Math.round((box.top + box.height / 2) / 40), left: Math.round(box.left) };
        })
      );
    const visualOrder = [...positions].sort((a, b) => a.top - b.top || a.left - b.left);
    expect(positions).toEqual(visualOrder);
  });

  test('syllable highlighting gives the page’s own markup back', async ({
    context,
    extensionId,
  }) => {
    await store(context, extensionId, { features: { dyslexiaMode: { enabled: false } } });
    await routeLms(context);
    const { page } = await openLmsPage(context);
    const shape = () =>
      page.evaluate(() => {
        const tags = {};
        for (const el of document.querySelectorAll('#content *')) {
          tags[el.tagName] = (tags[el.tagName] || 0) + 1;
        }
        return { tags, abbrTitle: document.getElementById('abbr')?.getAttribute('title') };
      });
    const before = await shape();
    expect(before.abbrTitle).toBe('specific learning difficulty');

    await store(context, extensionId, {
      features: {
        dyslexiaMode: { enabled: true, syllableHighlighting: true, bionicReading: false },
      },
    });
    await page.waitForFunction(
      () => document.querySelectorAll('.assist-syllable').length > 0,
      null,
      {
        timeout: 20000,
      }
    );
    await store(context, extensionId, { features: { dyslexiaMode: { enabled: false } } });
    await page.waitForFunction(
      () => document.querySelectorAll('.assist-syllable').length === 0,
      null,
      { timeout: 20000 }
    );

    expect(await shape()).toEqual(before);
  });

  test('Escape closes the statistics dialog and leaves the badge usable', async ({
    context,
    extensionId,
  }) => {
    // The setting and the key the page watches, as the popup's switch writes them: the popup copies
    // the setting onto the key whenever it opens, so seeding the key alone does not hold.
    await store(context, extensionId, {
      features: { ui_overlay: { show_text_stats_badge: true } },
      top: { textStatsBadgeVisible: true },
    });
    await routeLms(context);
    const { page } = await openLmsPage(context);
    const details = page.locator('#assist-textstats-details');
    await expect(details).toBeVisible();

    await details.click();
    const modal = page.locator('#assist-textstats-modal');
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('assist-textstats-details');

    // The overlay stayed display:flex and swallowed every click behind it (SC 2.1.2).
    const box = await details.boundingBox();
    const atCentre = await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.id, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
    expect(atCentre).toBe('assist-textstats-details');
    await details.click();
    await expect(modal).toBeVisible();
  });

  test('translating English into English says so, and never calls the provider', async ({
    context,
  }) => {
    await routeLms(context);
    const { page } = await openLmsPage(context);
    const providerCalls = [];
    page.on('request', request => {
      if (request.url().includes('mymemory.translated.net')) {
        providerCalls.push(request.url());
      }
    });

    await page.locator('#second').click({ clickCount: 3 });
    await page.locator('#assist-highlight-menu button[aria-label="Translate"]').click();

    const message = page.locator('#assist-translation-message');
    await expect(message).toHaveText(
      'This text is already in English. Pick another language to translate it into.'
    );
    await expect(page.locator('#assist-translation-modal')).toBeVisible();
    expect(providerCalls).toEqual([]);
  });

  test('every support switched off leaves the page as it was', async ({ context, extensionId }) => {
    await store(context, extensionId, {
      features: allSupports(false),
      top: { companionFeatures: allCompanions(false) },
    });
    await routeLms(context);
    const { page } = await openLmsPage(context);
    const baselineBodyChildren = await page.evaluate(() => document.body.children.length);
    const baselineVisible = await visibleAssistIds(page);

    await store(context, extensionId, {
      features: {
        ...allSupports(true),
        dyslexiaMode: { enabled: true, syllableHighlighting: true },
      },
      top: { companionFeatures: allCompanions(true) },
    });
    await sleep(page, 6000);
    expect((await visibleAssistIds(page)).length).toBeGreaterThan(baselineVisible.length);

    await store(context, extensionId, {
      features: allSupports(false),
      top: { companionFeatures: allCompanions(false) },
    });
    await sleep(page, 6000);

    expect(await visibleAssistIds(page)).toEqual(baselineVisible);
    expect(await page.evaluate(() => document.body.children.length)).toBe(baselineBodyChildren);
  });
});
