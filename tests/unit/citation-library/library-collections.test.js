/**
 * @jest-environment jsdom
 *
 * End-to-end-ish proof that collections actually work on the real page: creating one, filing a
 * citation into it from a card, filtering by it, renaming it, and deleting it without losing a
 * single source. Mounts the REAL library.js against the citation RPC bridge, so this exercises the
 * page wiring, the store intents and the offscreen-shaped storage together — the layer where the
 * feature was previously missing entirely.
 */

import 'fake-indexeddb/auto';
import {
  CitationStorage,
  ProjectStorage,
} from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from '../citations/helpers/clear-citations.js';
import { installCitationRpcBridge } from '../citations/helpers/rpc-bridge.js';

// The first test imports the whole library page cold, about a second on its own and past jest's
// 5s default when the full suite runs in parallel. This budgets the harness, not the product.
jest.setTimeout(20000);

// AI off — keeps the sentinel/analyser (and any network) out of the mount path.
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

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/** Let the page's async chain (store refresh over the RPC bridge) settle. */
async function settle(times = 12) {
  for (let i = 0; i < times; i += 1) {
    await new Promise(r => setTimeout(r, 10));
  }
}

async function waitForMount(timeoutMs = 4000) {
  const start = Date.now();
  while (document.getElementById('assist-lib-loading')) {
    if (Date.now() - start > timeoutMs) {
      break;
    }
    await new Promise(r => setTimeout(r, 25));
  }
  await settle();
}

// ── Page queries ──────────────────────────────────────────────────────────────

const rail = () => document.querySelector('nav.assist-lib-sidebar');
const newCollectionBtn = () => rail().querySelector('.assist-lib-sidebar__new');
const railLabels = () =>
  [...rail().querySelectorAll('.assist-lib-sidebar__item')].map(
    b => b.querySelector('.assist-lib-sidebar__label').textContent
  );
const railItem = name =>
  [...rail().querySelectorAll('.assist-lib-sidebar__item')].find(b =>
    b.querySelector('.assist-lib-sidebar__label').textContent.startsWith(name)
  );
const railRowButton = (name, action) =>
  [...rail().querySelectorAll('.assist-lib-sidebar__rowbtn')].find(b => {
    const label = b.getAttribute('aria-label').toLowerCase();
    return label.startsWith(action) && label.includes(name.toLowerCase());
  });
const cardTitles = () =>
  [...document.querySelectorAll('.assist-cite-card__title')].map(h => h.textContent);
const cardPickers = () => [...document.querySelectorAll('.assist-cite-card__collection-select')];
const dialogField = labelText => {
  const label = [...document.querySelectorAll('[role="dialog"] label')].find(l =>
    l.textContent.includes(labelText)
  );
  return document.getElementById(label.getAttribute('for'));
};
const dialogButton = text =>
  [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === text);
/** The tray currently being shown. A replaced tray lingers for its fade-out, so take the newest. */
const currentTray = () => [...document.querySelectorAll('.assist-action-tray')].pop();
const trayButton = text =>
  [...currentTray().querySelectorAll('button')].find(b => b.textContent === text);

/** Create a collection through the rail, exactly as a student would. */
async function createCollection(name, description = '') {
  fireMousedown(newCollectionBtn());
  dialogField('Name').value = name;
  if (description) {
    dialogField('Description').value = description;
  }
  fireMousedown(dialogButton('Create'));
  await settle();
}

describe('collections on the full-page library', () => {
  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = SKELETON;
    chrome.runtime.sendMessage.mockResolvedValue({});
    installCitationRpcBridge();
    await CitationStorage.add({ title: 'Rehearsal and memory', url: 'https://a.test', authors: ['A'] });
    await CitationStorage.add({ title: 'Unrelated source', url: 'https://b.test', authors: ['B'] });
    await import('../../../src/pages/citation-library/library.js');
    await waitForMount();
  });

  afterEach(async () => {
    await clearCitations();
    for (const project of await ProjectStorage.getAll()) {
      await ProjectStorage.delete(project.id);
    }
    document.body.innerHTML = '';
  });

  it('offers a route to the first collection even when there are none', () => {
    expect(newCollectionBtn()).toBeTruthy();
    expect(rail().querySelector('.assist-lib-sidebar__empty').hidden).toBe(false);
  });

  it('creates a collection from the rail and lists it with a count', async () => {
    await createCollection('Essay 1', 'Memory and rehearsal');

    expect(railLabels()).toEqual(['Essay 1 (0)']);
    const stored = await ProjectStorage.getAll();
    expect(stored).toHaveLength(1);
    expect(stored[0].description).toBe('Memory and rehearsal');
  });

  it('files a citation from its card, and the rail count follows', async () => {
    await createCollection('Essay 1');

    const picker = cardPickers()[0];
    expect(picker).toBeTruthy();
    picker.value = [...picker.options].find(o => o.textContent === 'Essay 1').value;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(railLabels()).toEqual(['Essay 1 (1)']);
  });

  it('filters the library to a collection and back again', async () => {
    await createCollection('Essay 1');
    const picker = cardPickers().find(p =>
      [...p.options].some(o => o.textContent === 'Essay 1')
    );
    const filedTitle = picker.closest('.assist-cite-card').querySelector('.assist-cite-card__title')
      .textContent;
    picker.value = [...picker.options].find(o => o.textContent === 'Essay 1').value;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    fireMousedown(railItem('Essay 1'));
    await settle();
    expect(cardTitles()).toEqual([filedTitle]);
    expect(railItem('Essay 1').getAttribute('aria-current')).toBe('true');

    fireMousedown(rail().querySelector('.assist-lib-sidebar__all'));
    await settle();
    expect(cardTitles()).toHaveLength(2);
  });

  it('announces the filter change with the resulting count', async () => {
    await createCollection('Essay 1');
    fireMousedown(railItem('Essay 1'));
    await settle();

    const status = rail().querySelector('[role="status"]').textContent;
    expect(status).toContain('Essay 1');
    expect(status).toContain('0 of 2');
  });

  it('renames a collection in place', async () => {
    await createCollection('Draft name');

    fireMousedown(railRowButton('Draft name', 'rename'));
    expect(dialogField('Name').value).toBe('Draft name');
    dialogField('Name').value = 'Final name';
    fireMousedown(dialogButton('Save'));
    await settle();

    expect(railLabels()).toEqual(['Final name (0)']);
  });

  it('deletes a collection WITHOUT deleting its citations, and says how many came back', async () => {
    await createCollection('Doomed');
    const picker = cardPickers()[0];
    picker.value = [...picker.options].find(o => o.textContent === 'Doomed').value;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    fireMousedown(railRowButton('Doomed', 'delete'));
    await settle();

    // The collection is gone; both sources are still in the library.
    expect(await ProjectStorage.getAll()).toHaveLength(0);
    expect(await CitationStorage.count()).toBe(2);
    expect(cardTitles()).toHaveLength(2);

    const tray = currentTray();
    expect(tray.getAttribute('role')).toBe('status');
    expect(tray.textContent).toContain('1 citation moved back to your library');
    // Undo, never a confirm.
    expect(trayButton('Undo')).toBeTruthy();
  });

  it('undoes a deletion, putting the collection and its contents back', async () => {
    await createCollection('Doomed', 'Kept');
    const picker = cardPickers()[0];
    picker.value = [...picker.options].find(o => o.textContent === 'Doomed').value;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    fireMousedown(railRowButton('Doomed', 'delete'));
    await settle();
    fireMousedown(trayButton('Undo'));
    await settle();

    expect(railLabels()).toEqual(['Doomed (1)']);
    const [restored] = await ProjectStorage.getAll();
    expect(restored.description).toBe('Kept');
  });

  it('creating a collection hands the focus back to the New collection button', async () => {
    newCollectionBtn().focus();
    await createCollection('Seminar');
    expect(document.activeElement).toBe(newCollectionBtn());
  });

  // Review finding: Undo recreated the collection without the name check every other route uses,
  // so a same-named collection made in the meantime (here, in another tab) gave two identical names.
  it('undoing a deletion never makes a second collection with a name in use', async () => {
    await createCollection('Doomed', 'Kept');
    const picker = cardPickers()[0];
    picker.value = [...picker.options].find(o => o.textContent === 'Doomed').value;
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    fireMousedown(railRowButton('Doomed', 'delete'));
    await settle();
    await ProjectStorage.create('DOOMED', 'Made in another tab');
    fireMousedown(trayButton('Undo'));
    await settle();

    const names = (await ProjectStorage.getAll()).map(p => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(railLabels()).toEqual(expect.arrayContaining(['DOOMED (0)', 'Doomed (restored) (1)']));
    expect(currentTray().textContent).toContain('“Doomed (restored)”');
  });

  it('refuses a second collection with a name already in use, in any case', async () => {
    await createCollection('Essay');
    await createCollection('ESSAY');

    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.querySelector('[role="dialog"] [role="alert"]').textContent).toMatch(/already/i);
    expect(await ProjectStorage.getAll()).toHaveLength(1);
  });

  it('refuses a rename onto another collection, but not a change of case to its own name', async () => {
    await createCollection('Essay');
    await createCollection('Lab report');

    fireMousedown(railRowButton('Lab report', 'rename'));
    dialogField('Name').value = 'essay';
    fireMousedown(dialogButton('Save'));
    await settle();
    expect(document.querySelector('[role="dialog"] [role="alert"]').textContent).toMatch(/already/i);
    fireMousedown(dialogButton('Cancel'));
    await settle();

    fireMousedown(railRowButton('Essay', 'rename'));
    dialogField('Name').value = 'ESSAY';
    fireMousedown(dialogButton('Save'));
    await settle();
    expect(railLabels()).toEqual(['ESSAY (0)', 'Lab report (0)']);
  });

  it('puts the focus on the rename control of the renamed row once it is saved', async () => {
    await createCollection('Draft name');
    const renameBtn = railRowButton('Draft name', 'rename');
    renameBtn.focus();
    renameBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(document.activeElement).toBe(dialogField('Name'));
    dialogField('Name').value = 'Final name';
    // Anything the store says while the dialog is open (in Chrome, the storage echo of an earlier
    // write) rebuilds the rail, so the button the dialog would hand the focus back to is gone.
    document.querySelector('input[type="search"]').dispatchEvent(new Event('input'));
    expect(renameBtn.isConnected).toBe(false);
    dialogButton('Save').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();

    expect(document.activeElement).toBe(railRowButton('Final name', 'rename'));
  });

  it('keeps the focus in the rail when a collection is deleted by keyboard', async () => {
    await createCollection('Essay');
    await createCollection('Other');
    const deleteBtn = railRowButton('Essay', 'delete');
    deleteBtn.focus();
    deleteBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();

    expect(railLabels()).toEqual(['Other (0)']);
    expect(document.activeElement).toBe(railItem('Other'));
  });

  it('clears the search as well when All citations is pressed from the search box', async () => {
    await createCollection('Essay');
    const search = document.querySelector('input[type="search"]');
    search.focus();
    search.dispatchEvent(new FocusEvent('focus'));
    search.value = 'Rehearsal';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(cardTitles()).toEqual(['Rehearsal and memory']);

    // A mouse press on the rail does not take the focus from the search box.
    fireMousedown(rail().querySelector('.assist-lib-sidebar__all'));
    await settle();

    expect(search.value).toBe('');
    expect(cardTitles()).toHaveLength(2);
    expect(rail().querySelector('[role="status"]').textContent).toBe('Search cleared. Showing all 2 citations.');
  });
});
