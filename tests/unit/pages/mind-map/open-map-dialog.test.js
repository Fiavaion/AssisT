/**
 * @jest-environment jsdom
 *
 * Opening another map without leaving the editor.
 *
 * Before this, the only route from one map to another was back out to the library and in again.
 * The dialog is a list of buttons rather than a listbox: each row is a thing that happens when it
 * is pressed, Tab and the arrow keys behave the way they do everywhere else on the page, and there
 * is no roving-focus contract to get wrong. What is graded here is that every state — the list, an
 * empty library, a filter that matches nothing, a database that would not answer — says something
 * in words, and that the map already open is marked as such in words rather than by colour.
 */

import { mountOpenMapDialog } from '../../../../src/pages/mind-map/open-map-dialog.js';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(value) {
    this.open = false;
    this.returnValue = value === undefined ? '' : value;
    this.dispatchEvent(new Event('close'));
  };
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const SUMMARIES = [
  {
    id: 'essay',
    title: 'Essay plan',
    updatedAt: Date.UTC(2026, 8, 3, 9, 0),
    nodeCount: 12,
    sourceUrl: 'https://www.jstor.org/stable/123'
  },
  {
    id: 'lecture',
    title: 'Lecture notes',
    updatedAt: Date.UTC(2026, 8, 1, 9, 0),
    nodeCount: 1,
    sourceUrl: null
  }
];

let host;
let dialog;
let options;

function mount(overrides = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  options = {
    listMaps: jest.fn().mockResolvedValue(SUMMARIES),
    currentMapId: 'essay',
    onOpen: jest.fn(),
    onGoToLibrary: jest.fn(),
    ...overrides
  };
  dialog = mountOpenMapDialog(host, options);
}

/** Open and let the list arrive. */
async function opened(overrides) {
  mount(overrides);
  dialog.open();
  await flush();
}

afterEach(() => {
  if (dialog) {
    dialog.destroy();
    dialog = null;
  }
  if (host) {
    host.remove();
  }
  document.body.innerHTML = '';
});

const element = () => host.querySelector('dialog[data-dialog="open"]');
const filter = () => host.querySelector('#assist-mm-open-filter');
const rows = () => [...element().querySelectorAll('.assist-mm-open__map')];
const listed = () => rows().map(row => row.dataset.id);
const message = () => element().querySelector('[role="status"]').textContent;

function pressEnter(target) {
  target.focus();
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

function type(text) {
  filter().value = text;
  filter().dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the list', () => {
  it('is a named modal that opens onto the filter box', async () => {
    await opened();

    expect(element().getAttribute('aria-labelledby')).toBe('assist-mm-open-title');
    expect(element().querySelector('#assist-mm-open-title').textContent).toBe('Open a map');
    expect(element().open).toBe(true);
    expect(document.activeElement).toBe(filter());
  });

  it('shows every map with how big it is and when it was last touched', async () => {
    await opened();

    expect(listed()).toEqual(['essay', 'lecture']);
    const essay = rows()[0];
    expect(essay.textContent).toContain('Essay plan');
    expect(essay.textContent).toContain('12 nodes');
    expect(rows()[1].textContent).toContain('1 node');
  });

  // Colour alone would leave the current map indistinguishable to a student who cannot see it, and
  // to one who cannot tell the two shades apart (SC 1.4.1).
  it('says which map is already open, in words', async () => {
    await opened();

    expect(rows()[0].textContent).toContain('Open now');
    expect(rows()[1].textContent).not.toContain('Open now');
  });

  it('reads the maps again each time it opens, not once at mount', async () => {
    await opened();
    expect(options.listMaps).toHaveBeenCalledTimes(1);

    dialog.close();
    dialog.open();
    await flush();

    expect(options.listMaps).toHaveBeenCalledTimes(2);
  });
});

describe('choosing a map', () => {
  it('opens the map from the keyboard and closes', async () => {
    await opened();

    pressEnter(rows()[1]);

    expect(options.onOpen).toHaveBeenCalledWith('lecture');
    expect(element().open).toBe(false);
  });

  // The map on screen is in the list because leaving it out would move the rows under a student
  // who came here by mistake; pressing it is simply a way out of the dialog.
  it('closes without reloading when the chosen map is the one already open', async () => {
    await opened();

    pressEnter(rows()[0]);

    expect(options.onOpen).not.toHaveBeenCalled();
    expect(element().open).toBe(false);
  });

  it('offers the library as well, for renaming and deleting', async () => {
    await opened();

    pressEnter(element().querySelector('[data-command="library"]'));

    expect(options.onGoToLibrary).toHaveBeenCalledTimes(1);
  });
});

describe('the filter', () => {
  it('narrows the list to the titles that match', async () => {
    await opened();

    type('lect');

    expect(listed()).toEqual(['lecture']);
  });

  it('says so when nothing matches, rather than showing an empty box', async () => {
    await opened();

    type('zzz');

    expect(listed()).toEqual([]);
    expect(message()).toContain('No map matches "zzz"');
  });
});

describe('when there is nothing to show', () => {
  it('says the library is empty', async () => {
    await opened({ listMaps: jest.fn().mockResolvedValue([]) });

    expect(message()).toBe('You have no other maps yet. New map… starts one.');
  });

  it('says why the maps could not be read instead of showing nothing', async () => {
    await opened({ listMaps: jest.fn().mockRejectedValue(new Error('The database is closed')) });

    expect(message()).toBe('Your maps could not be read: The database is closed');
    expect(listed()).toEqual([]);
  });
});

describe('leaving', () => {
  it('cancels from the keyboard and gives focus back to whatever opened it', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    await opened();

    pressEnter(element().querySelector('[data-command="cancel"]'));

    expect(element().open).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(options.onOpen).not.toHaveBeenCalled();
  });

  it('gives focus back when Escape closed it', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    await opened();

    element().close();

    expect(document.activeElement).toBe(opener);
  });

  // A list that arrives after the student has gone would write rows into a closed dialog and, on
  // the next open, show the maps as they were two openings ago.
  it('drops a list that arrives after it was closed', async () => {
    let settle;
    mount({ listMaps: () => new Promise(resolve => { settle = resolve; }) });
    dialog.open();
    // The list is asked for in a microtask, so the request exists before the student leaves.
    await Promise.resolve();
    dialog.close();

    settle(SUMMARIES);
    await flush();

    expect(listed()).toEqual([]);
  });

  it('takes itself and its listeners away', async () => {
    await opened();

    dialog.destroy();
    dialog = null;

    expect(host.innerHTML).toBe('');
  });
});
