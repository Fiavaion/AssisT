/**
 * Release pass — the popup, the extension pages and the citation library, in real Chrome.
 *
 * Every case here is a defect overnight release testing found and the fixes closed. They are all
 * here rather than in the jsdom suites for one reason: jsdom could not see them. It lays nothing
 * out, so it never walked a tab order through a section of no height; it does not implement `inert`
 * the way Chrome does; it does not blur an element when its ancestor is re-appended; and it has no
 * colour scheme, no file picker and no real focus ring. One regression tonight passed 6,800 jsdom
 * tests and broke the library in Chrome.
 *
 * Two house rules this file depends on:
 *   - The accordion is hidden behind the Flat view, which drives its controls. A student reaches
 *     every support through Flat, so the cases here do too.
 *   - A card's formatted reference now carries the style's italics, so the title appears twice on a
 *     card. Cards are matched by their heading (`getByRole('heading')`), never by loose text.
 */

import { test, expect, getSettings, openReadyPopup } from './extension-fixture.js';
import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS } from '../../src/utils/keyboard-shortcuts.js';

const POPUP = id => `chrome-extension://${id}/src/popup/popup.html`;
const HELP = id => `chrome-extension://${id}/src/pages/help/help.html`;
const WELCOME = id => `chrome-extension://${id}/src/pages/welcome/welcome.html`;
const DISCOVERY = id => `chrome-extension://${id}/src/pages/discovery/discovery.html`;
const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;

/**
 * Open the popup and wait for the whole start-up and for Flat. Start-up writes every control's
 * state back from settings, so anything done before it has finished is silently undone.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 */
async function openPopup(context, extensionId) {
  const page = await openReadyPopup(context, extensionId, {
    viewport: { width: 400, height: 600 },
  });
  await page.waitForSelector('#flat-root .assist-flat__row', { timeout: 15000 });
  return page;
}

/** What holds the focus, in the few facts every case here asks about. */
const focusNow = page =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      return { body: true };
    }
    const card = active.closest('.assist-cite-card');
    return {
      body: false,
      tag: active.tagName,
      id: active.id,
      label: (active.getAttribute('aria-label') || active.textContent || '').trim().slice(0, 40),
      hidden: !!active.closest('.popup-main'),
      inTray: !!active.closest('.assist-action-tray'),
      cardTitle: card ? card.querySelector('.assist-cite-card__title').textContent : null,
      cards: document.querySelectorAll('.assist-cite-card').length,
    };
  });

/** The tools Flat is showing, best match first. */
const flatRows = page =>
  page.evaluate(() =>
    [...document.querySelectorAll('#flat-root .assist-flat__row')]
      .filter(row => row.offsetParent !== null)
      .map(row => row.dataset.tool)
  );

/** A citation record, minimal but complete enough for every style to format it. */
function record(over = {}) {
  const now = Date.now();
  return {
    type: 'website',
    url: 'https://example.org/source',
    title: 'A source',
    authors: ['Example, Eve'],
    publicationDate: '2024',
    accessDate: '2026-09-22',
    extra: {},
    notes: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

/** Seed records through the same RPC the extension uses, from the library page itself. */
const seed = (page, records) =>
  page.evaluate(async recs => {
    const replies = [];
    for (const r of recs) {
      replies.push(
        await chrome.runtime.sendMessage({ type: 'CITATION_DB_OP', op: 'CIT_ADD', args: [r] })
      );
    }
    return replies;
  }, records);

/** One citation-store operation, unwrapped to the rows. */
async function dbop(page, op, ...args) {
  const reply = await page.evaluate(
    ([name, rest]) => chrome.runtime.sendMessage({ type: 'CITATION_DB_OP', op: name, args: rest }),
    [op, args]
  );
  return reply?.data ?? reply?.result ?? reply;
}

/**
 * Open the library and wait for it to be usable.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 */
async function openLibrary(context, extensionId) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LIBRARY(extensionId));
  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({
    timeout: 15000,
  });
  return page;
}

/** Tab until a card's Remove button has the focus. @returns {boolean} whether it was reached */
async function tabToCardRemove(page, max = 50) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const onRemove = await page.evaluate(() => {
      const active = document.activeElement;
      return (
        !!active &&
        active.tagName === 'BUTTON' &&
        active.textContent.trim() === 'Remove' &&
        !!active.closest('.assist-cite-card')
      );
    });
    if (onRemove) {
      return true;
    }
  }
  return false;
}

test.describe('Release pass: popup and pages', () => {
  test('the hidden accordion holds no tab stops, and its switches cannot be pressed', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(90000);
    const page = await openPopup(context, extensionId);

    // Walk the whole popup by keyboard: every stop is somewhere a student can see.
    await page.locator('#flat-search').focus();
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab');
      const landed = await focusNow(page);
      if (landed.body) {
        break;
      }
      expect(landed.hidden).toBe(false);
    }

    // Speech-to-Text's accordion switch is the one Flat drives. It cannot take the keyboard itself,
    // so it cannot change a setting where the student cannot see it.
    const before = await getSettings(page);
    await page.locator('#stt-enabled').evaluate(box => box.focus());
    expect((await focusNow(page)).id).not.toBe('stt-enabled');
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    expect((await getSettings(page))?.stt?.enabled).toBe(before?.stt?.enabled);
    await page.close();
  });

  test('Advanced Options is a modal dialog with a real tablist', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(90000);
    const page = await openPopup(context, extensionId);

    await page.locator('#btn-options-compact').click();
    const dialog = page.locator('#advanced-options-modal .modal-content');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect((await focusNow(page)).body).toBe(false);
    expect(await page.evaluate(() => !!document.activeElement.closest('.modal-content'))).toBe(
      true
    );

    const selected = page.locator('.modal-tab[aria-selected="true"]');
    const first = await selected.getAttribute('data-tab');
    await page.keyboard.press('ArrowRight');
    await expect(selected).toHaveCount(1);
    expect(await selected.getAttribute('data-tab')).not.toBe(first);
    expect(await page.evaluate(() => document.activeElement.getAttribute('aria-selected'))).toBe(
      'true'
    );

    await page.keyboard.press('Escape');
    await expect(page.locator('#advanced-options-modal')).toHaveCount(0);
    expect((await focusNow(page)).id).toBe('btn-options-compact');
    await page.close();
  });

  test('Show Text Stats comes back on, and goes off on one press', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(90000);
    let page = await openPopup(context, extensionId);
    const label = 'label[for="main-text-stats-toggle"]';
    await page.locator(label).click();
    await expect(page.locator('#main-text-stats-toggle')).toBeChecked();
    await page.waitForTimeout(800);
    await page.close();

    // The switch is on screen from the first paint, and used to be synced only inside the gear's
    // own settings load — so it opened OFF whatever the student had saved.
    page = await openPopup(context, extensionId);
    await expect(page.locator('#main-text-stats-toggle')).toBeChecked();

    await page.locator(label).click();
    await expect(page.locator('#main-text-stats-toggle')).not.toBeChecked();
    await page.waitForTimeout(800);
    expect((await getSettings(page))?.ui_overlay?.show_text_stats_badge).toBe(false);
    await page.close();
  });

  test('a failed settings fetch is announced, with a way out', async ({ context, extensionId }) => {
    test.setTimeout(90000);
    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 600 });
    // Refuse only GET_SETTINGS: everything else the popup asks for still works, which is exactly
    // the shape of a sleeping service worker.
    await page.addInitScript(() => {
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (message, ...rest) => {
        if (message && message.type === 'GET_SETTINGS') {
          return Promise.resolve({ success: false, error: 'boom' });
        }
        return original(message, ...rest);
      };
    });
    await page.goto(POPUP(extensionId));

    const banner = page.locator('#settings-failure-banner');
    await expect(banner).toBeVisible({ timeout: 15000 });
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toContainText(/could not load its settings/i);
    await expect(banner.getByRole('button', { name: 'Retry' })).toBeEnabled();
    await page.close();
  });

  test('Flat search answers what a student asks, best match first', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(90000);
    const page = await openPopup(context, extensionId);
    const search = page.locator('#flat-search');

    // "quiet" used to return nothing at all, with the two supports that make a page quiet sitting
    // right there.
    await search.fill('quiet');
    await page.waitForTimeout(500);
    const quiet = await flatRows(page);
    expect(quiet.some(tool => ['media-control', 'reduced-motion'].includes(tool))).toBe(true);

    // And the ranking is kept: "read to me" once returned fifteen rows with Show Text Stats on top.
    await search.fill('');
    await search.fill('read to me');
    await page.waitForTimeout(500);
    const read = await flatRows(page);
    expect(read[0]).toBe('tts');
    await page.close();
  });

  test('the help page lists every registered shortcut, inside its landmarks', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(60000);
    const page = await context.newPage();
    await page.goto(HELP(extensionId));

    const rowLocator = page.locator('#shortcut-table-body tr[data-shortcut-key]');
    await expect(rowLocator.first()).toBeVisible({ timeout: 15000 });
    const rows = await rowLocator.evaluateAll(trs =>
      trs.map(tr => ({
        key: tr.dataset.shortcutKey,
        action: tr.querySelector('.shortcut-action').textContent,
        keys: tr.querySelector('.shortcut-keys').textContent,
      }))
    );

    // The table was hand-written markup and listed three bindings the extension had dropped.
    expect(rows.map(row => row.key).sort()).toEqual(Object.keys(DEFAULT_SHORTCUTS).sort());
    rows.forEach(row => {
      expect(row.action).toBe(SHORTCUT_LABELS[row.key]);
      expect(row.keys).toContain(DEFAULT_SHORTCUTS[row.key]);
    });

    await expect(page.locator('main#help-main')).toHaveCount(1);
    await expect(page.locator('a.skip-link[href="#help-main"]')).toHaveCount(1);
    await expect(
      page.locator('footer a[href="https://github.com/Fiavaion/AssisT"]').first()
    ).toHaveAttribute('href', 'https://github.com/Fiavaion/AssisT');
    await page.close();
  });

  test('a welcome step can be skipped, and the view change is announced', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(90000);
    const page = await context.newPage();
    await page.goto(WELCOME(extensionId));
    await expect(page.locator('#btn-continue')).toBeVisible({ timeout: 15000 });

    // Ticked from the keyboard: the checkboxes are drawn by the page, and Space is how a student
    // who cannot use a mouse gets through the picker.
    for (const id of ['track-import', 'track-ai-setup']) {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press('Space');
    }
    await page.locator('#btn-continue').click();
    await expect(page.locator('#view-hub')).toBeVisible();
    expect((await focusNow(page)).tag).toMatch(/^H[1-6]$/);

    // A student with no settings file must not be stuck on the import step.
    const importRow = page.locator('#hub-checklist li[data-track-id="import"]');
    const nextRow = page.locator('#hub-checklist li[data-track-id="ai-setup"]');
    await expect(nextRow).toContainText('Available once the step above is finished');
    await importRow.locator('.btn-skip-step').click();
    await expect(importRow).toContainText('(skipped)');
    await expect(nextRow.locator('button').first()).toBeVisible();
    await page.close();
  });

  test('retaking the discovery quiz puts the student back at the top', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120000);
    const page = await context.newPage();
    await page.goto(DISCOVERY(extensionId));
    await expect(page.locator('#btn-start')).toBeVisible({ timeout: 15000 });
    await page.locator('#btn-start').click();
    await expect(page.locator('#screen-questions.active')).toBeVisible();

    for (let i = 0; i < 12; i++) {
      if (await page.locator('#screen-results.active').isVisible()) {
        break;
      }
      await page.locator('#options-container .option-item').first().click();
      await page.locator('#btn-next').click();
      await page.waitForTimeout(250);
    }
    await expect(page.locator('#screen-results.active')).toBeVisible();

    // Retake used to leave focus on BODY with the page still scrolled to the bottom of the results:
    // a heading is not focusable without tabindex="-1", so the page's own focus() did nothing.
    await page.locator('#btn-retake').click();
    await page.waitForTimeout(500);
    const landed = await focusNow(page);
    expect(landed.body).toBe(false);
    expect(landed.tag).toMatch(/^H[1-6]$/);
    // The heading is brought into view; the page need not be at exactly zero.
    const top = await page.evaluate(() => document.activeElement.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(await page.evaluate(() => window.innerHeight));
    await page.close();
  });
});

test.describe('Release pass: citations', () => {
  test('a new citation saves, lands the student on it, and refuses an empty title', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120000);
    const page = await openLibrary(context, extensionId);
    const title = 'A book with nothing but a title';

    await page.getByRole('button', { name: 'New citation', exact: true }).click();
    await page.waitForSelector('[role="dialog"]');
    await page.getByLabel(/^Title/).fill(title);
    await page.getByLabel(/^Type$/).selectOption('book');
    await page.getByRole('button', { name: /^Save/ }).click();

    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    // The wizard now writes the record before it closes, so the card appears while the dialog still
    // holds the focus; the page hands it over afterwards.
    await page.waitForTimeout(600);
    expect((await focusNow(page)).cardTitle).toBe(title);

    // Nothing typed, or a title cleared: the dialog stays open with everything still in it, rather
    // than closing on a source that was never stored.
    await page.getByRole('button', { name: 'New citation', exact: true }).click();
    await page.waitForSelector('[role="dialog"]');
    await page.getByLabel(/^Title/).fill('Then cleared again');
    await page.getByLabel(/^Title/).fill('');
    await page.getByRole('button', { name: /^Save/ }).click();
    await page.waitForTimeout(600);
    await expect(page.locator('[role="dialog"]')).toHaveCount(1);
    const problem = page.locator('.assist-cite-wizard__problems');
    await expect(problem).toBeVisible();
    await expect(problem).toHaveAttribute('role', 'alert');
    await expect(problem).toContainText(/not saved yet/i);
    await page.close();
  });

  test('a captured quote and locator survive the round trip to storage', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120000);
    const page = await openLibrary(context, extensionId);
    await seed(page, [record({ title: 'Quoted source', quote: 'Q1', locator: '12' })]);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Quoted source' })).toBeVisible({
      timeout: 15000,
    });

    const all = await dbop(page, 'CIT_GET_ALL');
    const saved = all.find(citation => citation.title === 'Quoted source');
    expect(saved.quote).toBe('Q1');
    expect(saved.locator).toBe('12');

    // The student's own words from the source are shown on the card, flagged as not theirs.
    await expect(page.locator('.assist-cite-card__quote')).toContainText('Q1');
    await expect(page.locator('.assist-cite-card__quotelabel')).toContainText('12');
    await page.close();
  });

  test('a keyboard Remove leaves the focus somewhere in the list', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120000);
    const page = await openLibrary(context, extensionId);
    await seed(
      page,
      ['First source', 'Second source', 'Third source'].map(t => record({ title: t }))
    );
    await page.reload();
    await expect(page.locator('.assist-cite-card')).toHaveCount(3, { timeout: 15000 });

    await page.getByLabel('Search your citations').focus();
    expect(await tabToCardRemove(page)).toBe(true);
    await page.keyboard.press('Enter');

    // The storage echo arrives a moment after the removal and re-appends every surviving card,
    // which in Chrome blurs whatever was focused inside them. jsdom does not model that blur.
    await page.waitForTimeout(1000);
    const landed = await focusNow(page);
    expect(landed.body).toBe(false);
    expect(landed.tag).toBe('BUTTON');
    if (landed.cards > 0) {
      expect(landed.label).toBe('Remove');
      expect(landed.cardTitle).not.toBeNull();
    }
    await page.close();
  });

  test('an empty import file is refused once, in words, with no tick', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(120000);
    const page = await openLibrary(context, extensionId);

    // Two owners each toasted for one import, so every import was announced twice — and a file with
    // nothing in it arrived as a green tick.
    await page.locator('#assist-lib-import-input').setInputFiles({
      name: 'empty.ris',
      mimeType: 'application/x-research-info-systems',
      buffer: Buffer.from(''),
    });
    await page.waitForTimeout(1500);

    const toasts = page.locator('.citation-toast');
    await expect(toasts).toHaveCount(1);
    await expect(toasts).toContainText('No citations were found in empty.ris.');
    await expect(toasts).toHaveAttribute('role', 'alert');
    await expect(page.locator('.citation-toast-success')).toHaveCount(0);
    await page.close();
  });

  test('the undo tray can be reached, left, and is still there to use', async ({
    context,
    extensionId,
  }) => {
    test.setTimeout(150000);
    const page = await openLibrary(context, extensionId);
    await seed(page, [record({ title: 'Removable source' })]);
    await page.reload();
    await expect(page.locator('.assist-cite-card')).toHaveCount(1, { timeout: 15000 });

    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.locator('.assist-action-tray')).toBeVisible();

    // The tray used to sit 10-24 Tab presses from the top of the page and live for 8 seconds, which
    // is no Undo at all for a keyboard-only student.
    await page.keyboard.press('Alt+Shift+U');
    await page.waitForTimeout(400);
    expect((await focusNow(page)).inTray).toBe(true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const returned = await focusNow(page);
    expect(returned.inTray).toBe(false);
    expect(returned.body).toBe(false);

    await page.waitForTimeout(10000);
    await expect(page.locator('.assist-action-tray')).toBeVisible();
    await page.close();
  });

  test('the library follows a student who has asked for dark', async ({ context, extensionId }) => {
    test.setTimeout(90000);
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(LIBRARY(extensionId));
    await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({
      timeout: 15000,
    });

    // The citation guide followed prefers-color-scheme and this page did not, so opening the library
    // from the guide threw a full-brightness page at someone who had asked for dark.
    const luminance = await page.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.body)
        .backgroundColor.match(/\d+(\.\d+)?/g)
        .map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    });
    expect(luminance).toBeLessThan(0.2);
    await page.close();
  });
});
