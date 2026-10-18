/**
 * The library as a student uses it across a project: records already saved, styles switched,
 * references copied for a word processor, the essay checked against the list, the library
 * exported, and the whole thing still usable with five hundred records and a broken one.
 *
 * Records are seeded through the same RPC the extension uses, from the library page itself.
 */

import { test, expect } from './extension-fixture.js';

const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;

function record(over = {}) {
  const now = Date.now();
  return {
    type: 'journal',
    url: 'https://doi.org/10.1038/s41586-020-2649-2',
    title: 'Array programming with NumPy',
    authors: ['Harris, Charles R.', 'Millman, K. Jarrod'],
    publicationDate: '2020-09-16',
    accessDate: '2026-09-04',
    publisher: 'Springer',
    siteName: 'Nature',
    doi: '10.1038/s41586-020-2649-2',
    isbn: '',
    issn: '',
    extra: { journal: 'Nature', volume: '585', issue: '7825', pages: '357-362' },
    notes: '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    projectId: null,
    ...over,
  };
}

async function seed(page, records) {
  return page.evaluate(async recs => {
    const replies = [];
    for (const r of recs) {
      replies.push(
        await chrome.runtime.sendMessage({ type: 'CITATION_DB_OP', op: 'CIT_ADD', args: [r] })
      );
    }
    return replies;
  }, records);
}

/** Capture what the page writes to the clipboard without needing a clipboard permission. */
const CLIPBOARD_TAP = `
  window.__clip = [];
  const fake = {
    async write(items) {
      for (const item of items) {
        const flavours = {};
        for (const type of item.types) flavours[type] = await (await item.getType(type)).text();
        window.__clip.push(flavours);
      }
    },
    async writeText(text) { window.__clip.push({ 'text/plain': text }); },
  };
  Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true });
`;

async function openLibrary(context, extensionId) {
  const page = await context.newPage();
  await page.addInitScript(CLIPBOARD_TAP);
  await page.goto(LIBRARY(extensionId));
  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });
  return page;
}

test.describe('citation library flows', () => {
  test('switching style re-renders every card and copy gives rich and plain flavours', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const replies = await seed(page, [
      record(),
      record({
        type: 'book',
        title: 'Thinking, Fast and Slow',
        authors: ['Kahneman, Daniel'],
        publicationDate: '2011',
        publisher: 'Farrar, Straus and Giroux',
        siteName: '',
        doi: '',
        url: '',
        isbn: '9780374275631',
        extra: { place: 'New York' },
      }),
    ]);
    expect(replies.every(r => r?.ok)).toBe(true);
    await page.reload();
    await page.addInitScript(CLIPBOARD_TAP);
    await expect(page.getByText('Array programming with NumPy').first()).toBeVisible({ timeout: 15000 });

    // Harvard is the default: author, year, no "(2020)." APA form.
    await page.getByRole('radio', { name: /APA/ }).click();
    await expect(page.getByText(/Harris, C\. R\., & Millman, K\. J\. \(2020\)/).first()).toBeVisible();

    await page.getByRole('radio', { name: /MLA/ }).click();
    await expect(page.getByText(/Harris, Charles R\., and K\. Jarrod Millman/).first()).toBeVisible();
    // The list re-renders once per store emit; let it settle before pressing a card button.
    await page.waitForTimeout(400);

    // The Harris card's own button: the list is newest first, and two records seeded in the same
    // moment can come back in either order.
    await page
      .locator('li.assist-cite-card', { has: page.getByRole('heading', { name: /Array programming/ }) })
      .getByRole('button', { name: 'Copy reference' })
      .click();
    await page.waitForTimeout(300);
    const clip = await page.evaluate(() => window.__clip);
    expect(clip.length).toBeGreaterThan(0);
    const last = clip[clip.length - 1];
    expect(last['text/plain']).toMatch(/Harris/);
    expect(last['text/html']).toMatch(/<i>|<em>/);

    await page
      .locator('li.assist-cite-card', { has: page.getByRole('heading', { name: /Array programming/ }) })
      .getByRole('button', { name: 'Copy in-text' })
      .click();
    await page.waitForTimeout(300);
    const inText = (await page.evaluate(() => window.__clip)).pop();
    expect(inText['text/plain']).toMatch(/Harris/);

    await page.getByRole('button', { name: 'Copy bibliography' }).click();
    await page.waitForTimeout(300);
    const bib = (await page.evaluate(() => window.__clip)).pop();
    expect(bib['text/plain']).toMatch(/Harris/);
    expect(bib['text/plain']).toMatch(/Kahneman/);
    expect(bib['text/plain'].indexOf('Harris')).toBeLessThan(bib['text/plain'].indexOf('Kahneman'));

    // The style choice is a per-course fact: it survives a reload.
    await page.reload();
    await expect(page.getByRole('radio', { name: /MLA/ })).toHaveAttribute('aria-checked', 'true', {
      timeout: 15000,
    });
    await page.close();
  });

  test('search narrows to the matching record and clears back', async ({ context, extensionId }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, [record(), record({ title: 'Deep learning', authors: ['LeCun, Yann'] })]);
    await page.reload();
    await expect(page.getByText('Deep learning').first()).toBeVisible({ timeout: 15000 });

    const search = page.getByRole('searchbox', { name: /search your citations/i });
    await search.fill('numpy');
    await expect(page.getByText('Array programming with NumPy').first()).toBeVisible();
    await expect(page.getByText('Deep learning')).toHaveCount(0);
    await search.fill('');
    await expect(page.getByText('Deep learning').first()).toBeVisible();
    await page.close();
  });

  test('the essay check names a citation missing from the list and a source never cited', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, [record(), record({ title: 'Never cited', authors: ['Smith, Jane'], publicationDate: '2019' })]);
    await page.reload();
    await expect(page.getByText('Never cited').first()).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Check your essay' }).click();
    const essay = page.getByLabel(/your essay text/i);
    await essay.fill(
      'Array programming underpins modern science (Harris et al., 2020). Others disagree (Jones, 2018).'
    );
    await page.getByRole('button', { name: 'Check citations' }).click();

    const panel = page.locator('[class*="reference-check"], [class*="refcheck"]').first();
    await expect(panel).toContainText(/Jones/, { timeout: 10000 });
    await expect(panel).toContainText(/Smith/);
    await page.close();
  });

  test('export produces a BibTeX file holding every record', async ({ context, extensionId }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, [record(), record({ title: 'Second source', authors: ['Doe, John'] })]);
    await page.reload();
    await expect(page.getByText('Second source').first()).toBeVisible({ timeout: 15000 });

    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.getByRole('combobox', { name: /export all citations as/i }).selectOption({ label: 'BibTeX (.bib)' });
    const file = await download;
    const text = await (await import('node:fs/promises')).readFile(await file.path(), 'utf8');
    expect(text).toMatch(/@article\{/i);
    expect(text).toMatch(/@book\{|@misc\{|@article\{/);
    expect(text).toMatch(/Second source/);
    expect(text).toMatch(/NumPy/);
    await page.close();
  });

  for (const [format, file] of [
    ['BibTeX', 'zotero-export.bib'],
    ['RIS', 'zotero-export.ris'],
  ]) {
    test(`a Zotero ${format} export imports cleanly, and importing it twice leaves no duplicates`, async ({
      context,
      extensionId,
    }) => {
      const page = await openLibrary(context, extensionId);
      const fixture = new URL(`./fixtures/${file}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

      await page.locator('#assist-lib-import-input').setInputFiles(fixture);
      // Zotero wraps protected capitals in braces; the student must never see them.
      await expect(page.getByText('Array programming with NumPy', { exact: true }).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText('Thinking, fast and slow', { exact: true }).first()).toBeVisible();
      // Harvard prints initials, so prove the particle survived through search instead.
      await page.getByRole('searchbox', { name: /search your citations/i }).fill('van der Walt');
      await expect(page.getByText('Array programming with NumPy', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Thinking, fast and slow', { exact: true })).toHaveCount(0);
      await page.getByRole('searchbox', { name: /search your citations/i }).fill('');
      await expect(page.getByText('Thinking, fast and slow', { exact: true }).first()).toBeVisible();

      await page.locator('#assist-lib-import-input').setInputFiles(fixture);
      await page.waitForTimeout(800);
      page.once('dialog', d => d.accept());
      await page.getByRole('button', { name: 'Remove duplicates' }).click();
      await page.waitForTimeout(800);
      // Titles also appear in italics inside the reference, so count card headings only.
      await expect(page.getByRole('heading', { name: 'Thinking, fast and slow', exact: true })).toHaveCount(1);
      await expect(page.getByText('Array programming with NumPy', { exact: true })).toHaveCount(1);
      await page.close();
    });
  }

  test('five hundred records and one broken record: the library still opens and searches', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const many = Array.from({ length: 500 }, (_, i) =>
      record({ title: `Source number ${i + 1}`, authors: [`Author${i + 1}, A.`], doi: '', url: `https://example.org/${i + 1}` })
    );
    many.push({ title: '', authors: [], url: '', type: 'journal' });
    const replies = await seed(page, many);
    // The seeding is checked first, so a store that refused good records cannot pass for a slow load.
    expect(replies.slice(0, 500).every(reply => reply && reply.ok === true)).toBe(true);

    // Card headings, not any text: a title also appears in the formatted reference and in the style
    // preview, and a match on one of those is not the list having loaded.
    const heading = title => page.getByRole('heading', { name: title, exact: true });
    const started = Date.now();
    await page.reload();
    await expect(heading('Source number 1')).toBeVisible({ timeout: 20000 });
    await expect(heading('Source number 500')).toBeVisible({ timeout: 20000 });
    const elapsed = Date.now() - started;
    expect(elapsed, `the library took ${elapsed} ms to show 500 records`).toBeLessThan(10000);

    const search = page.getByRole('searchbox', { name: /search your citations/i });
    await search.fill('number 250');
    await expect(heading('Source number 250')).toBeVisible();
    await expect(heading('Source number 251')).toHaveCount(0);
    await expect(page.getByText('could not load')).toHaveCount(0);
    await page.close();
  });
});
