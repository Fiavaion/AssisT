/**
 * @jest-environment jsdom
 *
 * The library is the first thing a student meets on this page, and the only place a map can be
 * destroyed — there is no trash for maps — so the suite holds the delete confirmation, the
 * announcements and the keyboard-only path as hard requirements.
 */

import { TEMPLATES } from '../../../../src/features/mindMap/core/templates.js';
import { mountLibraryView } from '../../../../src/pages/mind-map/library-view.js';

// jsdom 20 ships HTMLDialogElement without its methods. The page uses the real element, so the
// suite supplies the two methods the browser already has.
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
    nodeCount: 5,
    sourceUrl: null
  }
];

let host;
let view;
let options;

function mount(overrides = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  options = {
    listMaps: jest.fn().mockResolvedValue(SUMMARIES),
    deleteMap: jest.fn().mockResolvedValue(undefined),
    renameMap: jest.fn().mockResolvedValue(undefined),
    createFromTemplate: jest.fn().mockResolvedValue('made'),
    onImport: jest.fn().mockResolvedValue(undefined),
    onOpen: jest.fn(),
    announce: jest.fn(),
    // The page's `notify` is `showToast`, which writes the toast AND the live region. A bare
    // `jest.fn()` here would hide a sentence being announced twice.
    notify: jest.fn((text, kind = 'info') =>
      options.announce(kind === 'error' ? `Problem: ${text}` : text)
    ),
    ...overrides
  };
  view = mountLibraryView(host, options);
  return flush();
}

/** @param {string} id @returns {HTMLElement} the card for a map id */
const card = id => host.querySelector(`.assist-mm-card[data-id="${id}"]`);

/** @returns {string[]} the map ids on screen, in order */
const listed = () => [...host.querySelectorAll('.assist-mm-card')].map(el => el.dataset.id);

/** @param {HTMLElement} element - pressed the way a pointer presses it */
function activate(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/**
 * Activate a control the way a keyboard student does: Enter on the focused element.
 *
 * `element.click()` proves nothing here. The shared event helper binds `mousedown` and `keydown`,
 * never `click`, so a dispatched click would run no handler at all — and a control only a pointer
 * can reach is the defect this covers (SC 2.1.1).
 *
 * @param {HTMLElement} element
 */
function pressEnter(element) {
  element.focus();
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  );
}

const dialogNamed = name => host.querySelector(`dialog[data-dialog="${name}"]`);

afterEach(() => {
  if (view) {
    view.destroy();
  }
  if (host) {
    host.remove();
  }
  document.body.innerHTML = '';
});

describe('the list', () => {
  it('shows every map with its size and where it came from', async () => {
    await mount();

    expect(listed()).toEqual(['essay', 'lecture']);
    expect(card('essay').querySelector('.assist-mm-card__title').textContent).toBe('Essay plan');
    expect(card('essay').querySelector('.assist-mm-card__meta').textContent).toContain('12 nodes');
    expect(card('essay').querySelector('.assist-mm-card__meta').textContent).toContain('jstor.org');
    expect(card('lecture').querySelector('.assist-mm-card__meta').textContent).not.toContain('undefined');
  });

  it('names each row action for the map it acts on', async () => {
    await mount();

    const open = card('essay').querySelector('[data-command="open"]');
    expect(open.textContent).toBe('Open');
    expect(open.getAttribute('aria-label')).toBe('Open Essay plan');
  });

  it('explains the page rather than showing an empty list', async () => {
    await mount({ listMaps: jest.fn().mockResolvedValue([]) });

    expect(listed()).toEqual([]);
    expect(host.querySelector('.assist-mm-library__empty').textContent).toMatch(/New map/);
  });

  it('says so when the maps cannot be read', async () => {
    await mount({ listMaps: jest.fn().mockRejectedValue(new Error('Database is closed')) });

    expect(host.querySelector('.assist-mm-library__error').textContent).toContain('Database is closed');
  });

  it('opens the map the student asked for', async () => {
    await mount();

    activate(card('lecture').querySelector('[data-command="open"]'));

    expect(options.onOpen).toHaveBeenCalledWith('lecture');
  });

  it('opens a map from the keyboard, not only from a pointer (SC 2.1.1)', async () => {
    await mount();

    pressEnter(card('lecture').querySelector('[data-command="open"]'));

    expect(options.onOpen).toHaveBeenCalledWith('lecture');
  });

  it('carries the hooks the browser suite selects it by', async () => {
    await mount();

    expect(card('essay').dataset.testid).toBe('map-card');
    expect(card('essay').querySelector('.assist-mm-card__title').dataset.testid).toBe(
      'map-card-title'
    );
    expect(card('essay').querySelector('.assist-mm-card__meta').dataset.testid).toBe(
      'map-card-meta'
    );
    expect(host.querySelector('.assist-mm-library__file').dataset.testid).toBe(
      'library-import-file'
    );
  });

  it('names its empty state for the browser suite as well as for the student', async () => {
    await mount({ listMaps: jest.fn().mockResolvedValue([]) });

    expect(host.querySelector('.assist-mm-library__empty').dataset.testid).toBe('library-empty');
  });
});

describe('keeping up with the database', () => {
  it('redraws when a map is written somewhere else', async () => {
    let fire;
    const unsubscribe = jest.fn();
    const subscribeMapsChanged = jest.fn(listener => {
      fire = listener;
      return unsubscribe;
    });
    await mount({ subscribeMapsChanged });
    expect(options.listMaps).toHaveBeenCalledTimes(1);

    options.listMaps.mockResolvedValue([SUMMARIES[1]]);
    fire({ mapId: 'essay', updatedAt: 1 });
    await flush();

    expect(listed()).toEqual(['lecture']);
  });

  it('stops listening when the view goes away', async () => {
    const unsubscribe = jest.fn();
    await mount({ subscribeMapsChanged: jest.fn(() => unsubscribe) });

    view.destroy();
    view = null;

    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('search', () => {
  it('filters by title without asking the database again', async () => {
    await mount();
    const search = host.querySelector('.assist-mm-library__search');

    search.value = 'lect';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(listed()).toEqual(['lecture']);
    expect(options.listMaps).toHaveBeenCalledTimes(1);
  });

  // The debounce is the only timer in this view, so the clock is only driven where it matters.
  afterEach(() => {
    jest.useRealTimers();
  });

  it('announces the count once the typing stops, not once per keystroke', async () => {
    await mount();
    jest.useFakeTimers();
    const search = host.querySelector('.assist-mm-library__search');
    const count = host.querySelector('[role="status"]');
    count.textContent = '';

    for (const value of ['l', 'le', 'lec', 'lect']) {
      search.value = value;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // The list itself keeps up with the typing; only the spoken count waits.
    expect(listed()).toEqual(['lecture']);
    expect(count.textContent).toBe('');

    jest.advanceTimersByTime(250);

    expect(count.textContent).toBe('1 of 2 maps');
  });

  it('says when a search matches nothing', async () => {
    await mount();
    const search = host.querySelector('.assist-mm-library__search');

    search.value = 'nothing like this';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(host.querySelector('.assist-mm-library__empty').textContent).toMatch(/nothing like this/);
  });
});

describe('delete', () => {
  it('asks before destroying a map, because there is no trash', async () => {
    await mount();

    activate(card('essay').querySelector('[data-command="delete"]'));

    expect(dialogNamed('delete').open).toBe(true);
    expect(dialogNamed('delete').textContent).toContain('Essay plan');
    expect(options.deleteMap).not.toHaveBeenCalled();
  });

  it('deletes, refreshes and announces once confirmed', async () => {
    await mount();
    options.listMaps.mockResolvedValue([SUMMARIES[1]]);

    activate(card('essay').querySelector('[data-command="delete"]'));
    activate(dialogNamed('delete').querySelector('[data-command="confirm-delete"]'));
    await flush();

    expect(options.deleteMap).toHaveBeenCalledWith('essay');
    expect(listed()).toEqual(['lecture']);
    expect(options.announce).toHaveBeenCalledWith('Deleted the map Essay plan.');
    expect(dialogNamed('delete').open).toBe(false);
  });

  it('keeps the map when the student backs out', async () => {
    await mount();

    activate(card('essay').querySelector('[data-command="delete"]'));
    activate(dialogNamed('delete').querySelector('[data-command="cancel"]'));
    await flush();

    expect(options.deleteMap).not.toHaveBeenCalled();
    expect(listed()).toEqual(['essay', 'lecture']);
  });
});

describe('rename', () => {
  it('writes the new title and shows it', async () => {
    await mount();

    activate(card('essay').querySelector('[data-command="rename"]'));
    const form = dialogNamed('rename').querySelector('form');
    form.querySelector('input').value = 'Essay plan, second draft';
    options.listMaps.mockResolvedValue([{ ...SUMMARIES[0], title: 'Essay plan, second draft' }]);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(options.renameMap).toHaveBeenCalledWith('essay', 'Essay plan, second draft');
    expect(card('essay').querySelector('.assist-mm-card__title').textContent).toBe(
      'Essay plan, second draft'
    );
  });

  it('refuses an empty title rather than storing one', async () => {
    await mount();

    activate(card('essay').querySelector('[data-command="rename"]'));
    const form = dialogNamed('rename').querySelector('form');
    form.querySelector('input').value = '   ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(options.renameMap).not.toHaveBeenCalled();
    expect(dialogNamed('rename').open).toBe(true);
  });
});

/**
 * The two dialogs the library owns.
 *
 * They had a focus restore of their own, wired to the buttons that close them — so the one exit
 * the student did not press, Escape, dropped the keyboard on `<body>` and lost their place in the
 * list. Every other dialog on this page is built on `dialog-shell.js`, whose restore hangs off the
 * element's own `close` event and therefore covers Escape too.
 */
describe('the library dialogs', () => {
  it('gives the keyboard back to the card button when Escape closes the rename dialog', async () => {
    await mount();
    const opener = card('essay').querySelector('[data-command="rename"]');

    pressEnter(opener);
    // What Escape does in a browser: the element closes itself and fires `close`.
    dialogNamed('rename').close();

    expect(document.activeElement).toBe(opener);
  });

  it('gives the keyboard back to the card button when Escape closes the delete dialog', async () => {
    await mount();
    const opener = card('essay').querySelector('[data-command="delete"]');

    pressEnter(opener);
    dialogNamed('delete').close();

    expect(document.activeElement).toBe(opener);
  });

  it('says why an empty title was refused, in a hint the box itself points at', async () => {
    await mount();

    activate(card('essay').querySelector('[data-command="rename"]'));
    const form = dialogNamed('rename').querySelector('form');
    const input = form.querySelector('input');
    input.value = '   ';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const hint = dialogNamed('rename').querySelector('.assist-mm-dialog__hint');
    expect(hint.getAttribute('role')).toBe('status');
    expect(hint.textContent).toBe('A map needs a title.');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(document.activeElement).toBe(input);
  });

  it('carries the map name into the dialog it is about, whichever one is asked for', async () => {
    await mount();

    activate(card('lecture').querySelector('[data-command="rename"]'));
    expect(dialogNamed('rename').querySelector('input').value).toBe('Lecture notes');

    dialogNamed('rename').close();
    activate(card('lecture').querySelector('[data-command="delete"]'));
    expect(dialogNamed('delete').textContent).toContain('Lecture notes');
  });
});

/**
 * A `role="alert"` is spoken when it appears or changes. Written while the element is still
 * `hidden`, it is not in the accessibility tree at all: the words arrive, nothing is announced,
 * and the failure reaches only the students who can see the page.
 */
describe('the error line', () => {
  it('is shown before it is written, so the alert is actually made', async () => {
    await mount({ deleteMap: jest.fn().mockRejectedValue(new Error('The database is closed')) });
    const error = host.querySelector('.assist-mm-library__error');
    const seen = [];
    const observer = new MutationObserver(records => {
      for (const record of records) {
        seen.push(record.type === 'attributes' ? `attribute:${record.attributeName}` : 'words');
      }
    });
    observer.observe(error, { attributes: true, childList: true, characterData: true });

    activate(card('essay').querySelector('[data-command="delete"]'));
    activate(dialogNamed('delete').querySelector('[data-command="confirm-delete"]'));
    await flush();
    observer.disconnect();

    expect(seen[0]).toBe('attribute:hidden');
    expect(seen).toContain('words');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toContain('The database is closed');
  });
});

describe('new map', () => {
  it('offers every template with what it is for', async () => {
    await mount();

    activate(host.querySelector('.assist-mm-library__new'));

    const choices = [...dialogNamed('new').querySelectorAll('input[type="radio"]')];
    expect(choices.map(choice => choice.value)).toEqual(TEMPLATES.map(template => template.id));
    expect(dialogNamed('new').textContent).toContain(TEMPLATES[1].description);
  });

  it('builds the chosen template under the typed title and opens it', async () => {
    await mount();

    activate(host.querySelector('.assist-mm-library__new'));
    const form = dialogNamed('new').querySelector('form');
    form.querySelector('input[type="text"]').value = 'Romanticism essay';
    form.querySelector('input[value="essay-plan"]').checked = true;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(options.createFromTemplate).toHaveBeenCalledWith('essay-plan', 'Romanticism essay');
    expect(options.onOpen).toHaveBeenCalledWith('made');
  });
});

/*
 * The library's Import is the editor's Import. It used to share only the reading: no progress
 * sentence, no busy state, no refusal for a second pick, and a sentence of its own that said
 * nothing about the two XMind sheets it had just left behind. One flow now runs both, so what is
 * graded here is that this surface is wired into it — the words themselves belong to its own spec.
 */
describe('import', () => {
  const fileInput = () => host.querySelector('.assist-mm-library__file');
  const importButton = () => host.querySelector('.assist-mm-library__import');

  /** Put a file on the input the way the picker does. */
  const offer = file => {
    Object.defineProperty(fileInput(), 'files', { value: [file], configurable: true });
    fileInput().dispatchEvent(new Event('change', { bubbles: true }));
  };

  /** Enough turns of the loop for a file read to finish. */
  const settle = async () => {
    for (let turn = 0; turn < 12; turn += 1) {
      await flush();
    }
  };

  const outlineFile = (name = 'plan.md') =>
    new File(['# A map\n\n- One\n'], name, { type: 'text/markdown' });

  it('reads the chosen file and hands the map and its sentence to the page', async () => {
    await mount();

    offer(outlineFile());
    await settle();

    expect(options.onImport).toHaveBeenCalledTimes(1);
    const [map, sentence] = options.onImport.mock.calls[0];
    expect(map.title).toBe('A map');
    expect(sentence).toBe("Opened 'A map' from Markdown: 1 node.");
  });

  it('says a file is being opened, and marks itself busy while it is', async () => {
    await mount();

    offer(outlineFile('lecture.md'));

    expect(options.notify).toHaveBeenCalledWith('Opening lecture.md…', 'info');
    expect(host.querySelector('.assist-mm-library').getAttribute('aria-busy')).toBe('true');
    expect(importButton().getAttribute('aria-disabled')).toBe('true');

    await settle();

    expect(host.querySelector('.assist-mm-library').hasAttribute('aria-busy')).toBe(false);
    expect(importButton().hasAttribute('aria-disabled')).toBe(false);
  });

  it('refuses a second file while one is still opening, rather than racing it', async () => {
    await mount();

    offer(outlineFile('first.md'));
    offer(outlineFile('second.md'));
    await settle();

    expect(options.onImport).toHaveBeenCalledTimes(1);
    expect(options.notify).toHaveBeenCalledWith(
      'AssisT is still opening a file, so wait for that to finish before picking another.',
      'error'
    );
  });

  it('reports a file it cannot read, and gives the keyboard back to Import', async () => {
    await mount();

    offer(new File(['{ not json'], 'plan.json'));
    await settle();

    expect(options.onImport).not.toHaveBeenCalled();
    const [text, kind] = options.notify.mock.calls[options.notify.mock.calls.length - 1];
    expect(text).toContain('not valid JSON');
    expect(kind).toBe('error');
    expect(document.activeElement).toBe(importButton());
  });

  it('writes the live region exactly once for each thing it says', async () => {
    await mount();
    options.announce.mockClear();

    offer(new File(['{ not json'], 'plan.json'));
    await settle();

    const spoken = options.announce.mock.calls.map(call => call[0]);
    expect(spoken).toHaveLength(2);
    expect(spoken[0]).toBe('Opening plan.json…');
    expect(spoken[1]).toMatch(/^Problem: .*not valid JSON/);
  });
});

describe('destroy', () => {
  it('empties the host', async () => {
    await mount();

    view.destroy();
    view = null;

    expect(host.innerHTML).toBe('');
  });
});
