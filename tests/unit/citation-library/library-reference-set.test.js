/**
 * @jest-environment jsdom
 *
 * The full-page library copies a single citation as it reads in its own reference list: the
 * card's collection, or every unfiled citation when it has none. So an essay's collection behaves
 * as one reference list — two works by one author in one year copy as 2020a / 2020b, in the
 * reference and in the text alike — and a work filed elsewhere does not letter them.
 *
 * The wizard it opens (New citation, Edit) is handed the student's style and the whole library,
 * so its CHECK preview carries the same letter.
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

/** Wait on the thing itself — every seeded card on screen — with a budget for a loaded suite. */
async function waitForCards(count, budgetMs = 20000) {
  const start = Date.now();
  while (document.querySelectorAll('.assist-cite-card').length < count) {
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

function pressOnCard(title, label) {
  const card = [...document.querySelectorAll('.assist-cite-card')].find(
    c => c.querySelector('.assist-cite-card__title').textContent === title
  );
  press([...card.querySelectorAll('button')].find(b => b.textContent === label));
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
let showCitationWizard;

beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = SKELETON;
  installCitationRpcBridge();
  const essay = await ProjectStorage.create('Essay 1');
  await CitationStorage.add(
    book('The ants of Africa', { projectId: essay, quote: 'Ants march.', locator: '5' })
  );
  await CitationStorage.add(book('Zebras of the plain', { projectId: essay }));
  await CitationStorage.add(book('Aardvarks at home'));

  ({ copyRich } = require('../../../src/features/citations/citation-clipboard.js'));
  copyRich.mockResolvedValue({ ok: true, rich: false });
  ({ showCitationWizard } = require('../../../src/features/citations/ui/citation-wizard-modal.js'));
  showCitationWizard.mockResolvedValue(null);

  await import('../../../src/pages/citation-library/library.js');
  await waitForCards(3);
});

afterEach(async () => {
  for (const c of await CitationStorage.getAll()) {
    await CitationStorage.purge(c.id);
  }
  for (const p of await ProjectStorage.getAll()) {
    await ProjectStorage.delete(p.id);
  }
});

const copiedText = () => copyRich.mock.calls.at(-1)[0].text;

describe('a card copies as it reads in its collection', () => {
  test('Copy reference carries the collection’s letter', async () => {
    pressOnCard('Zebras of the plain', 'Copy reference');
    await settle();
    expect(copiedText()).toBe('Smith, J. (2020b) Zebras of the plain. Pub.');
  });

  test('Copy in-text carries the same letter', async () => {
    pressOnCard('Zebras of the plain', 'Copy in-text');
    await settle();
    expect(copiedText()).toBe('(Smith, 2020b)');
  });

  test('Copy quote + citation carries it too', async () => {
    pressOnCard('The ants of Africa', 'Copy quote + citation');
    await settle();
    expect(copiedText()).toBe('“Ants march.” (Smith, 2020a, p. 5)');
  });

  test('an unfiled work is not lettered against a collection it is not in', async () => {
    pressOnCard('Aardvarks at home', 'Copy in-text');
    await settle();
    expect(copiedText()).toBe('(Smith, 2020)');
  });
});

describe('the wizard is handed the style and the library', () => {
  test('New citation', async () => {
    press([...document.querySelectorAll('button')].find(b => b.textContent === 'New citation'));
    await settle();
    const options = showCitationWizard.mock.calls.at(-1)[1];
    expect(options.style).toBe('harvard');
    expect(options.referencePool).toHaveLength(3);
  });

  test('Edit', async () => {
    pressOnCard('Zebras of the plain', 'Edit');
    await settle();
    const options = showCitationWizard.mock.calls.at(-1)[1];
    expect(options.style).toBe('harvard');
    expect(options.referencePool).toHaveLength(3);
  });
});
