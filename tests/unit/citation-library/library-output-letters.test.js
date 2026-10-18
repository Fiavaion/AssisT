/**
 * @jest-environment jsdom
 *
 * Every way out of the library prints an entry exactly as its card copies it. A work's year letter
 * is assigned within its own reference list (its collection, or every unfiled citation), so a
 * search filter, a selection or "Export all" changes WHICH entries are output, never their letters.
 * Both export menus hand the exporter the chosen style and the library the letters are drawn from,
 * and the rich in-text copy keeps its italics.
 */

import 'fake-indexeddb/auto';
import {
  CitationStorage,
  ProjectStorage,
} from '../../../src/features/citations/citation-storage.js';
import { installCitationRpcBridge } from '../citations/helpers/rpc-bridge.js';

jest.setTimeout(30000);

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  getAIMode: jest.fn(async () => ({ isOff: true })),
}));
jest.mock('../../../src/features/citations/ui/citation-wizard-modal.js', () => ({
  showCitationWizard: jest.fn(),
}));
jest.mock('../../../src/features/citations/citation-export.js', () => ({
  ...jest.requireActual('../../../src/features/citations/citation-export.js'),
  exportCitations: jest.fn(),
}));
jest.mock('../../../src/features/citations/citation-clipboard.js', () => ({
  ...jest.requireActual('../../../src/features/citations/citation-clipboard.js'),
  copyRich: jest.fn(),
}));

const SKELETON = `
  <header class="assist-lib-header" id="assist-lib-header"></header>
  <div class="assist-lib-layout">
    <div id="assist-lib-sidebar-host"></div>
    <main id="assist-lib-main" class="assist-lib-main" tabindex="-1">
      <p id="assist-lib-loading">Loading…</p>
    </main>
  </div>`;

async function waitForCards(count, budgetMs = 20000) {
  const start = Date.now();
  while (document.querySelectorAll('.assist-cite-card').length !== count) {
    if (Date.now() - start > budgetMs) {
      throw new Error(`library never showed ${count} cards`);
    }
    await new Promise(r => setTimeout(r, 25));
  }
}

async function settle(rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    await new Promise(r => setTimeout(r, 10));
  }
}

function press(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function cardTitled(title) {
  return [...document.querySelectorAll('.assist-cite-card')].find(
    c => c.querySelector('.assist-cite-card__title').textContent === title
  );
}

function pressOnCard(title, label) {
  press([...cardTitled(title).querySelectorAll('button')].find(b => b.textContent === label));
}

function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

const book = (title, extra = {}) => ({
  type: 'book',
  title,
  authors: ['Smith, John'],
  publisher: 'Pub',
  publicationDate: '2020',
  url: `https://example.test/${encodeURIComponent(title)}`,
  ...extra,
});

let copyRich;
let exportCitations;
let downloaded;
const RealBlob = global.Blob;

/** Open the library with this style chosen, three Smith 2020 books: two in a collection, one not. */
async function openLibrary(style) {
  jest.resetModules();
  document.body.innerHTML = SKELETON;
  installCitationRpcBridge();
  chrome.storage.local.get.mockResolvedValue({ citationStyle: style });
  const essay = await ProjectStorage.create('Essay 1');
  await CitationStorage.add(book('The ants of Africa', { projectId: essay }));
  await CitationStorage.add(book('Zebras of the plain', { projectId: essay }));
  await CitationStorage.add(book('Aardvarks at home'));

  ({ copyRich } = require('../../../src/features/citations/citation-clipboard.js'));
  copyRich.mockResolvedValue({ ok: true, rich: true });
  ({ exportCitations } = require('../../../src/features/citations/citation-export.js'));
  await import('../../../src/pages/citation-library/library.js');
  await waitForCards(3);
}

beforeEach(() => {
  downloaded = [];
  global.Blob = function CapturingBlob(parts, options) {
    downloaded.push(parts.join(''));
    return new RealBlob(parts, options);
  };
  URL.createObjectURL = jest.fn(() => 'blob:test');
  URL.revokeObjectURL = jest.fn();
});

afterEach(async () => {
  global.Blob = RealBlob;
  for (const c of await CitationStorage.getAll()) {
    await CitationStorage.purge(c.id);
  }
  for (const p of await ProjectStorage.getAll()) {
    await ProjectStorage.delete(p.id);
  }
});

const lastCopy = () => copyRich.mock.calls.at(-1)[0];
const headerExport = () => document.querySelector('select[aria-label="Export all citations as"]');

describe('letters are the card’s, whatever is being output', () => {
  test('a search-filtered bibliography carries the letter the card copies', async () => {
    await openLibrary('harvard');
    pressOnCard('Zebras of the plain', 'Copy in-text');
    await settle();
    expect(lastCopy().text).toBe('(Smith, 2020b)');

    const search = document.querySelector('input[type="search"]');
    search.value = 'Zebras';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await waitForCards(1);
    press([...document.querySelectorAll('button')].find(b => b.textContent === 'Copy bibliography'));
    await settle();
    expect(lastCopy().text).toBe('Smith, J. (2020b) Zebras of the plain. Pub.');
  });

});

describe('both export menus hand over the style and the library', () => {
  const titles = list => list.map(c => c.title).sort();

  test('header "Export all"', async () => {
    await openLibrary('apa7');
    choose(headerExport(), 'ris');
    await settle();
    const [format, chosen, style, { pool }] = exportCitations.mock.calls.at(-1);
    expect([format, style]).toEqual(['ris', 'apa7']);
    expect(titles(chosen)).toHaveLength(3);
    expect(titles(pool)).toHaveLength(3);
  });

  test('the selection bar', async () => {
    await openLibrary('apa7');
    const box = cardTitled('Zebras of the plain').querySelector('input.assist-cite-card__select');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    choose(document.querySelector('select.assist-cite-selectbar__export'), 'ris');
    await settle();
    const [format, chosen, style, { pool }] = exportCitations.mock.calls.at(-1);
    expect([format, style]).toEqual(['ris', 'apa7']);
    expect(titles(chosen)).toEqual(['Zebras of the plain']);
    expect(titles(pool)).toHaveLength(3);
  });
});

describe('the plain-text export letters within each entry’s own list', () => {
  const realExport = () =>
    jest.requireActual('../../../src/features/citations/citation-export.js').exportCitations;

  test('everything, in the chosen style', async () => {
    await openLibrary('harvard');
    const pool = await CitationStorage.getAll();
    await realExport()('txt', pool, 'apa7', { pool });
    expect(downloaded.at(-1)).toBe(
      [
        'Smith, J. (2020). Aardvarks at home. Pub.',
        'Smith, J. (2020a). The ants of Africa. Pub.',
        'Smith, J. (2020b). Zebras of the plain. Pub.',
      ].join('\n\n')
    );
  });

  test('one entry keeps the letter its card copies', async () => {
    await openLibrary('harvard');
    const pool = await CitationStorage.getAll();
    const zebras = pool.filter(c => c.title === 'Zebras of the plain');
    await realExport()('txt', zebras, 'harvard', { pool });
    expect(downloaded.at(-1)).toBe('Smith, J. (2020b) Zebras of the plain. Pub.');
  });
});

describe('the rich in-text copy keeps its italics', () => {
  test('MLA names the work in italics; the plain flavour stays plain', async () => {
    await openLibrary('mla9');
    pressOnCard('Zebras of the plain', 'Copy in-text');
    await settle();
    expect(lastCopy().text).toBe('(Smith, Zebras of the plain)');
    expect(lastCopy().html).toBe('<span>(Smith, <em>Zebras of the plain</em>)</span>');
  });
});
