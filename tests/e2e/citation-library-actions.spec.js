/**
 * The library's per-source and whole-library actions as a student meets them: editing a source in
 * the wizard, the wizard refusing a source with no title, deleting from the trash for good, an undo
 * that arrives after the record is gone, tag filtering, every export format read back from the
 * downloaded file, an RIS round trip, a broken import, duplicate removal that must keep the
 * student's own quote, and the citation guide's two ways into the library.
 *
 * State is seeded through CITATION_DB_OP from the library page and read back the same way, so each
 * test checks what is stored as well as what is shown.
 */

import { readFile } from 'node:fs/promises';
import { test, expect } from './extension-fixture.js';

const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;
const GUIDE = id => `chrome-extension://${id}/src/pages/citation-guide/guide.html`;

function record(title, over = {}) {
  const now = Date.now();
  return {
    type: 'website',
    url: `https://example.org/${encodeURIComponent(title)}`,
    title,
    authors: ['Example, Eve'],
    publicationDate: '2024',
    accessDate: '2026-09-04',
    extra: {},
    tags: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
    projectId: null,
    ...over,
  };
}

const NUMPY = {
  type: 'journal',
  url: 'https://doi.org/10.1038/s41586-020-2649-2',
  authors: ['Harris, Charles R.', 'Millman, K. Jarrod'],
  publicationDate: '2020-09-16',
  publisher: 'Springer',
  siteName: 'Nature',
  doi: '10.1038/s41586-020-2649-2',
  extra: { volume: '585', issue: '7825', pages: '357-362' },
};

const KAHNEMAN = {
  type: 'book',
  url: '',
  authors: ['Kahneman, Daniel'],
  publicationDate: '2011',
  publisher: 'Farrar, Straus and Giroux',
  isbn: '9780374275631',
  extra: { place: 'New York' },
};

/** One storage call through the extension's own relay. Throws on a refused call. */
async function dbOp(page, op, args = []) {
  const reply = await page.evaluate(
    ([o, a]) => chrome.runtime.sendMessage({ type: 'CITATION_DB_OP', op: o, args: a }),
    [op, args]
  );
  if (!reply || reply.ok !== true) {
    throw new Error(`${op} failed: ${reply && reply.error}`);
  }
  return reply.result;
}

async function waitForLibrary(page) {
  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });
}

async function openLibrary(context, extensionId) {
  const page = await context.newPage();
  await page.goto(LIBRARY(extensionId));
  await waitForLibrary(page);
  return page;
}

/**
 * Add records (oldest first, a second apart so the library's newest-first order is known), then
 * reload so the page paints them from storage. Returns the stored ids by title.
 */
async function seed(page, records) {
  const ids = {};
  let t = Date.now() - records.length * 1000;
  for (const r of records) {
    t += 1000;
    ids[r.title] = await dbOp(page, 'CIT_ADD', [{ createdAt: t, updatedAt: t, ...r }]);
  }
  await page.reload();
  await waitForLibrary(page);
  return ids;
}

/** Wait for every running animation to finish before touching anything inside it. */
async function settle(page) {
  await page.waitForFunction(() =>
    document.getAnimations().every(a => a.playState !== 'running')
  );
}

const rail = page => page.getByRole('navigation', { name: 'Collections and tags' });
const cardHeading = (page, title) => page.getByRole('heading', { name: title, exact: true });
const card = (page, title) =>
  page.locator('li.assist-cite-card').filter({ has: cardHeading(page, title) });
const tray = (page, text) => page.locator('.assist-action-tray').filter({ hasText: text });

/** Choose a format in the header's export menu and return the downloaded file's name and text. */
async function exportAll(page, label) {
  const download = page.waitForEvent('download', { timeout: 15000 });
  await page.getByRole('combobox', { name: 'Export all citations as' }).selectOption({ label });
  const file = await download;
  return { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
}

/** Hand the import input a file built in memory, named as the student's file would be. */
async function importFile(page, name, content, mimeType = 'text/plain') {
  await page.locator('#assist-lib-import-input').setInputFiles({
    name,
    mimeType,
    buffer: Buffer.from(content, 'utf8'),
  });
}

/** A small RFC 4180 reader: quoted fields may hold commas, doubled quotes and line breaks. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Every non-blank line of an RIS file must be a tag line: two characters, two spaces, a hyphen. */
function risLinesWithoutTag(text) {
  return text
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .filter(line => !/^[A-Z][A-Z0-9] {2}- ?/.test(line));
}

const squash = s => String(s || '').replace(/\s+/g, ' ').trim();

test.describe('citation library actions', () => {
  test('Edit opens the wizard on the source, and a changed title, note and tags persist after reload', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const ids = await seed(page, [record('Array programming with NumPy', NUMPY)]);
    await expect(cardHeading(page, 'Array programming with NumPy')).toBeVisible({ timeout: 15000 });

    const editBtn = card(page, 'Array programming with NumPy').getByRole('button', { name: 'Edit', exact: true });
    await editBtn.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Edit citation' });
    await expect(dialog).toBeVisible();
    await settle(page);

    const title = dialog.getByRole('textbox', { name: /^Title/ });
    await expect(title).toHaveValue('Array programming with NumPy');
    await title.fill('Array programming with NumPy, revised');

    const next = dialog.getByRole('button', { name: 'Next', exact: true });
    const note = dialog.getByLabel('Why you saved it (your words)', { exact: true });
    for (let step = 0; step < 4 && !(await note.isVisible()); step++) {
      await next.click();
      await settle(page);
    }
    await expect(note).toBeVisible();
    await note.fill('Core source for the methods chapter');
    await dialog.getByLabel('Tags', { exact: true }).fill('arrays, numpy');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(dialog).toBeHidden();
    const edited = card(page, 'Array programming with NumPy, revised');
    await expect(edited).toBeVisible();
    await expect(cardHeading(page, 'Array programming with NumPy')).toHaveCount(0);
    await expect(edited).toContainText('Your note: Core source for the methods chapter');
    await expect(rail(page).getByRole('button', { name: 'arrays', exact: true })).toBeVisible();
    // The keyboard student is put back on the control that opened the wizard.
    await expect(edited.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();

    await page.reload();
    await waitForLibrary(page);
    await expect(cardHeading(page, 'Array programming with NumPy, revised')).toBeVisible({ timeout: 15000 });

    const stored = await dbOp(page, 'CIT_GET', [ids['Array programming with NumPy']]);
    expect(stored.title).toBe('Array programming with NumPy, revised');
    expect(stored.notes).toBe('Core source for the methods chapter');
    expect(stored.tags).toEqual(['arrays', 'numpy']);
    // Fields the student did not touch are left exactly as they were.
    expect(stored.doi).toBe(NUMPY.doi);
    expect(stored.authors).toEqual(NUMPY.authors);
    expect(stored.extra).toMatchObject({ volume: '585', issue: '7825', pages: '357-362' });
    expect(await dbOp(page, 'CIT_GET_ALL', [{}])).toHaveLength(1);
    await page.close();
  });

  test('the wizard refuses to save a source with no title, new or edited, and says why at the field', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);

    await page.getByRole('button', { name: 'New citation', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Add a citation' });
    await expect(dialog).toBeVisible();
    await settle(page);
    let title = dialog.getByRole('textbox', { name: /^Title/ });

    for (const typed of ['', '   ']) {
      await title.fill(typed);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Not saved yet — there is one thing to fix first.')).toBeVisible();
      await expect(dialog.getByText('Give the source a title, so you can find it again.')).toBeVisible();
      await expect(title).toHaveAttribute('aria-invalid', 'true');
      await expect(title).toBeFocused();
    }
    expect(await dbOp(page, 'CIT_GET_ALL', [{}])).toHaveLength(0);

    // A title is all it takes: the same dialog then saves.
    await title.fill('A source with a title');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(cardHeading(page, 'A source with a title')).toBeVisible();
    expect(await dbOp(page, 'CIT_GET_ALL', [{}])).toHaveLength(1);

    // Emptying the title of a saved source is refused the same way, and the stored title stands.
    await card(page, 'A source with a title').getByRole('button', { name: 'Edit', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Edit citation' });
    await expect(dialog).toBeVisible();
    await settle(page);
    title = dialog.getByRole('textbox', { name: /^Title/ });
    await title.fill('');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const [stored] = await dbOp(page, 'CIT_GET_ALL', [{}]);
    expect(stored.title).toBe('A source with a title');
    await page.close();
  });

  test('Delete permanently in the trash asks first, keeps the source when refused, and destroys only that one', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const ids = await seed(page, [record('Kept source'), record('Doomed source'), record('Other removed')]);
    await dbOp(page, 'CIT_DELETE', [ids['Doomed source']]);
    await dbOp(page, 'CIT_DELETE', [ids['Other removed']]);
    await page.reload();
    await waitForLibrary(page);

    await rail(page).getByRole('button', { name: /recently removed \(2\)/i }).click();
    const doomed = card(page, 'Doomed source');
    await expect(doomed).toBeVisible();

    let asked = '';
    page.once('dialog', d => {
      asked = d.message();
      d.dismiss();
    });
    await doomed.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expect.poll(() => asked).toBe('Delete “Doomed source” permanently? This cannot be undone.');
    await expect(doomed).toBeVisible();
    expect(await dbOp(page, 'CIT_GET_TRASHED')).toHaveLength(2);

    page.once('dialog', d => d.accept());
    await doomed.getByRole('button', { name: 'Delete permanently', exact: true }).click();
    await expect(tray(page, 'Deleted “Doomed source” permanently')).toBeVisible();
    await expect(cardHeading(page, 'Doomed source')).toHaveCount(0);
    await expect(cardHeading(page, 'Other removed')).toBeVisible();
    await expect(rail(page).getByRole('button', { name: /recently removed \(1\)/i })).toBeVisible();

    const trashed = await dbOp(page, 'CIT_GET_TRASHED');
    expect(trashed.map(c => c.title)).toEqual(['Other removed']);
    expect((await dbOp(page, 'CIT_GET_ALL', [{}])).map(c => c.title)).toEqual(['Kept source']);
    await page.close();
  });

  test('Undo after the removed source was purged meanwhile says it cannot be restored and brings nothing back', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const ids = await seed(page, [record('Kept source'), record('Doomed source')]);
    await expect(cardHeading(page, 'Doomed source')).toBeVisible({ timeout: 15000 });

    await card(page, 'Doomed source').getByRole('button', { name: 'Remove', exact: true }).click();
    const undo = tray(page, 'Removed “Doomed source”').getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeVisible();

    // Another tab empties the trash inside the undo window.
    await dbOp(page, 'CIT_PURGE', [ids['Doomed source']]);

    await undo.click();
    const failed = tray(page, 'That citation was deleted permanently and cannot be restored');
    await expect(failed).toBeVisible();
    await expect(cardHeading(page, 'Doomed source')).toHaveCount(0);
    await expect(tray(page, /Restored “Doomed source”/)).toHaveCount(0);
    expect((await dbOp(page, 'CIT_GET_ALL', [{}])).map(c => c.title)).toEqual(['Kept source']);
    expect(await dbOp(page, 'CIT_GET_TRASHED')).toHaveLength(0);
    await page.close();
  });

  test('a tag chip filters the library to the sources carrying that tag and says how many', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, [
      record('Attention in class', { tags: ['adhd', 'memory'] }),
      record('Rehearsal effects', { tags: ['memory'] }),
      record('Reading speed', { tags: ['dyslexia'] }),
    ]);
    await expect(cardHeading(page, 'Reading speed')).toBeVisible({ timeout: 15000 });
    await expect(rail(page).getByRole('heading', { name: 'Tags', exact: true })).toBeVisible();

    await rail(page).getByRole('button', { name: 'adhd', exact: true }).click();
    await expect(cardHeading(page, 'Attention in class')).toBeVisible();
    await expect(cardHeading(page, 'Rehearsal effects')).toHaveCount(0);
    await expect(cardHeading(page, 'Reading speed')).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search your citations' })).toHaveValue('adhd');
    await expect(rail(page).getByRole('status')).toHaveText('Filtered to adhd. Showing 1 of 3 citations.');

    await rail(page).getByRole('button', { name: 'memory', exact: true }).click();
    await expect(cardHeading(page, 'Attention in class')).toBeVisible();
    await expect(cardHeading(page, 'Rehearsal effects')).toBeVisible();
    await expect(cardHeading(page, 'Reading speed')).toHaveCount(0);
    await expect(rail(page).getByRole('status')).toHaveText('Filtered to memory. Showing 2 of 3 citations.');

    await page.getByRole('searchbox', { name: 'Search your citations' }).fill('');
    await expect(cardHeading(page, 'Reading speed')).toBeVisible();
    await page.close();
  });

  /** Three records: two live (one with commas in its title and notes), one in the trash. */
  async function seedForExport(page) {
    const ids = await seed(page, [
      record('Array programming with NumPy', {
        ...NUMPY,
        tags: ['arrays', 'python'],
        notes: 'Key source, cite in the methods section',
      }),
      record('Thinking, Fast and Slow', KAHNEMAN),
      record('Removed source'),
    ]);
    await dbOp(page, 'CIT_DELETE', [ids['Removed source']]);
    await page.reload();
    await waitForLibrary(page);
    await expect(cardHeading(page, 'Thinking, Fast and Slow')).toBeVisible({ timeout: 15000 });
  }

  const EXPORTS = [
    {
      label: 'RIS (.ris)',
      file: 'citations.ris',
      check: text => {
        expect(risLinesWithoutTag(text)).toEqual([]);
        const records = text.split(/^ER {2}- ?$/m).filter(chunk => chunk.trim() !== '');
        expect(records).toHaveLength(2);
        const numpy = records.find(r => r.includes('TI  - Array programming with NumPy'));
        const book = records.find(r => r.includes('TI  - Thinking, Fast and Slow'));
        expect(numpy).toMatch(/^TY {2}- JOUR$/m);
        expect(numpy).toMatch(/^AU {2}- Harris, Charles R\.$/m);
        expect(numpy).toMatch(/^AU {2}- Millman, K\. Jarrod$/m);
        expect(numpy).toMatch(/^DO {2}- 10\.1038\/s41586-020-2649-2$/m);
        expect(numpy).toMatch(/^VL {2}- 585$/m);
        expect(numpy).toMatch(/^SP {2}- 357$/m);
        expect(numpy).toMatch(/^EP {2}- 362$/m);
        expect(numpy).toMatch(/^KW {2}- arrays$/m);
        expect(numpy).toMatch(/^N1 {2}- Key source, cite in the methods section$/m);
        expect(book).toMatch(/^TY {2}- BOOK$/m);
        expect(book).toMatch(/^SN {2}- 9780374275631$/m);
        expect(book).toMatch(/^CY {2}- New York$/m);
      },
    },
    {
      label: 'CSL-JSON (.json)',
      file: 'citations.csl.json',
      check: text => {
        const items = JSON.parse(text);
        expect(Array.isArray(items)).toBe(true);
        expect(items).toHaveLength(2);
        const numpy = items.find(i => i.title === 'Array programming with NumPy');
        const book = items.find(i => i.title === 'Thinking, Fast and Slow');
        expect(numpy).toMatchObject({
          type: 'article-journal',
          DOI: NUMPY.doi,
          'container-title': 'Nature',
          volume: '585',
          issue: '7825',
          page: '357-362',
          note: 'Key source, cite in the methods section',
        });
        expect(numpy.author[0]).toMatchObject({ family: 'Harris' });
        expect(numpy.author).toHaveLength(2);
        expect(numpy.issued['date-parts'][0].map(Number)).toEqual([2020, 9, 16]);
        expect(book).toMatchObject({ type: 'book', ISBN: '9780374275631' });
        expect(book.author[0]).toMatchObject({ family: 'Kahneman' });
      },
    },
    {
      label: 'CSV (.csv)',
      file: 'citations.csv',
      check: text => {
        const rows = parseCsv(text).filter(r => !(r.length === 1 && r[0] === ''));
        expect(rows[0]).toEqual([
          'Title',
          'Authors',
          'Year',
          'Type',
          'URL',
          'DOI',
          'Publisher',
          'Journal',
          'Volume',
          'Issue',
          'Pages',
          'Access Date',
          'Tags',
          'Notes',
        ]);
        const data = rows.slice(1);
        expect(data).toHaveLength(2);
        for (const row of data) {
          expect(row).toHaveLength(14);
        }
        const numpy = data.find(r => r[0] === 'Array programming with NumPy');
        const book = data.find(r => r[0] === 'Thinking, Fast and Slow');
        expect(numpy[1]).toBe('Harris, Charles R.; Millman, K. Jarrod');
        expect(numpy[2]).toBe('2020');
        expect(numpy[5]).toBe(NUMPY.doi);
        expect(numpy[7]).toBe('Nature');
        expect(numpy[10]).toBe('357-362');
        expect(numpy[12]).toBe('arrays, python');
        expect(numpy[13]).toBe('Key source, cite in the methods section');
        expect(book[1]).toBe('Kahneman, Daniel');
        expect(book[2]).toBe('2011');
        expect(book[6]).toBe('Farrar, Straus and Giroux');
      },
    },
    {
      label: 'AssisT JSON (.json)',
      file: 'citations.json',
      check: text => {
        const data = JSON.parse(text);
        expect(data).toMatchObject({ source: 'AssisT Extension', count: 2 });
        expect(data.citations).toHaveLength(2);
        const numpy = data.citations.find(c => c.title === 'Array programming with NumPy');
        const book = data.citations.find(c => c.title === 'Thinking, Fast and Slow');
        expect(numpy).toMatchObject({
          type: 'journal',
          doi: NUMPY.doi,
          authors: NUMPY.authors,
          tags: ['arrays', 'python'],
          notes: 'Key source, cite in the methods section',
        });
        expect(numpy.extra).toMatchObject({ volume: '585', issue: '7825', pages: '357-362' });
        expect(book).toMatchObject({ type: 'book', isbn: '9780374275631', authors: ['Kahneman, Daniel'] });
      },
    },
    {
      label: 'Reference list, plain text (.txt)',
      file: 'bibliography.txt',
      check: text => {
        // The chosen style's reference list: one entry per source, a blank line between them.
        const entries = text.trim().split(/\n\s*\n/);
        expect(entries).toHaveLength(2);
        expect(text).toMatch(/Harris, C/);
        expect(text).toMatch(/Kahneman, D/);
        expect(text).toContain('https://doi.org/' + NUMPY.doi);
      },
    },
  ];

  for (const { label, file, check } of EXPORTS) {
    test(`export as ${label} downloads every live record, well formed, and nothing from the trash`, async ({
      context,
      extensionId,
    }) => {
      const page = await openLibrary(context, extensionId);
      await seedForExport(page);

      const { name, text } = await exportAll(page, label);
      expect(name).toBe(file);
      expect(text).not.toContain('Removed source');
      check(text);
      await expect(page.getByText(/Exported 2 citations as /)).toBeVisible();
      await page.close();
    });
  }

  test('an RIS round trip keeps a note with a line break whole, in one record', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const note = 'Key argument on p. 4\nPS - also see chapter 5';
    await seed(page, [record('Array programming with NumPy', { ...NUMPY, notes: note })]);
    await expect(cardHeading(page, 'Array programming with NumPy')).toBeVisible({ timeout: 15000 });

    const { text } = await exportAll(page, 'RIS (.ris)');
    // Zotero and EndNote read an untagged line as damage, not as the rest of the note.
    expect(risLinesWithoutTag(text)).toEqual([]);

    for (const c of await dbOp(page, 'CIT_GET_ALL', [{}])) {
      await dbOp(page, 'CIT_DELETE', [c.id]);
    }
    await dbOp(page, 'CIT_EMPTY_TRASH');
    await page.reload();
    await waitForLibrary(page);
    await expect(cardHeading(page, 'Array programming with NumPy')).toHaveCount(0);

    await importFile(page, 'citations.ris', text, 'application/x-research-info-systems');
    await expect(page.getByText('Imported 1 citation from citations.ris.')).toBeVisible({ timeout: 10000 });
    await expect(cardHeading(page, 'Array programming with NumPy')).toHaveCount(1);

    const all = await dbOp(page, 'CIT_GET_ALL', [{}]);
    expect(all).toHaveLength(1);
    const [back] = all;
    expect(back.title).toBe('Array programming with NumPy');
    expect(back.doi).toBe(NUMPY.doi);
    expect(back.authors).toEqual(NUMPY.authors);
    expect(squash(back.notes)).toContain('Key argument on p. 4');
    expect(squash(back.notes)).toContain('PS - also see chapter 5');
    await page.close();
  });

  test('a file AssisT cannot read is refused in words, and the library is left as it was', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, [record('Existing source')]);
    await expect(cardHeading(page, 'Existing source')).toBeVisible({ timeout: 15000 });

    const cases = [
      {
        name: 'broken.json',
        content: '{"citations": [ {"title": "Half a rec',
        says: 'AssisT could not read broken.json. It may be incomplete, or saved in a different format from the one its name promises. Nothing in your library has changed.',
      },
      {
        name: 'settings.json',
        content: '{"theme": "dark", "fontSize": 18}',
        says: 'AssisT could not read settings.json. It may be incomplete, or saved in a different format from the one its name promises. Nothing in your library has changed.',
      },
      {
        name: 'essay-notes.docx',
        content: 'PK\u0003\u0004 not really a document',
        says: 'AssisT can import .ris, .bib, .csl and .json files. essay-notes.docx is not one of those.',
      },
      {
        name: 'empty.ris',
        content: '\n\n',
        says: 'No citations were found in empty.ris.',
      },
    ];

    for (const { name, content, says } of cases) {
      await importFile(page, name, content);
      // A refusal is announced as a problem (role="alert"), never as a success.
      await expect(page.getByRole('alert').filter({ hasText: says })).toBeVisible({ timeout: 10000 });
    }

    const all = await dbOp(page, 'CIT_GET_ALL', [{}]);
    expect(all.map(c => c.title)).toEqual(['Existing source']);
    await expect(page.locator('li.assist-cite-card')).toHaveCount(1);
    await page.close();
  });

  test('a JSON file with one good and one broken entry imports the good one and names the other', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const content = JSON.stringify([
      { title: 'Good imported source', authors: ['Doe, Jane'], url: 'https://example.org/good', publicationDate: '2022' },
      { authors: ['Nobody, No'], url: 'https://example.org/untitled' },
    ]);

    await importFile(page, 'mixed.json', content, 'application/json');
    await expect(
      page.getByText('Imported 1 citation from mixed.json. 1 entry could not be read: entry 2.')
    ).toBeVisible({ timeout: 10000 });
    await expect(cardHeading(page, 'Good imported source')).toBeVisible();

    const all = await dbOp(page, 'CIT_GET_ALL', [{}]);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ title: 'Good imported source', authors: ['Doe, Jane'] });
    await page.close();
  });

  test('an RIS record with no title is reported to the student, not dropped in silence', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const ris = [
      'TY  - JOUR',
      'TI  - Titled record',
      'AU  - Doe, Jane',
      'PY  - 2021',
      'ER  - ',
      '',
      'TY  - JOUR',
      'AU  - Roe, Richard',
      'PY  - 2019',
      'DO  - 10.1000/untitled',
      'ER  - ',
      '',
    ].join('\n');

    await importFile(page, 'two-records.ris', ris, 'application/x-research-info-systems');
    await expect(cardHeading(page, 'Titled record')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Imported 1 citation from two-records\.ris\. 1 entry could not be read/)).toBeVisible();
    expect(await dbOp(page, 'CIT_GET_ALL', [{}])).toHaveLength(1);
    await page.close();
  });

  test('Remove duplicates keeps the quote held only by the second copy', async ({ context, extensionId }) => {
    const page = await openLibrary(context, extensionId);
    const quote = 'NumPy is the primary array programming library for the Python language.';
    // Library order is newest first, so the newer, bare copy is the first of the pair and the older
    // copy carrying the student's quote is the second.
    await seed(page, [
      record('Array programming with NumPy', { ...NUMPY, quote, locator: '357' }),
      record('Array programming with NumPy', { ...NUMPY }),
    ]);
    await expect(cardHeading(page, 'Array programming with NumPy')).toHaveCount(2, { timeout: 15000 });

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Remove duplicates', exact: true }).click();

    await expect(cardHeading(page, 'Array programming with NumPy')).toHaveCount(1);
    await expect(card(page, 'Array programming with NumPy').locator('blockquote')).toHaveText(quote);

    const live = await dbOp(page, 'CIT_GET_ALL', [{}]);
    expect(live).toHaveLength(1);
    expect(live[0].quote).toBe(quote);
    expect(live[0].locator).toBe('357');
    await page.close();
  });

  test('both "Open your citation library" buttons on the guide open the library, by mouse and by keyboard', async ({
    context,
    extensionId,
  }) => {
    const guide = await context.newPage();
    await guide.goto(GUIDE(extensionId));
    const isLibrary = p => p.url().includes('/src/pages/citation-library/library.html');

    const banner = guide.locator('#btn-guide-open-library');
    const footer = guide.locator('#btn-guide-open-library-footer');
    await expect(banner).toHaveText('Open your citation library');
    await expect(footer).toHaveText('Open your citation library');

    const first = context.waitForEvent('page', { predicate: isLibrary, timeout: 10000 });
    await banner.click();
    const libraryOne = await first;
    await waitForLibrary(libraryOne);

    const second = context.waitForEvent('page', { predicate: isLibrary, timeout: 10000 });
    await footer.focus();
    await guide.keyboard.press('Enter');
    const libraryTwo = await second;
    await waitForLibrary(libraryTwo);

    await expect(guide.locator('#guide-status')).toHaveText('');
    await libraryOne.close();
    await libraryTwo.close();
    await guide.close();
  });
});
