/**
 * Every way a student captures a citation from a course page, in real Chrome against the built
 * extension: the capture bar's "Cite this source" by mouse and by keyboard, the highlight menu's
 * Cite, capturing a page already saved (Edit, and Add quote with words selected), the save tray's
 * Undo, a save that fails, two captures close together, and the voice trigger.
 *
 * The page is a fake journal article served at an instructure.com address (so the manifest injects
 * the content script) with Highwire meta tags; Crossref is answered from a fixture and consent for
 * the `citations` destination is granted first, so a lookup behind the ADR 0006 gate or in front
 * of it gives the same record. What is stored is read back through the store's own relay.
 *
 * Crossref's host is an optional permission that comes with the consent (ADR 0009), so the build
 * under test already holds it, as it would after a student allowed Crossref. Without it, a capture
 * asks the consent question in its own window first; that asking is covered by
 * third-party-consent.spec.js, and this file is about what capture does once Crossref is allowed.
 */

import { test, expect } from './extension-fixture.js';
import {
  SOURCE,
  PARAGRAPHS,
  articleHtml,
  routeLms,
  routeCrossref,
  openExtensionPage,
  allCitations,
  rpc,
  setConsent,
  settle,
  tabTo,
  contentWorld,
  captureButton,
  selectParagraph,
} from './fixtures/citation-harness.js';

const ORIGIN = 'https://citation-routes.instructure.com';
const PAGE_URL = `${ORIGIN}/courses/1/pages/working-memory`;
const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;

/** The newest tray: an old one lingers for 250 ms while it animates out. */
const tray = page => page.locator('.assist-action-tray').last();

/**
 * Serve the article, answer Crossref, grant consent, and open the page with the capture bar up.
 * @returns {Promise<{page, ext, cite, hits, errors}>}
 */
async function openArticle(context, extensionId, { html = articleHtml() } = {}) {
  const hits = await routeCrossref(context);
  await routeLms(context, ORIGIN, html);
  const ext = await openExtensionPage(context, extensionId);
  await setConsent(ext, 'citations', true);

  const page = await context.newPage();
  const errors = [];
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(PAGE_URL);
  const cite = await captureButton(page);
  return { page, ext, cite, hits, errors };
}

/** The one stored record for the article, failing if there is not exactly one. */
async function onlyRecord(ext) {
  const stored = await allCitations(ext);
  expect(
    stored,
    `expected one record, found: ${JSON.stringify(stored.map(c => c.title))}`
  ).toHaveLength(1);
  return stored[0];
}

/** What every capture of the article must have stored, whatever Crossref added. */
function expectArticleRecord(saved) {
  expect(saved.title).toBe(SOURCE.title);
  expect(saved.doi).toBe(SOURCE.doi);
  expect(saved.authors.join(' | ')).toMatch(/Snell/);
  expect(saved.authors.join(' | ')).toMatch(/Okafor/);
  expect(saved.siteName).toBe(SOURCE.journal);
  expect(String(saved.publicationDate)).toMatch(/^2021/);
}

test.use({ grantedHosts: ['https://api.crossref.org/*'] });

test.beforeEach(() => {
  test.setTimeout(120000);
});

test.describe('capturing a citation from a course page', () => {
  // Fails if: the button does nothing on mousedown, the record is not stored, the metadata is not
  // read from the meta tags, or the library does not show what was stored.
  test('Cite this source by mouse files a correct record and the library shows it', async ({
    context,
    extensionId,
  }) => {
    const { page, ext, cite } = await openArticle(context, extensionId);

    await cite.click();
    await expect(tray(page)).toContainText('Saved to Library', { timeout: 15000 });
    await expect(tray(page)).toContainText(SOURCE.title);

    expectArticleRecord(await onlyRecord(ext));

    const library = await context.newPage();
    await library.goto(LIBRARY(extensionId));
    await expect(library.getByRole('heading', { name: SOURCE.title })).toBeVisible({
      timeout: 15000,
    });
    await expect(library.getByText(/Snell/).first()).toBeVisible();
    await expect(library.getByText(SOURCE.journal).first()).toBeVisible();
  });

  // Fails if: the button cannot be reached with Tab, Enter does not activate it, or the tray takes
  // focus away from the button (it must never steal focus).
  test('Cite this source by keyboard alone files the same record', async ({
    context,
    extensionId,
  }) => {
    const { page, ext, cite } = await openArticle(context, extensionId);

    // Start from the top of the page, as a student arriving by keyboard does.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await tabTo(page, cite, 60);
    await page.keyboard.press('Enter');
    await expect(tray(page)).toContainText('Saved to Library', { timeout: 15000 });
    expect(await cite.evaluate(el => el === document.activeElement)).toBe(true);

    expectArticleRecord(await onlyRecord(ext));
  });

  // Fails if: the menu has no Cite action, the action saves nothing, or the highlighted words are
  // not kept as the record's quote.
  test('the highlight menu Cite action saves the page with the selection as its quote', async ({
    context,
    extensionId,
  }) => {
    const ext = await openExtensionPage(context, extensionId);
    await ext.evaluate(
      () =>
        new Promise(resolve => {
          chrome.storage.local.set(
            {
              highlightMenuSettings: {
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
                autoHideDelay: 0,
              },
            },
            resolve
          );
        })
    );
    const { page } = await openArticle(context, extensionId);

    const box = await page.locator('#para1').boundingBox();
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    const selected = (await page.evaluate(() => window.getSelection().toString())).trim();
    expect(selected.length).toBeGreaterThan(10);

    const menu = page.locator('#assist-highlight-menu');
    await expect(menu).toBeVisible({ timeout: 5000 });
    await settle(page);
    await menu.getByRole('button', { name: 'Save as Citation' }).click();

    await expect(tray(page)).toContainText('Saved to Library', { timeout: 15000 });
    const saved = await onlyRecord(ext);
    expectArticleRecord(saved);
    expect(saved.quote.replace(/\s+/g, ' ')).toBe(selected.replace(/\s+/g, ' '));
  });

  // Fails if: a second capture of the same page stores a second record, the tray does not say it is
  // already saved, Edit does not open the saved record, Add quote writes over an earlier quote, or
  // the quote lands on a new record instead of the saved one.
  test('capturing a saved page says so, and Add quote appends to the saved record', async ({
    context,
    extensionId,
  }) => {
    const { page, ext, cite } = await openArticle(context, extensionId);

    await cite.click();
    await expect(tray(page)).toContainText('Saved to Library', { timeout: 15000 });

    // Nothing selected: the one action is Edit, and it opens the record already saved.
    await cite.click();
    await expect(tray(page)).toContainText('Already saved for this page', { timeout: 15000 });
    await tray(page).getByRole('button', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit citation' });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Title (required)')).toHaveValue(SOURCE.title);
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);

    // Words selected: the action adds them to the saved record.
    const first = await selectParagraph(page, 'para1');
    await cite.focus();
    await page.keyboard.press('Enter');
    await expect(tray(page)).toContainText('Already saved for this page', { timeout: 15000 });
    await tray(page)
      .getByRole('button', { name: 'Add the highlighted words to the source already saved' })
      .click();
    await expect(tray(page)).toContainText('Quote added to the source you already saved');
    expect((await onlyRecord(ext)).quote).toBe(first.trim());

    // A second quote is appended, never written over the first.
    const second = await selectParagraph(page, 'para2');
    await cite.focus();
    await page.keyboard.press('Enter');
    await expect(tray(page)).toContainText('Already saved for this page', { timeout: 15000 });
    await tray(page)
      .getByRole('button', { name: 'Add the highlighted words to the source already saved' })
      .click();
    await expect(tray(page)).toContainText('Quote added to the source you already saved');
    const saved = await onlyRecord(ext);
    expect(saved.quote).toContain(PARAGRAPHS[0]);
    expect(saved.quote).toContain(PARAGRAPHS[1]);
    expect(saved.quote.indexOf(first.trim())).toBeLessThan(saved.quote.indexOf(second.trim()));
  });

  // Fails if: Undo only soft-deletes (the record would sit in Recently removed), leaves the record
  // in the library, or gives no confirmation.
  test('the save tray Undo removes the just-saved citation completely', async ({
    context,
    extensionId,
  }) => {
    const { page, ext, cite } = await openArticle(context, extensionId);

    await cite.click();
    await expect(tray(page)).toContainText('Saved to Library', { timeout: 15000 });
    expect(await allCitations(ext)).toHaveLength(1);

    await tray(page).getByRole('button', { name: 'Undo saving this citation' }).click();
    await expect(tray(page)).toContainText('Citation removed', { timeout: 10000 });

    expect(await allCitations(ext)).toHaveLength(0);
    expect(await rpc(ext, 'CIT_GET_TRASHED')).toHaveLength(0);
  });

  // Forces the store to refuse the write by standing in for the relay inside the content script's
  // own world (the one realm whose chrome.runtime the capture path calls); src is untouched.
  // Fails if: the failure is silent, the student is told it saved, or anything is stored.
  test('a save the store refuses shows a visible, announced error and stores nothing', async ({
    context,
    extensionId,
  }) => {
    const { page, ext, cite } = await openArticle(context, extensionId);

    const world = await contentWorld(page);
    const stubbed = await world(() => {
      const real = chrome.runtime.sendMessage.bind(chrome.runtime);
      const stub = (message, ...rest) =>
        message && message.type === 'CITATION_DB_OP' && message.op === 'CIT_ADD'
          ? Promise.resolve({ ok: false, error: 'The library could not be written' })
          : real(message, ...rest);
      try {
        chrome.runtime.sendMessage = stub;
      } catch {
        // Read-only binding: fall through to defineProperty.
      }
      if (chrome.runtime.sendMessage !== stub) {
        Object.defineProperty(chrome.runtime, 'sendMessage', {
          value: stub,
          configurable: true,
          writable: true,
        });
      }
      return chrome.runtime.sendMessage === stub;
    });
    expect(stubbed, 'the harness could not stand in for the store relay in the content world').toBe(
      true
    );

    await cite.click();
    const alert = page.getByRole('alert').filter({ hasText: 'Failed to save citation' });
    await expect(alert).toBeVisible({ timeout: 15000 });
    await expect(alert).toContainText('The library could not be written');
    await expect(page.locator('.assist-action-tray', { hasText: 'Saved to' })).toHaveCount(0);
    expect(await allCitations(ext)).toHaveLength(0);
  });

  // Voice capture: the test browser cannot recognise speech, so webkitSpeechRecognition is replaced
  // in the content script's world by a fake that reports it started when start() is called and
  // lets the test deliver final transcripts. Dictation consent is pre-granted as a stored answer.
  // Everything else is the real path: voice session, STTController, trigger match, draft snapshot
  // of the reading spot, wizard.
  // Fails if: the toggle does not report its state once the recogniser starts, an ordinary sentence
  // is taken as a trigger, "cite this" is not, or the wizard does not open prefilled from the page.
  test('the voice trigger opens the wizard prefilled from the page', async ({
    context,
    extensionId,
  }) => {
    const { page, ext, errors } = await openArticle(context, extensionId);
    await setConsent(ext, 'dictation', true);

    const world = await contentWorld(page);
    await world(() => {
      class FakeRecognition {
        start() {
          window.__fakeRecognition = this;
          setTimeout(() => {
            this.onstart && this.onstart();
            this.onaudiostart && this.onaudiostart();
          }, 0);
        }
        stop() {
          setTimeout(() => this.onend && this.onend(), 0);
        }
        abort() {
          this.stop();
        }
      }
      window.webkitSpeechRecognition = FakeRecognition;
    });
    const say = transcript =>
      world(text => {
        const result = Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal: true });
        window.__fakeRecognition.onresult({ resultIndex: 0, results: [result] });
      }, transcript);

    const voice = page
      .getByRole('group', { name: 'Capture a citation' })
      .getByRole('button', { name: /^Voice capture/ });
    await expect(voice).toHaveAttribute('aria-pressed', 'false');
    await voice.focus();
    await page.keyboard.press('Enter');
    await expect(voice).toHaveAttribute('aria-pressed', 'true');
    await expect(voice).toHaveAccessibleName('Voice capture on — activate to turn off');

    const wizard = page.getByRole('dialog', { name: 'Add a citation' });
    await say('the weather is lovely today');
    await expect(wizard).toHaveCount(0);
    await say('okay cite this');

    await expect(
      wizard,
      `voice capture did not open the wizard; console errors: ${errors.join(' || ')}`
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(wizard.getByLabel('Title (required)')).toHaveValue(`${SOURCE.title} - Canvas`);
  });
});
