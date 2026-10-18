/**
 * @jest-environment jsdom
 *
 * "Remove duplicates" on the real library page, against the offscreen-shaped storage.
 *
 * The dedupe module merges what the student wrote on a later copy (a quote, a page, notes, tags)
 * into the copy it keeps, and names the groups whose copies disagree. The page has to apply that:
 * write the merged record FIRST, then trash the copies it absorbed, and say plainly which sources
 * it left alone. Trashing without the write loses the student's quote after thirty days.
 */

import 'fake-indexeddb/auto';
import { CitationStorage } from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from '../citations/helpers/clear-citations.js';
import { installCitationRpcBridge } from '../citations/helpers/rpc-bridge.js';

jest.setTimeout(20000);

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  getAIMode: jest.fn(async () => ({ isOff: true })),
}));

const SKELETON = `
  <header class="assist-lib-header" id="assist-lib-header"></header>
  <div class="assist-lib-layout">
    <div id="assist-lib-sidebar-host"></div>
    <main id="assist-lib-main" class="assist-lib-main" tabindex="-1">
      <p id="assist-lib-loading">Loading…</p>
    </main>
  </div>`;

const NUMPY = {
  title: 'Array programming with NumPy',
  doi: '10.1038/s41586-020-2649-2',
  authors: ['Harris, Charles R.'],
  publicationDate: '2020',
};
const QUOTE = 'NumPy is the primary array programming library for the Python language.';

async function settle(times = 15) {
  for (let i = 0; i < times; i += 1) {
    await new Promise(r => setTimeout(r, 10));
  }
}

async function mount() {
  await import('../../../src/pages/citation-library/library.js');
  const start = Date.now();
  while (document.getElementById('assist-lib-loading') && Date.now() - start < 4000) {
    await new Promise(r => setTimeout(r, 25));
  }
  await settle();
}

const dedupeButton = () =>
  [...document.querySelectorAll('#assist-lib-header button')].find(
    b => b.textContent === 'Remove duplicates'
  );

async function pressRemoveDuplicates() {
  dedupeButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await settle();
}

const pageText = () => document.body.textContent;

/** Strictly increasing save times, so "newest first" puts the later save first every run. */
let clock = 1000;
const T = () => (clock += 1000);

describe('Remove duplicates on the library page', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = SKELETON;
    installCitationRpcBridge();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    window.confirm = jest.fn(() => true);
  });

  afterEach(async () => {
    await clearCitations();
    document.body.innerHTML = '';
  });

  it('keeps the quote and page held only by the second copy', async () => {
    // The library lists newest first, so the bare copy saved later is the "first" of the pair.
    await CitationStorage.add({ ...NUMPY, quote: QUOTE, locator: '357', notes: 'For the intro', createdAt: T() });
    await CitationStorage.add({ ...NUMPY, createdAt: T() });
    await mount();

    await pressRemoveDuplicates();

    const live = await CitationStorage.getAll();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ quote: QUOTE, locator: '357', notes: 'For the intro' });
    expect(await CitationStorage.getTrashed()).toHaveLength(1);
  });

  it('says what will happen before it happens, with a true count', async () => {
    await CitationStorage.add({ ...NUMPY, quote: QUOTE, createdAt: T() });
    await CitationStorage.add({ ...NUMPY, createdAt: T() });
    await CitationStorage.add({ ...NUMPY, createdAt: T() });
    await mount();

    await pressRemoveDuplicates();

    const question = window.confirm.mock.calls[0][0];
    expect(question).toMatch(/2 extra copies of 1 source/);
    expect(question).not.toMatch(/keeping the first/i);
    expect(question).toMatch(/quote/i);
    expect(pageText()).toMatch(/Removed 2 duplicates/);
  });

  it('leaves copies that disagree alone and names them, instead of saying nothing', async () => {
    await CitationStorage.add({ ...NUMPY, quote: 'First quote', createdAt: T() });
    await CitationStorage.add({ ...NUMPY, quote: 'A different quote', createdAt: T() });
    await mount();

    await pressRemoveDuplicates();

    // Nothing to remove, so nothing to confirm: the student is told why the copies stayed.
    expect(window.confirm).not.toHaveBeenCalled();
    expect(await CitationStorage.getAll()).toHaveLength(2);
    expect(pageText()).toMatch(/Array programming with NumPy/);
    expect(pageText()).toMatch(/different quotes/);
    expect(pageText()).not.toMatch(/No duplicates found/);
  });

  it('does not trash a copy whose work could not be written onto the one it keeps', async () => {
    await CitationStorage.add({ ...NUMPY, quote: QUOTE, createdAt: T() });
    await CitationStorage.add({ ...NUMPY, createdAt: T() });
    await mount();
    jest.spyOn(CitationStorage, 'update').mockRejectedValue(new Error('disk full'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await pressRemoveDuplicates();

    const live = await CitationStorage.getAll();
    expect(live).toHaveLength(2);
    expect(live.some(c => c.quote === QUOTE)).toBe(true);
    expect(await CitationStorage.getTrashed()).toHaveLength(0);
    expect(pageText()).toMatch(/could not/i);
  });

  // Review finding: the plan was worked out before the question and written from that snapshot,
  // so a change the page had not yet drawn (a note added in another tab) was written over.
  it('writes from the library as it stands after the question, not before it', async () => {
    await CitationStorage.add({ ...NUMPY, quote: QUOTE, notes: 'For the intro', createdAt: T() });
    const bareId = await CitationStorage.add({ ...NUMPY, createdAt: T() });
    await mount();
    // Stored, but not yet on this page: the store has not refreshed since.
    await CitationStorage.update(bareId, { notes: 'Written in another tab' });

    await pressRemoveDuplicates();

    const live = await CitationStorage.getAll();
    expect(live).toHaveLength(1);
    expect(live[0].notes).toContain('Written in another tab');
    expect(live[0].notes).toContain('For the intro');
  });

  it('asks nothing and changes nothing when the student says no', async () => {
    await CitationStorage.add({ ...NUMPY, quote: QUOTE, createdAt: T() });
    await CitationStorage.add({ ...NUMPY, createdAt: T() });
    await mount();
    window.confirm = jest.fn(() => false);

    await pressRemoveDuplicates();

    expect(await CitationStorage.getAll()).toHaveLength(2);
  });
});
