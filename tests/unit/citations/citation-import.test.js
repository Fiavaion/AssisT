/**
 * @jest-environment jsdom
 *
 * importCitations() — the facts of an import, and nothing said out loud.
 *
 * Overnight testing found every import announced twice (this module toasted AND the library page's
 * change handler did), a refused file announced as a green "✓ Imported 0 citations", and a screen
 * reader reading out `s.map is not a function`. The wording now belongs to the page alone, so what
 * is asserted here is: an outcome for every kind of file, no toast ever, and no throw ever.
 */

import { importCitations } from '../../../src/features/citations/citation-export.js';
import { CitationStorageRPC } from '../../../src/features/citations/citation-rpc.js';
import { showSuccessToast, showErrorToast } from '../../../src/features/citations/citation-toast.js';

jest.mock('../../../src/features/citations/citation-rpc.js', () => ({
  CitationStorageRPC: { add: jest.fn() },
}));

jest.mock('../../../src/features/citations/citation-toast.js', () => ({
  showSuccessToast: jest.fn(),
  showErrorToast: jest.fn(),
}));

/** A file-like object: importCitations reads only the name and the text. */
function fileOf(name, content) {
  return { name, text: async () => content };
}

const GOOD_BIB = `@article{one,
  title = {A Good Article},
  author = {Smith, Jane},
  year = {2021},
  journal = {Journal of Testing},
  doi = {10.1000/one}
}
@book{two,
  title = {A Good Book},
  author = {Doe, John},
  year = {2019},
  publisher = {Academic Press},
  url = {https://example.com/book}
}`;

beforeEach(() => {
  // resetMocks wipes factory implementations, so the storage double is armed per test.
  CitationStorageRPC.add.mockResolvedValue({ id: 'saved' });
});

afterEach(() => {
  expect(showSuccessToast).not.toHaveBeenCalled();
  expect(showErrorToast).not.toHaveBeenCalled();
});

describe('importCitations() — what came back', () => {
  test('a good .bib reports what it added and names the file', async () => {
    const outcome = await importCitations(fileOf('zotero-export.bib', GOOD_BIB));

    expect(outcome).toMatchObject({
      filename: 'zotero-export.bib',
      added: 2,
      failed: 0,
      failedLabels: [],
      problem: null,
    });
  });

  test('a DOI with no URL is given a resolvable one on the way in', async () => {
    await importCitations(fileOf('one.bib', GOOD_BIB));

    const [first] = CitationStorageRPC.add.mock.calls[0];
    expect(first.url).toBe('https://doi.org/10.1000/one');
  });

  // Review finding: an RIS "DO  - doi:10.1/x" with no URL was given https://doi.org/doi:10.1/x.
  test.each(['doi:10.1000/two', 'DOI 10.1000/two', 'https://www.doi.org/10.1000/two'])(
    'a DOI stored as %p is given the clean doi.org link',
    async doi => {
      const ris = ['TY  - JOUR', 'TI  - A paper', `DO  - ${doi}`, 'ER  - ', ''].join('\n');
      await importCitations(fileOf('two.ris', ris));
      const [record] = CitationStorageRPC.add.mock.calls[0];
      expect(record.url).toBe('https://doi.org/10.1000/two');
    }
  );

  test('a .bib with nothing citation-shaped in it found no citations', async () => {
    const outcome = await importCitations(fileOf('garbage.bib', 'this is not a bibliography'));

    expect(outcome).toMatchObject({ added: 0, failed: 0, problem: 'empty' });
    expect(CitationStorageRPC.add).not.toHaveBeenCalled();
  });

  test('an empty .ris found no citations', async () => {
    const outcome = await importCitations(fileOf('empty.ris', ''));

    expect(outcome).toMatchObject({ added: 0, failed: 0, problem: 'empty' });
  });

  test('a truncated .json is unreadable, not an exception', async () => {
    const outcome = await importCitations(fileOf('cut.json', '{"citations": [{"title": "Half'));

    expect(outcome).toMatchObject({ added: 0, problem: 'unreadable' });
  });

  test('a JSON file of the wrong shape is unreadable, not "s.map is not a function"', async () => {
    const outcome = await importCitations(fileOf('settings.json', '{"theme":"dark"}'));

    expect(outcome).toMatchObject({ added: 0, problem: 'unreadable' });
  });

  test('a JSON list of things that are not citations names each position', async () => {
    const outcome = await importCitations(fileOf('list.json', '[1,2,"three",null]'));

    expect(outcome).toMatchObject({ added: 0, failed: 4, problem: null });
    expect(outcome.failedLabels).toEqual(['entry 1', 'entry 2', 'entry 3', 'entry 4']);
    expect(CitationStorageRPC.add).not.toHaveBeenCalled();
  });

  test('a half-good file adds the good one and names the one it could not', async () => {
    CitationStorageRPC.add
      .mockResolvedValueOnce({ id: 'saved' })
      .mockRejectedValueOnce(new Error('Invalid citation: At least one author is required'));

    const outcome = await importCitations(
      fileOf(
        'half.json',
        JSON.stringify([
          { title: 'A Good Article', authors: ['Smith, J'], url: 'https://example.com/a' },
          { title: 'Broken Record' },
        ])
      )
    );

    expect(outcome).toMatchObject({ added: 1, failed: 1, problem: null });
    expect(outcome.failedLabels).toEqual(['Broken Record']);
  });

  test('an RIS record with no title is counted and named by its place, not dropped in silence', async () => {
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

    const outcome = await importCitations(fileOf('two-records.ris', ris));

    expect(outcome).toMatchObject({ added: 1, failed: 1, problem: null });
    expect(outcome.failedLabels).toEqual(['entry 2']);
    expect(CitationStorageRPC.add).toHaveBeenCalledTimes(1);
  });

  test('a BibTeX entry with no title is counted and named by its place, not dropped in silence', async () => {
    const bib = [
      '@article{titled, title = {Titled record}, author = {Doe, Jane}, year = {2021}}',
      '@article{untitled, author = {Roe, Richard}, year = {2019}, doi = {10.1000/untitled}}',
    ].join('\n');

    const outcome = await importCitations(fileOf('two-records.bib', bib));

    expect(outcome).toMatchObject({ added: 1, failed: 1, problem: null });
    expect(outcome.failedLabels).toEqual(['entry 2']);
    expect(CitationStorageRPC.add).toHaveBeenCalledTimes(1);
  });

  test('a file we do not import says so without guessing at its contents', async () => {
    const outcome = await importCitations(fileOf('notes.txt', 'Smith, J. (2020) Something.'));

    expect(outcome).toMatchObject({ added: 0, problem: 'unsupported' });
    expect(CitationStorageRPC.add).not.toHaveBeenCalled();
  });

  test('a file that cannot even be read is reported, not thrown', async () => {
    const outcome = await importCitations({
      name: 'locked.bib',
      text: async () => {
        throw new Error('NotReadableError');
      },
    });

    expect(outcome).toMatchObject({ added: 0, problem: 'unreadable' });
  });
});
