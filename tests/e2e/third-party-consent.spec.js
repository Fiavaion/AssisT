/**
 * Consent before anything leaves the device (ADR 0006, ADR 0009), in real Chrome.
 *
 * The first time a student uses the dictionary or translation on a course page, the question is
 * asked in a small extension window: it names the service and says what would be sent. Allow asks
 * Chrome for the service's host and records the yes in the same press, and the lookup completes;
 * Not now (or Escape, or closing the window) sends nothing and the feature says so, with Allow in
 * place. The window belongs to the extension, so the page cannot read, cover or press it. jsdom
 * cannot show any of this honestly: which element really has focus, what paints, and that the page
 * has no way to answer.
 *
 * Chrome's own permission prompt cannot be pressed by a test. So most tests run against a build
 * that already holds the dictionary and MyMemory hosts (fixture `grantedHosts`): the question is
 * still asked, because the student has not answered it, and Allow then needs no Chrome prompt. One
 * describe runs without the hosts, to show the window asks the same and a no sends nothing.
 *
 * Every request leaves from the service worker. The services are answered with context.route, which
 * sees worker requests when PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS is set, and records each
 * call here.
 */

import { test, expect } from './extension-fixture.js';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

const LMS_ORIGIN = 'https://consent.instructure.com';
const PAGE_URL = `${LMS_ORIGIN}/courses/1/pages/reading`;
const CONSENT_PAGE = '/src/pages/consent/consent.html';

const DICTIONARY_HOST = 'https://api.dictionaryapi.dev/*';
const MYMEMORY_HOST = 'https://api.mymemory.translated.net/*';

const PAGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Reading - Canvas</title>
<style>body { margin: 0; padding: 24px; font: 16px/1.6 system-ui, sans-serif; }</style></head>
<body><main><h1>Reading</h1>
<div class="description user_content">
<p id="para">People with <span id="word">dyslexia</span> may read more slowly.</p>
<p id="sentence">Good morning to everyone in the class.</p>
</div></main></body></html>`;

const DEFINITION = [
  {
    word: 'dyslexia',
    phonetics: [],
    meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A test definition of dyslexia' }] }],
  },
];

/** Calls each context's third-party routes answered, in order. */
const callsByContext = new WeakMap();

/** Answer the four services from here, record every call, and keep the run off the network. */
async function routeThirdParty(context) {
  const calls = [];
  callsByContext.set(context, calls);
  await context.route(/dictionaryapi|mymemory|crossref|semanticscholar/, route => {
    const url = route.request().url();
    calls.push(url);
    const body = url.includes('dictionaryapi')
      ? DEFINITION
      : { responseStatus: 200, responseData: { translatedText: 'Bonjour à toute la classe.' } };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

function thirdPartyCalls(context) {
  return callsByContext.get(context) || [];
}

/** The student's recorded answers, one storage key per service (utils/consent.js). */
async function storedConsent(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  const all = await page.evaluate(() => chrome.storage.local.get(null));
  await page.close();
  const answers = {};
  Object.entries(all).forEach(([key, value]) => {
    if (key.startsWith('assist_consent_') && !key.startsWith('assist_consent_window')) {
      answers[key.slice('assist_consent_'.length)] = value;
    }
  });
  return answers;
}

async function openPage(context) {
  await context.route(`${LMS_ORIGIN}/**`, route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PAGE_HTML })
  );
  await routeThirdParty(context);
  const page = await context.newPage();
  await page.goto(PAGE_URL);
  await page.waitForSelector('#assist-annotation-sidebar', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(2500);
  return page;
}

async function define(page) {
  await page.locator('#word').dblclick();
  await page.locator('#assist-highlight-menu button[aria-label="Dictionary Lookup"]').click();
}

const isConsentWindow = candidate => candidate.url().includes(CONSENT_PAGE);

/**
 * Do what should open the consent window, and hand back the window once its question is drawn.
 * @returns {Promise<import('@playwright/test').Page>}
 */
async function askedInWindow(context, act, title) {
  const opened = context.waitForEvent('page', { predicate: isConsentWindow, timeout: 20000 });
  await act();
  const win = await opened;
  await expect(win.locator('h1')).toHaveText(title, { timeout: 15000 });
  return win;
}

/** No consent window opens within a moment of the act. */
async function noWindowFor(context, act) {
  const before = context.pages().filter(isConsentWindow).length;
  await act();
  await new Promise(resolve => setTimeout(resolve, 1500));
  expect(context.pages().filter(isConsentWindow).length).toBe(before);
}

async function answerAndWaitForClose(win, act) {
  const closed = win.waitForEvent('close', { timeout: 15000 });
  await act();
  await closed;
}

const allowIn = win => win.getByRole('button', { name: 'Allow', exact: true });
const notNowIn = win => win.getByRole('button', { name: 'Not now' });

test.describe('Consent before a lookup leaves the device', () => {
  test.use({ grantedHosts: [DICTIONARY_HOST, MYMEMORY_HOST] });

  test('first use asks in its own window, names the service and the word, and sends nothing yet', async ({
    context,
  }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');

    await expect(win.locator('main')).toContainText('Free Dictionary');
    await expect(win.locator('main')).toContainText('dyslexia');
    // Focus starts on the choice that sends nothing.
    await expect(notNowIn(win)).toBeFocused();
    // The page says where the question is, in a polite status (SC 4.1.3).
    await expect(page.locator('[data-assist-consent-window-status]')).toContainText(
      'separate window'
    );
    expect(thirdPartyCalls(context)).toEqual([]);
  });

  test('Allow completes the lookup the student asked for', async ({ context, extensionId }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');

    await answerAndWaitForClose(win, () => allowIn(win).click());

    await expect(page.locator('#assist-dictionary-modal')).toContainText(
      'A test definition of dyslexia'
    );
    // Focus came back into the dictionary, not to the top of the page.
    expect(
      await page.evaluate(() =>
        document.getElementById('assist-dictionary-modal').contains(document.activeElement)
      )
    ).toBe(true);
    await expect(page.locator('[data-assist-consent-window-status]')).toHaveCount(0);
    const calls = thirdPartyCalls(context);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/entries/en/dyslexia');
    expect((await storedConsent(context, extensionId)).dictionary.granted).toBe(true);
  });

  test('Not now sends nothing, says so with Allow in place, and does not ask again', async ({
    context,
    extensionId,
  }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');
    await answerAndWaitForClose(win, () => notNowIn(win).click());

    const modal = page.locator('#assist-dictionary-modal');
    await expect(modal).toContainText('Nothing was sent');
    const allow = modal.getByRole('button', { name: 'Allow Free Dictionary' });
    await expect(allow).toBeFocused();
    expect(thirdPartyCalls(context)).toEqual([]);
    expect((await storedConsent(context, extensionId)).dictionary.granted).toBe(false);

    // Close and look the word up again: no question this time, the same plain message.
    await page.keyboard.press('Escape');
    await noWindowFor(context, () => define(page));
    await expect(modal).toContainText('Nothing was sent');
    expect(thirdPartyCalls(context)).toEqual([]);

    // Allow in the message asks again, where the yes is given; that completes the lookup.
    const again = await askedInWindow(
      context,
      () => modal.getByRole('button', { name: 'Allow Free Dictionary' }).click(),
      'Use Free Dictionary?'
    );
    await expect(again.locator('main')).toContainText('Earlier you chose not to allow this');
    expect(thirdPartyCalls(context)).toEqual([]);
    await answerAndWaitForClose(again, () => allowIn(again).click());
    await expect(modal).toContainText('A test definition of dyslexia');
    expect(thirdPartyCalls(context)).toHaveLength(1);
  });

  test('Escape is "not now", and focus returns into the dictionary', async ({
    context,
    extensionId,
  }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');

    await answerAndWaitForClose(win, () => win.keyboard.press('Escape'));

    await expect(
      page.locator('#assist-dictionary-modal').getByRole('button', { name: 'Allow Free Dictionary' })
    ).toBeFocused();
    expect(thirdPartyCalls(context)).toEqual([]);
    expect((await storedConsent(context, extensionId)).dictionary.granted).toBe(false);

    // Closing the dictionary gives focus back to the words the student selected.
    await page.keyboard.press('Escape');
    await expect(page.locator('#assist-dictionary-modal')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.getElementById('para').contains(document.activeElement))
    ).toBe(true);
  });

  test('closing the window is no answer: nothing is sent and nothing is recorded', async ({
    context,
    extensionId,
  }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');

    await win.close();

    await expect(page.locator('#assist-dictionary-modal')).toContainText('Nothing was sent');
    expect(thirdPartyCalls(context)).toEqual([]);
    expect((await storedConsent(context, extensionId)).dictionary).toBeUndefined();
  });

  test('Allow works from the keyboard', async ({ context }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');
    await expect(notNowIn(win)).toBeFocused();

    await win.keyboard.press('Shift+Tab');
    await expect(allowIn(win)).toBeFocused();
    await answerAndWaitForClose(win, () => win.keyboard.press('Enter'));

    await expect(page.locator('#assist-dictionary-modal')).toContainText(
      'A test definition of dyslexia'
    );
  });

  test('asking again while the window is open brings that window forward, not a second one', async ({
    context,
  }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');

    await page.bringToFront();
    await page.keyboard.press('Escape');
    await noWindowFor(context, () => define(page));
    expect(context.pages().filter(isConsentWindow)).toHaveLength(1);
    await expect(page.locator('[data-assist-consent-window-status]')).toContainText(
      'separate window'
    );
    expect(thirdPartyCalls(context)).toEqual([]);
    await answerAndWaitForClose(win, () => notNowIn(win).click());
  });

  test('the page cannot reach the question, and cannot say yes for the student', async ({
    context,
    extensionId,
  }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');

    // The host page's own script, in the main world, tries every route it has: it finds no
    // question in its own document, no extension messaging, and a forged answer goes nowhere.
    const reached = await page.evaluate(() => {
      const forged = { type: 'CONSENT_WINDOW_ANSWER', request: 'anything', answer: 'granted' };
      window.postMessage(forged, '*');
      document.dispatchEvent(new CustomEvent('CONSENT_WINDOW_ANSWER', { detail: forged }));
      return {
        panel: document.querySelectorAll('[data-assist-consent-panel]').length,
        allowButtons: [...document.querySelectorAll('button')].filter(
          b => b.textContent.trim() === 'Allow'
        ).length,
        runtime: typeof globalThis.chrome?.runtime?.sendMessage,
      };
    });
    await page.waitForTimeout(500);

    expect(reached).toEqual({ panel: 0, allowButtons: 0, runtime: 'undefined' });
    // Still open, still asking, still unanswered.
    expect(win.isClosed()).toBe(false);
    await expect(win.locator('h1')).toHaveText('Use Free Dictionary?');
    expect(thirdPartyCalls(context)).toEqual([]);
    expect(await storedConsent(context, extensionId)).toEqual({});
    await answerAndWaitForClose(win, () => notNowIn(win).click());
  });

  test('a right-click on Allow is not a yes', async ({ context, extensionId }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');

    await allowIn(win).click({ button: 'right' });
    await win.waitForTimeout(300);
    expect(win.isClosed()).toBe(false);
    await answerAndWaitForClose(win, () => win.keyboard.press('Escape'));

    expect(thirdPartyCalls(context)).toEqual([]);
    expect((await storedConsent(context, extensionId)).dictionary?.granted).not.toBe(true);
  });

  test('the window keeps its words readable with text spacing overridden (SC 1.4.12)', async ({
    context,
  }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');

    await win.addStyleTag({
      content:
        '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; ' +
        'word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
    });

    const clipped = await win.evaluate(
      () =>
        [...document.querySelectorAll('h1, p, button, span')].filter(
          el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
        ).length
    );
    expect(clipped).toBe(0);
    const box = await allowIn(win).boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await answerAndWaitForClose(win, () => notNowIn(win).click());
  });

  test('translation asks about MyMemory, and Not now says nothing was sent', async ({ context }) => {
    const page = await openPage(context);
    await page.locator('#sentence').click({ clickCount: 3 });
    await page.locator('#assist-highlight-menu button[aria-label="Translate"]').click();
    const modal = page.locator('#assist-translation-modal');
    await expect(modal).toBeVisible();
    // The dialog translates on its own 100ms after opening, into the last language used (English
    // here, so nothing is sent). Choosing French before that settles would hand French to that
    // first pass instead of to the button.
    await expect(modal.locator('#assist-translation-message')).toContainText('already in English');
    await expect(modal.locator('#assist-translation-translate-btn')).toBeEnabled();
    await modal.locator('#assist-translation-target-lang').selectOption('fr');

    const win = await askedInWindow(
      context,
      () => modal.locator('#assist-translation-translate-btn').click(),
      'Use MyMemory?'
    );
    await expect(win.locator('main')).toContainText('Good morning');
    await expect(win.locator('main')).not.toContainText('whole page');
    // The note that the question is in another window is said inside the translation dialog,
    // where a screen reader can hear it past aria-modal.
    await expect(modal.locator('[data-assist-consent-window-status]')).toContainText(
      'separate window'
    );
    await answerAndWaitForClose(win, () => notNowIn(win).click());

    await expect(modal.locator('[data-assist-consent-notice]')).toContainText('Nothing was sent');
    await expect(modal.getByRole('button', { name: 'Allow MyMemory' })).toBeVisible();
    expect(thirdPartyCalls(context)).toEqual([]);

    const again = await askedInWindow(
      context,
      () => modal.getByRole('button', { name: 'Allow MyMemory' }).click(),
      'Use MyMemory?'
    );
    await answerAndWaitForClose(again, () => allowIn(again).click());
    await expect(modal.locator('#assist-translation-translated-text')).toHaveText(
      'Bonjour à toute la classe.'
    );
    expect(thirdPartyCalls(context)).toHaveLength(1);
  });
});

test.describe('Consent when Chrome does not hold the host yet', () => {
  // The build as installed: the host comes only with a yes. A test cannot press Chrome's own
  // prompt, so this covers everything up to it: the same question, and a no that sends nothing.
  test('the window asks the same question, and Not now sends nothing and records a no', async ({
    context,
    extensionId,
  }) => {
    const page = await openPage(context);
    const win = await askedInWindow(context, () => define(page), 'Use Free Dictionary?');
    await expect(notNowIn(win)).toBeFocused();

    await answerAndWaitForClose(win, () => notNowIn(win).click());

    await expect(page.locator('#assist-dictionary-modal')).toContainText('Nothing was sent');
    expect(thirdPartyCalls(context)).toEqual([]);
    expect((await storedConsent(context, extensionId)).dictionary.granted).toBe(false);
  });

  test('outside a dialog, the page note can be dismissed, so it never has to cover a control', async ({
    context,
    extensionId,
  }) => {
    // Translate Page asks with no feature dialog open, so its note sits on the page (SC 2.4.11).
    // It is started the way the popup's button starts it: a TRANSLATE_PAGE message to the tab.
    const page = await openPage(context);
    const win = await askedInWindow(
      context,
      async () => {
        const ext = await context.newPage();
        await ext.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
        await ext.evaluate(async url => {
          const [tab] = await chrome.tabs.query({ url });
          // Not awaited: the reply comes only once the question is answered.
          chrome.tabs.sendMessage(tab.id, { type: 'TRANSLATE_PAGE', targetLang: 'fr' }).catch(() => {});
        }, PAGE_URL);
        await ext.close();
      },
      'Use MyMemory?'
    );
    const note = page.locator('[data-assist-consent-window-note]');
    await expect(note).toContainText('separate window');
    await page.bringToFront();
    await note.getByRole('button', { name: 'Dismiss' }).click();
    await expect(note).toHaveCount(0);
    await answerAndWaitForClose(win, () => notNowIn(win).click());
    expect(thirdPartyCalls(context)).toEqual([]);
  });
});
