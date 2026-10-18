/**
 * @jest-environment jsdom
 *
 * The full-page library's wizard paths, end to end: who writes the record, how many times, and
 * where the focus lands afterwards.
 *
 * The wizard now takes an `onSave` — it stores the citation itself and stays open if that fails, so
 * a failed write can never take the dialog and the source with it. Every caller has to hand it one,
 * and none of them may ALSO write after the dialog resolves: two writes means two cards for one
 * source. And because the card is drawn while the dialog still owns the focus, the list's own
 * "a citation arrived" hand-over declines (correctly — it must not reach into an open dialog), so
 * the page has to put the focus on the new card once the dialog has gone.
 */

import 'fake-indexeddb/auto';
import { CitationStorage } from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from '../citations/helpers/clear-citations.js';
import { installCitationRpcBridge } from '../citations/helpers/rpc-bridge.js';

// The first test imports the whole library page cold, about a second on its own and past jest's
// 5s default when the full suite runs in parallel. This budgets the harness, not the product.
jest.setTimeout(20000);

// AI off — keeps the sentinel/analyser (and any network) out of the mount path.
jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  getAIMode: jest.fn(async () => ({ isOff: true })),
}));

// The dialog itself is not under test here; the contract between it and its callers is.
jest.mock('../../../src/features/citations/ui/citation-wizard-modal.js', () => ({
  showCitationWizard: jest.fn(),
}));

const SKELETON = `
  <a class="assist-lib-skip" href="#assist-lib-main">Skip</a>
  <header class="assist-lib-header" id="assist-lib-header"></header>
  <div class="assist-lib-layout">
    <div id="assist-lib-sidebar-host"></div>
    <main id="assist-lib-main" class="assist-lib-main" tabindex="-1" aria-label="Your citations">
      <p id="assist-lib-loading">Loading…</p>
    </main>
  </div>`;

const SAVED = {
  title: 'Designing for Dyslexia',
  authors: ['Nolan, Fiona'],
  url: 'https://example.com/dyslexia',
  publicationDate: '2024',
  type: 'website',
};

/** Wait (real timers) for main()'s async chain — store.init reads fake-indexeddb, which is async. */
async function waitForMount(timeoutMs = 4000) {
  const start = Date.now();
  while (document.getElementById('assist-lib-loading')) {
    if (Date.now() - start > timeoutMs) {
      break;
    }
    await new Promise(r => setTimeout(r, 25));
  }
}

/** Let the handler's awaits, the store refresh and the re-render all settle. */
async function settle(rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    await new Promise(r => setTimeout(r, 10));
  }
}

function press(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/** The card for a citation with this title. */
function cardTitled(title) {
  return [...document.querySelectorAll('.assist-cite-card')].find(card =>
    card.textContent.includes(title)
  );
}

function buttonTitled(root, label) {
  return [...root.querySelectorAll('button')].find(b => new RegExp(label, 'i').test(b.textContent));
}

describe('the library page saves through the wizard', () => {
  /** The mocked dialog for THIS test — jest.resetModules() hands out a fresh instance each time. */
  let showCitationWizard;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = SKELETON;
    chrome.runtime.sendMessage.mockResolvedValue({});
    installCitationRpcBridge();
    // Taken AFTER resetModules, and implemented per test (resetMocks wipes the factory's): the
    // fake dialog calls the caller's onSave, as the real Save button does, then resolves.
    showCitationWizard = require('../../../src/features/citations/ui/citation-wizard-modal.js')
      .showCitationWizard;
    showCitationWizard.mockImplementation(async (draft = {}, options = {}) => {
      // The real dialog is IN the document while it stores the record (openOverlay's role="dialog"
      // surface), and the list refuses to move the focus while a dialog is open — a citation added
      // in another tab must not yank a student out of the wizard. That is the whole reason the page
      // has to hand the focus over itself afterwards, so the stand-in models it.
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.appendChild(dialog);
      try {
        const citation = { ...draft, ...SAVED };
        delete citation._isEdit;
        if (typeof options.onSave === 'function') {
          await options.onSave(citation);
        }
        return citation;
      } finally {
        dialog.remove();
      }
    });
  });

  afterEach(async () => {
    await clearCitations();
  });

  it('stores a new citation once, through the dialog, and lands the focus on its card', async () => {
    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();

    const main = document.getElementById('assist-lib-main');
    press(buttonTitled(main, 'New citation'));
    await settle();

    // The dialog was given an onSave — that is what keeps it open on a failed write.
    expect(typeof showCitationWizard.mock.calls[0][1].onSave).toBe('function');

    // Exactly one record: the page must not add it again after the dialog resolves.
    const stored = await CitationStorage.getAll();
    expect(stored.map(c => c.title)).toEqual([SAVED.title]);

    // And the student is standing on their new source, not back on the button that opened it.
    const card = cardTitled(SAVED.title);
    expect(card).toBeTruthy();
    expect(card.contains(document.activeElement)).toBe(true);
  });

  it('edits an existing citation once, through the dialog', async () => {
    await CitationStorage.add({ title: 'Rough notes', url: 'https://example.com/rough' });

    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();

    press(buttonTitled(cardTitled('Rough notes'), 'Edit'));
    await settle();

    expect(typeof showCitationWizard.mock.calls[0][1].onSave).toBe('function');

    const stored = await CitationStorage.getAll();
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe(SAVED.title);
  });
});
