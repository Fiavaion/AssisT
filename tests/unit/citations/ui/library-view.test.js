/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/library-view.js — createLibraryView().
 *
 * Uses a FAKE store that implements the full store contract:
 *   - subscribe(fn) stores the fn and returns an unsubscribe; tracks whether it was called.
 *   - getState() returns controllable data.
 *   - getVisibleCitations() returns a controllable array.
 *   - setFilter / setStyle update internal state and invoke the stored subscriber so we can
 *     assert re-render behaviour.
 *   - remove is a jest.fn() returning a resolved Promise.
 */

import { createLibraryView } from '../../../../src/features/citations/ui/library-view.js';
import { showInfoTray } from '../../../../src/utils/action-tray.js';
import { EXPORT_FORMATS } from '../../../../src/features/citations/citation-export.js';

// The undo tray is asserted on directly (one tray per batch, carrying the undo), so it is mocked
// rather than mounted into document.body with its own timers.
jest.mock('../../../../src/utils/action-tray.js', () => ({ showInfoTray: jest.fn() }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCitation(id, title = `Citation ${id}`) {
  return {
    id,
    type: 'journal',
    title,
    authors: ['Smith, Jane'],
    publicationDate: '2022',
    url: `https://example.com/${id}`,
    accessDate: '2024-01-01',
    siteName: 'Example',
    publisher: 'Publisher Co',
    journal: 'Test Journal',
    // DOI-bearing so the sentinel badge (DOI-gated) mounts for these fixtures.
    doi: `10.1000/${id}`,
  };
}

const CITE_A = makeCitation('a', 'Alpha Source');
const CITE_B = makeCitation('b', 'Beta Source');
const CITE_C = makeCitation('c', 'Gamma Source');

// ── Fake store factory ────────────────────────────────────────────────────────

/**
 * Build a fake citation store implementing the contract expected by createLibraryView.
 *
 * @param {Object} [initial]
 * @param {Array}  [initial.citations=[]]
 * @param {Array}  [initial.visibleCitations=[]] - what getVisibleCitations() returns
 * @param {string} [initial.style='harvard']
 * @param {string} [initial.filter='']
 * @param {boolean} [initial.loading=false]
 */
function makeFakeStore({
  citations = [],
  visibleCitations = citations,
  style = 'harvard',
  filter = '',
  loading = false,
} = {}) {
  let _subscriber = null;
  let _state = { citations, projects: [], filter, activeProjectId: null, style, loading };
  let _visible = visibleCitations;

  function _emit() {
    if (_subscriber) {
      _subscriber(store.getState());
    }
  }

  const store = {
    subscribe: jest.fn(fn => {
      _subscriber = fn;
      return () => {
        _subscriber = null;
      };
    }),
    getState: jest.fn(() => ({ ..._state })),
    getVisibleCitations: jest.fn(() => [..._visible]),
    setFilter: jest.fn(query => {
      _state.filter = String(query || '');
      _emit();
    }),
    setStyle: jest.fn(id => {
      _state.style = id;
      _emit();
    }),
    remove: jest.fn(() => Promise.resolve()),

    // Test-only helpers — not part of the real store contract.
    _setVisibleCitations(list) {
      _visible = list;
    },
    _setState(partial) {
      _state = { ..._state, ...partial };
    },
    _emit,
  };

  return store;
}

// ── Helper: fire a mousedown event ────────────────────────────────────────────

function mousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

// ── Structure ─────────────────────────────────────────────────────────────────

describe('createLibraryView() — structure', () => {
  test('returns el and destroy', () => {
    const store = makeFakeStore();
    const view = createLibraryView({ store });

    expect(view.el).toBeInstanceOf(HTMLElement);
    expect(typeof view.destroy).toBe('function');
  });

  test('el has classes assist-cite-root and assist-cite-library', () => {
    const store = makeFakeStore();
    const { el } = createLibraryView({ store });

    expect(el.classList.contains('assist-cite-root')).toBe(true);
    expect(el.classList.contains('assist-cite-library')).toBe(true);
  });

  test('renders a search input with the correct type and aria-label', () => {
    const store = makeFakeStore();
    const { el } = createLibraryView({ store });

    const input = el.querySelector('input[type="search"]');
    expect(input).not.toBeNull();
    expect(input.getAttribute('aria-label')).toBe('Search your citations');
  });

  test('renders a "New citation" primary button', () => {
    const store = makeFakeStore();
    const { el } = createLibraryView({ store });

    const btn = el.querySelector('button.assist-cite-btn--primary');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('New citation');
  });

  test('renders the style switcher radiogroup', () => {
    const store = makeFakeStore();
    const { el } = createLibraryView({ store });

    const radiogroup = el.querySelector('[role="radiogroup"]');
    expect(radiogroup).not.toBeNull();
  });

  test('renders one card per visible citation on initial mount', () => {
    const store = makeFakeStore({
      citations: [CITE_A, CITE_B],
      visibleCitations: [CITE_A, CITE_B],
    });
    const { el } = createLibraryView({ store });

    const cards = el.querySelectorAll('.assist-cite-card');
    expect(cards.length).toBe(2);
  });
});

// ── Toolbar interactions ───────────────────────────────────────────────────────

describe('createLibraryView() — toolbar interactions', () => {
  test('typing in the search box calls store.setFilter with the input value', () => {
    const store = makeFakeStore();
    const { el } = createLibraryView({ store });

    const input = el.querySelector('input[type="search"]');
    input.value = 'Smith';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(store.setFilter).toHaveBeenCalledWith('Smith');
  });

  test('activating "New citation" (mousedown) calls onNewCitation', () => {
    const onNewCitation = jest.fn();
    const store = makeFakeStore();
    const { el } = createLibraryView({ store, onNewCitation });

    const btn = el.querySelector('button.assist-cite-btn--primary');
    mousedown(btn);

    expect(onNewCitation).toHaveBeenCalledTimes(1);
  });

  test('"New citation" does not throw when onNewCitation is not provided', () => {
    const store = makeFakeStore();
    const { el } = createLibraryView({ store });

    const btn = el.querySelector('button.assist-cite-btn--primary');
    expect(() => mousedown(btn)).not.toThrow();
  });
});

// ── Card callbacks ────────────────────────────────────────────────────────────

describe('createLibraryView() — card callbacks', () => {
  test('card Insert (mousedown) calls onInsertCitation with the citation', () => {
    const onInsertCitation = jest.fn();
    const store = makeFakeStore({ citations: [CITE_A], visibleCitations: [CITE_A] });
    const { el } = createLibraryView({ store, onInsertCitation });

    const insertBtn = el.querySelector(
      '.assist-cite-card__actions button.assist-cite-btn--primary'
    );
    expect(insertBtn).not.toBeNull();
    mousedown(insertBtn);

    expect(onInsertCitation).toHaveBeenCalledTimes(1);
    // The first argument should be the citation object (title check is enough).
    expect(onInsertCitation.mock.calls[0][0].title).toBe('Alpha Source');
  });

  test('card Remove (mousedown) calls store.remove with the citation id', () => {
    const store = makeFakeStore({ citations: [CITE_B], visibleCitations: [CITE_B] });
    const { el } = createLibraryView({ store });

    // Remove button is the ghost button on the card.
    const removeBtn = el.querySelector('.assist-cite-card__actions .assist-cite-btn--ghost');
    expect(removeBtn).not.toBeNull();
    mousedown(removeBtn);

    expect(store.remove).toHaveBeenCalledWith(CITE_B.id);
  });
});

// ── Subscription / re-render ──────────────────────────────────────────────────

describe('createLibraryView() — subscription / re-render', () => {
  test('store.subscribe is called exactly once during construction', () => {
    const store = makeFakeStore();
    createLibraryView({ store });

    expect(store.subscribe).toHaveBeenCalledTimes(1);
  });

  test('when the store emits a filtered-down list, the rendered card count updates', () => {
    const store = makeFakeStore({
      citations: [CITE_A, CITE_B, CITE_C],
      visibleCitations: [CITE_A, CITE_B, CITE_C],
    });
    const { el } = createLibraryView({ store });

    expect(el.querySelectorAll('.assist-cite-card').length).toBe(3);

    // Filter to one result.
    store._setVisibleCitations([CITE_A]);
    store._emit();

    expect(el.querySelectorAll('.assist-cite-card').length).toBe(1);
  });

  test('surviving card node identity is preserved across a filter update', () => {
    const store = makeFakeStore({
      citations: [CITE_A, CITE_B],
      visibleCitations: [CITE_A, CITE_B],
    });
    const { el } = createLibraryView({ store });

    const cards = el.querySelectorAll('.assist-cite-card');
    const nodeA = cards[0];
    const nodeB = cards[1];

    // Filter out B.
    store._setVisibleCitations([CITE_A]);
    store._emit();

    const remainingCards = el.querySelectorAll('.assist-cite-card');
    expect(remainingCards.length).toBe(1);
    // A's node must be the EXACT same object — no rebuild.
    expect(remainingCards[0]).toBe(nodeA);
    // B's node must no longer be in the DOM.
    expect(el.contains(nodeB)).toBe(false);
  });

  test('a snapshot with loading=true sets aria-busy on el', () => {
    const store = makeFakeStore({ loading: false });
    const { el } = createLibraryView({ store });

    expect(el.getAttribute('aria-busy')).toBeNull();

    store._setState({ loading: true });
    store._emit();

    expect(el.getAttribute('aria-busy')).toBe('true');
  });

  test('a snapshot with loading=false removes aria-busy from el', () => {
    const store = makeFakeStore({ loading: true });
    const { el } = createLibraryView({ store });

    expect(el.getAttribute('aria-busy')).toBe('true');

    store._setState({ loading: false });
    store._emit();

    expect(el.getAttribute('aria-busy')).toBeNull();
  });

  test('changing snapshot.style updates the radiogroup selection without triggering a store.setStyle call', () => {
    const store = makeFakeStore({ style: 'harvard' });
    const { el } = createLibraryView({ store });

    // The initial render calls setStyle 0 times (it was called in construction via switcher.setStyle
    // only; onChange is NOT fired by setStyle).
    store.setStyle.mockClear();

    // Emit a snapshot with a new style (simulates another context changing style).
    store._setState({ style: 'apa7' });
    store._emit();

    // The radiogroup should reflect apa7.
    const apa7btn = el.querySelector('[data-style="apa7"]');
    expect(apa7btn).not.toBeNull();
    expect(apa7btn.getAttribute('aria-checked')).toBe('true');

    // store.setStyle must NOT have been called by the view itself (no feedback loop).
    expect(store.setStyle).not.toHaveBeenCalled();
  });

  test('search input value is not overwritten while the input is focused', () => {
    const store = makeFakeStore({ filter: '' });
    const { el } = createLibraryView({ store });

    const input = el.querySelector('input[type="search"]');

    // Trigger the focus listener explicitly (mirrors what the browser fires on input.focus()).
    input.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    input.value = 'partial query';

    // Store emits for an unrelated reason (a reload, a style change): the filter is unchanged.
    store._setState({ loading: false });
    store._emit();

    // The typing user's value must be preserved because the input is focused.
    expect(input.value).toBe('partial query');
  });

  test('a filter cleared from elsewhere empties the search box even while it has focus', () => {
    // "All citations" pressed with the mouse clears the filter but leaves the focus in the box
    // (the button's mousedown is cancelled); the box must not go on showing the old search.
    const store = makeFakeStore({ filter: 'memory' });
    const { el } = createLibraryView({ store });
    const input = el.querySelector('input[type="search"]');
    input.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    input.value = 'memory';

    store._setState({ filter: '' });
    store._emit();

    expect(input.value).toBe('');
  });

  test('search input value IS updated when input is not focused and filter changed', () => {
    const store = makeFakeStore({ filter: '' });
    const { el } = createLibraryView({ store });

    const input = el.querySelector('input[type="search"]');
    // Ensure input is not focused.
    if (document.activeElement === input) {
      input.blur();
    }
    expect(document.activeElement).not.toBe(input);

    store._setState({ filter: 'remote query' });
    store._emit();

    expect(input.value).toBe('remote query');
  });
});

// ── Sentinel wiring (M7.5) ──────────────────────────────────────────────────────

describe('createLibraryView() — AI Claim Sentinel wiring', () => {
  /** A fake sentinel orchestrator matching the createCitationSentinel() contract. */
  function fakeSentinel() {
    return {
      verify: jest.fn(() => Promise.resolve({ status: 'verified', details: {} })),
      getStatus: jest.fn(() => null),
      invalidate: jest.fn(),
    };
  }

  test('forwards options.sentinel to each card: verify is called once per visible citation', () => {
    const sentinel = fakeSentinel();
    const store = makeFakeStore({
      citations: [CITE_A, CITE_B],
      visibleCitations: [CITE_A, CITE_B],
    });

    createLibraryView({ store, sentinel });

    expect(sentinel.verify).toHaveBeenCalledTimes(2);
  });

  test('renders a claim-sentinel badge on each card when a sentinel is provided', () => {
    const sentinel = fakeSentinel();
    const store = makeFakeStore({ citations: [CITE_A], visibleCitations: [CITE_A] });

    const { el } = createLibraryView({ store, sentinel });

    expect(el.querySelector('.assist-cite-sentinel')).not.toBeNull();
  });

  test('renders NO claim-sentinel badge when no sentinel is provided (AI off, no-stub guarantee)', () => {
    const store = makeFakeStore({ citations: [CITE_A], visibleCitations: [CITE_A] });

    const { el } = createLibraryView({ store });

    expect(el.querySelector('.assist-cite-sentinel')).toBeNull();
  });

  test('forwards options.analyser to cards: an "Analyse with AI" button appears on each card', () => {
    const analyser = { analyse: jest.fn(() => Promise.resolve({ available: true })) };
    const store = makeFakeStore({
      citations: [CITE_A, CITE_B],
      visibleCitations: [CITE_A, CITE_B],
    });

    const { el } = createLibraryView({ store, analyser });

    const analyseButtons = [...el.querySelectorAll('.assist-cite-card button')].filter(b =>
      /Analyse/.test(b.textContent)
    );
    expect(analyseButtons).toHaveLength(2);
  });

  test('renders NO "Analyse with AI" button when no analyser is provided (AI off)', () => {
    const store = makeFakeStore({ citations: [CITE_A], visibleCitations: [CITE_A] });

    const { el } = createLibraryView({ store });

    const analyseButtons = [...el.querySelectorAll('.assist-cite-card button')].filter(b =>
      /Analyse/.test(b.textContent)
    );
    expect(analyseButtons).toHaveLength(0);
  });

  test('verifies a citation that first appears via a later store emit', () => {
    const sentinel = fakeSentinel();
    const store = makeFakeStore({ citations: [], visibleCitations: [] });

    createLibraryView({ store, sentinel });
    expect(sentinel.verify).not.toHaveBeenCalled();

    // A citation arrives after construction (e.g. a content-script save propagating in).
    store._setVisibleCitations([CITE_A]);
    store._emit();

    expect(sentinel.verify).toHaveBeenCalledTimes(1);
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────────

describe('createLibraryView() — destroy()', () => {
  test('destroy() unsubscribes: a later emit does not change the DOM', () => {
    // Use a store that starts with one citation, then would expand to two after an emit.
    const store = makeFakeStore({ citations: [CITE_A], visibleCitations: [CITE_A] });
    const { destroy } = createLibraryView({ store });

    // After destroy(), the list component's destroy() also removes its own card nodes — that is
    // correct teardown. The invariant we are testing is that the SUBSCRIBER was removed so that
    // a later store emit (which would normally change the rendered content) has no effect.
    // We verify this by tracking whether store.getVisibleCitations is called after destroy().
    store.getVisibleCitations.mockClear();

    destroy();

    // Emit — if the subscriber was removed, getVisibleCitations must NOT be called.
    store._setVisibleCitations([CITE_A, CITE_B]);
    store._emit();

    expect(store.getVisibleCitations).not.toHaveBeenCalled();
  });

  test('destroy() does not throw when called on a freshly constructed view', () => {
    const store = makeFakeStore();
    const { destroy } = createLibraryView({ store });
    expect(() => destroy()).not.toThrow();
  });

  test('destroy() removes the search input listener: further input events do not call setFilter', () => {
    const store = makeFakeStore();
    const { el, destroy } = createLibraryView({ store });

    destroy();
    store.setFilter.mockClear();

    const input = el.querySelector('input[type="search"]');
    input.value = 'after destroy';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(store.setFilter).not.toHaveBeenCalled();
  });
});

// ── The trash view ────────────────────────────────────────────────────────────

describe('createLibraryView() — the trash', () => {
  const TRASHED_A = { ...makeCitation('t1', 'Removed Alpha'), deletedAt: '2026-09-01T10:00:00Z' };
  const TRASHED_B = { ...makeCitation('t2', 'Removed Beta'), deletedAt: '2026-09-02T10:00:00Z' };

  /**
   * A fake store that can switch between the library and the trash.
   *
   * Restore and purge behave as the real store does: the reload emits BEFORE the promise settles,
   * so the card holding the focus is destroyed while the handler is still suspended. Anything that
   * reads document.activeElement after the await is reading <body>.
   */
  function makeTrashStore({
    trashed = [TRASHED_A, TRASHED_B],
    view = 'trash',
    restoreResult = true,
  } = {}) {
    let _subscriber = null;
    const _state = {
      citations: [],
      projects: [],
      filter: '',
      activeProjectId: null,
      style: 'harvard',
      loading: false,
      trashed,
      view,
    };
    function _emit() {
      if (_subscriber) {
        _subscriber({ ..._state, trashed: [..._state.trashed] });
      }
    }
    function _drop(id) {
      _state.trashed = _state.trashed.filter(c => c.id !== id);
      _emit();
    }
    return {
      subscribe: jest.fn(fn => {
        _subscriber = fn;
        return () => {
          _subscriber = null;
        };
      }),
      getState: jest.fn(() => ({ ..._state, trashed: [..._state.trashed] })),
      getVisibleCitations: jest.fn(() => []),
      setFilter: jest.fn(),
      setStyle: jest.fn(),
      remove: jest.fn(() => Promise.resolve()),
      restore: jest.fn(id => {
        if (restoreResult) {
          _drop(id);
        }
        return Promise.resolve(restoreResult);
      }),
      purge: jest.fn(id => {
        _drop(id);
        return Promise.resolve();
      }),
      emptyTrash: jest.fn(() => {
        const purged = _state.trashed.length;
        _state.trashed = [];
        _emit();
        return Promise.resolve(purged);
      }),
      setView: jest.fn(next => {
        _state.view = next;
        _emit();
      }),
    };
  }

  function cardTitles(el) {
    return [...el.querySelectorAll('.assist-cite-card__title')].map(n => n.textContent);
  }

  function buttonNamed(el, label) {
    return [...el.querySelectorAll('button')].find(b => b.textContent === label);
  }

  test('lists the trashed citations instead of the library', () => {
    const { el } = createLibraryView({ store: makeTrashStore() });

    expect(cardTitles(el)).toEqual(['Removed Alpha', 'Removed Beta']);
  });

  test('hides the library toolbar and says how long the trash keeps things', () => {
    const { el } = createLibraryView({ store: makeTrashStore() });

    expect(el.querySelector('.assist-cite-toolbar').hidden).toBe(true);
    const note = el.querySelector('.assist-cite-trash__note');
    expect(note.textContent).toContain('30 days');
  });

  test('the library view shows the toolbar and no trash panel', () => {
    const { el } = createLibraryView({ store: makeTrashStore({ view: 'library' }) });

    expect(el.querySelector('.assist-cite-toolbar').hidden).toBe(false);
    expect(el.querySelector('.assist-cite-trash').hidden).toBe(true);
  });

  test('a trashed card offers Restore and Delete permanently, and nothing else', () => {
    const { el } = createLibraryView({
      store: makeTrashStore(),
      onEditCitation: jest.fn(),
      onInsertCitation: jest.fn(),
      onCopyInText: jest.fn(),
    });

    const card = el.querySelector('.assist-cite-card');
    const labels = [...card.querySelectorAll('.assist-cite-card__actions button')].map(
      b => b.textContent
    );
    expect(labels).toEqual(['Restore', 'Delete permanently']);
  });

  test('Restore asks the store to restore that citation', () => {
    const store = makeTrashStore();
    const { el } = createLibraryView({ store });

    mousedown(buttonNamed(el, 'Restore'));

    expect(store.restore).toHaveBeenCalledWith('t1');
  });

  test('Delete permanently confirms first, then purges', () => {
    const store = makeTrashStore();
    const { el } = createLibraryView({ store });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    mousedown(buttonNamed(el, 'Delete permanently'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(store.purge).toHaveBeenCalledWith('t1');
    confirmSpy.mockRestore();
  });

  test('Empty trash is the one action that asks before it destroys anything', () => {
    const store = makeTrashStore();
    const { el } = createLibraryView({ store });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    mousedown(el.querySelector('.assist-cite-trash__empty'));

    expect(confirmSpy).toHaveBeenCalled();
    expect(store.emptyTrash).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    mousedown(el.querySelector('.assist-cite-trash__empty'));
    expect(store.emptyTrash).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  test('offers a way back to the library', () => {
    const store = makeTrashStore();
    const { el } = createLibraryView({ store });

    mousedown(el.querySelector('.assist-cite-trash__back'));

    expect(store.setView).toHaveBeenCalledWith('library');
  });

  test('an empty trash says so rather than looking broken', () => {
    const { el } = createLibraryView({ store: makeTrashStore({ trashed: [] }) });

    const empty = el.querySelector('.assist-cite-empty');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain('Recently removed');
  });

  // ── Keyboard place-keeping ──────────────────────────────────────────────────
  // Every action here destroys the card the student is standing on. Focus must land somewhere
  // they can carry on from; <body> means the keyboard user starts the page again.

  describe('focus never lands on <body>', () => {
    /** Mount into the document — focus() on a detached tree does nothing. */
    function mounted(store) {
      const view = createLibraryView({ store });
      document.body.appendChild(view.el);
      return { view, el: view.el, store };
    }

    const cardButtons = (el, label) =>
      [...el.querySelectorAll('.assist-cite-card')].map(card =>
        [...card.querySelectorAll('button')].find(b => b.textContent === label)
      );

    /** Let the awaited store call inside the handler settle. */
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    afterEach(() => {
      document.body.replaceChildren();
    });

    test('Restore moves focus to the next card’s Restore button', async () => {
      const { el } = mounted(makeTrashStore());
      const [first, second] = cardButtons(el, 'Restore');
      first.focus();

      mousedown(first);
      await settle();

      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(second);
    });

    test('Delete permanently moves focus to the next card’s own Delete button', async () => {
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      const { el } = mounted(makeTrashStore());
      const [first, second] = cardButtons(el, 'Delete permanently');
      first.focus();

      mousedown(first);
      await settle();

      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(second);
      confirmSpy.mockRestore();
    });

    test('emptying the last card falls back to the trash panel’s Back button', async () => {
      const { el } = mounted(makeTrashStore({ trashed: [TRASHED_A] }));
      const [only] = cardButtons(el, 'Restore');
      only.focus();

      mousedown(only);
      await settle();

      expect(document.activeElement).toBe(el.querySelector('.assist-cite-trash__back'));
    });

    test('Back to your library does not hide the panel with the focus still inside it', () => {
      const { el } = mounted(makeTrashStore());

      const back = el.querySelector('.assist-cite-trash__back');
      back.focus();
      mousedown(back);

      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(el.querySelector('input[type="search"]'));
    });
  });

  // ── An undo that cannot work must say so ────────────────────────────────────

  test('reports the failure when the citation was already deleted permanently', async () => {
    const store = makeTrashStore({ restoreResult: false });
    const { el } = createLibraryView({ store });

    mousedown(buttonNamed(el, 'Restore'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(showInfoTray).toHaveBeenCalledTimes(1);
    expect(showInfoTray.mock.calls[0][0]).toMatchObject({
      message: 'That citation was deleted permanently and cannot be restored',
      variant: 'error',
    });
  });

  test('confirms the restore when it worked', async () => {
    const { el } = createLibraryView({ store: makeTrashStore() });

    mousedown(buttonNamed(el, 'Restore'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(showInfoTray.mock.calls[0][0].message).toContain('Restored');
    expect(showInfoTray.mock.calls[0][0].variant).toBeUndefined();
  });
});

// ── Multi-select ──────────────────────────────────────────────────────────────

describe('createLibraryView() — multi-select', () => {
  /** A fake store carrying everything the selection bar touches. */
  function makeSelectionStore({
    citations = [CITE_A, CITE_B, CITE_C],
    projects = [{ id: 'p1', name: 'Essay one' }],
    view = 'library',
  } = {}) {
    let _subscriber = null;
    let _visible = citations;
    const _state = {
      citations,
      projects,
      trashed: [],
      filter: '',
      activeProjectId: null,
      style: 'harvard',
      loading: false,
      view,
    };
    function _emit() {
      if (_subscriber) {
        _subscriber({ ..._state, citations: [..._state.citations] });
      }
    }
    const store = {
      subscribe: jest.fn(fn => {
        _subscriber = fn;
        return () => {
          _subscriber = null;
        };
      }),
      getState: jest.fn(() => ({ ..._state })),
      getVisibleCitations: jest.fn(() => [..._visible]),
      setFilter: jest.fn(query => {
        _state.filter = String(query || '');
        _visible = _state.citations.filter(c =>
          c.title.toLowerCase().includes(_state.filter.toLowerCase())
        );
        _emit();
      }),
      setActiveProject: jest.fn(id => {
        _state.activeProjectId = id;
        _emit();
      }),
      setStyle: jest.fn(id => {
        _state.style = id;
        _emit();
      }),
      setView: jest.fn(next => {
        _state.view = next;
        _emit();
      }),
      remove: jest.fn(id => {
        _state.citations = _state.citations.filter(c => c.id !== id);
        _visible = _visible.filter(c => c.id !== id);
        _emit();
        return Promise.resolve();
      }),
      restore: jest.fn(() => Promise.resolve()),
      refileCitations: jest.fn(() => Promise.resolve()),
      _emit,
    };
    return store;
  }

  const boxesOf = el => [...el.querySelectorAll('input.assist-cite-card__select')];
  const barOf = el => el.querySelector('.assist-cite-selectbar');
  const selectAllOf = el => el.querySelector('input.assist-cite-toolbar__selectall-box');
  const barButton = (el, label) =>
    [...barOf(el).querySelectorAll('button')].find(b => b.textContent === label);

  function tick(box, checked = true) {
    box.checked = checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function mountedView(options = {}) {
    const store = options.store || makeSelectionStore();
    const view = createLibraryView({
      store,
      onAssignProject: jest.fn(),
      ...options,
    });
    document.body.appendChild(view.el);
    return { store, view, el: view.el };
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  /** Let the awaited store calls inside a batch action settle. */
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  test('every library card carries a checkbox named after its citation', () => {
    const { el } = mountedView();
    expect(boxesOf(el).map(b => b.getAttribute('aria-label'))).toEqual([
      'Select Alpha Source',
      'Select Beta Source',
      'Select Gamma Source',
    ]);
  });

  test('the selection bar is hidden until something is selected', () => {
    const { el } = mountedView();
    const bar = barOf(el);
    expect(bar).not.toBeNull();
    expect(bar.hidden).toBe(true);
    expect(bar.getAttribute('role')).toBe('toolbar');
  });

  test('selecting a card reveals the bar with a live count', () => {
    const { el } = mountedView();

    tick(boxesOf(el)[0]);

    const bar = barOf(el);
    expect(bar.hidden).toBe(false);
    const count = bar.querySelector('.assist-cite-selectbar__count');
    expect(count.getAttribute('aria-live')).toBe('polite');
    expect(count.textContent).toBe('1 selected');

    tick(boxesOf(el)[1]);
    expect(bar.querySelector('.assist-cite-selectbar__count').textContent).toBe('2 selected');
  });

  test('the bar does not steal focus when it appears', () => {
    const { el } = mountedView();
    const box = boxesOf(el)[0];
    box.focus();

    tick(box);

    expect(document.activeElement).toBe(box);
  });

  test('Select all shown selects every visible citation', () => {
    const { el } = mountedView();

    tick(selectAllOf(el));

    expect(boxesOf(el).every(b => b.checked)).toBe(true);
    expect(barOf(el).querySelector('.assist-cite-selectbar__count').textContent).toBe('3 selected');
  });

  test('Select all shown unticks everything when it is cleared', () => {
    const { el } = mountedView();
    tick(selectAllOf(el));

    tick(selectAllOf(el), false);

    expect(boxesOf(el).some(b => b.checked)).toBe(false);
    expect(barOf(el).hidden).toBe(true);
  });

  test('Select all shown is indeterminate when only some are selected', () => {
    const { el } = mountedView();

    tick(boxesOf(el)[0]);
    expect(selectAllOf(el).indeterminate).toBe(true);
    expect(selectAllOf(el).checked).toBe(false);

    tick(boxesOf(el)[1]);
    tick(boxesOf(el)[2]);
    expect(selectAllOf(el).indeterminate).toBe(false);
    expect(selectAllOf(el).checked).toBe(true);
  });

  test('Escape clears the selection', () => {
    const { el } = mountedView();
    tick(boxesOf(el)[0]);

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(barOf(el).hidden).toBe(true);
    expect(boxesOf(el).some(b => b.checked)).toBe(false);
  });

  test('Remove soft-deletes each selected record and shows ONE undo tray', async () => {
    const { el, store } = mountedView();
    tick(boxesOf(el)[0]);
    tick(boxesOf(el)[1]);

    mousedown(barButton(el, 'Remove'));
    await settle();

    expect(store.remove).toHaveBeenCalledTimes(2);
    expect(store.remove).toHaveBeenNthCalledWith(1, 'a');
    expect(store.remove).toHaveBeenNthCalledWith(2, 'b');
    expect(showInfoTray).toHaveBeenCalledTimes(1);
    expect(showInfoTray.mock.calls[0][0].message).toBe('Removed 2 citations');
  });

  test('the batch undo restores every removed citation', async () => {
    const { el, store } = mountedView();
    tick(boxesOf(el)[0]);
    tick(boxesOf(el)[1]);

    mousedown(barButton(el, 'Remove'));
    await settle();

    await showInfoTray.mock.calls[0][0].onAction();

    expect(store.restore).toHaveBeenCalledTimes(2);
    expect(store.restore.mock.calls.map(c => c[0])).toEqual(['a', 'b']);
  });

  test('the batch undo says how many came back', async () => {
    const { el, store } = mountedView();
    store.restore.mockResolvedValue(true);
    tick(boxesOf(el)[0]);
    tick(boxesOf(el)[1]);

    mousedown(barButton(el, 'Remove'));
    await settle();
    await showInfoTray.mock.calls[0][0].onAction();

    expect(showInfoTray).toHaveBeenCalledTimes(2);
    expect(showInfoTray.mock.calls[1][0].message).toBe('Restored 2 citations');
  });

  test('the batch undo reports the ones that could not come back', async () => {
    const { el, store } = mountedView();
    store.restore.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    tick(boxesOf(el)[0]);
    tick(boxesOf(el)[1]);

    mousedown(barButton(el, 'Remove'));
    await settle();
    await showInfoTray.mock.calls[0][0].onAction();

    expect(showInfoTray.mock.calls[1][0]).toMatchObject({
      message: 'Restored 1 of 2 citations — the rest were deleted permanently',
      variant: 'error',
    });
  });

  test('a card Remove keeps the focus in the list instead of dropping it on <body>', async () => {
    const { el } = mountedView();
    const removeButtons = [...el.querySelectorAll('.assist-cite-card')].map(card =>
      [...card.querySelectorAll('button')].find(b => b.textContent === 'Remove')
    );
    removeButtons[0].focus();

    mousedown(removeButtons[0]);
    await settle();

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(removeButtons[1]);
  });

  test('the batch Remove hands focus to a card that survived it', async () => {
    const { el } = mountedView();
    const survivor = [...el.querySelectorAll('.assist-cite-card')][2].querySelector('button');
    tick(boxesOf(el)[0]);
    tick(boxesOf(el)[1]);
    barButton(el, 'Remove').focus();

    mousedown(barButton(el, 'Remove'));
    await settle();

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(survivor);
  });

  test('the batch Remove falls back to the search box when nothing survives', async () => {
    const { el } = mountedView();
    tick(selectAllOf(el));
    barButton(el, 'Remove').focus();

    mousedown(barButton(el, 'Remove'));
    await settle();

    expect(document.activeElement).toBe(el.querySelector('input[type="search"]'));
  });

  test('the selection empties itself once its citations are gone', async () => {
    const { el } = mountedView();
    tick(boxesOf(el)[0]);

    mousedown(barButton(el, 'Remove'));
    await settle();

    expect(barOf(el).hidden).toBe(true);
  });

  test('files the whole selection into a collection in one store call', async () => {
    const { el, store } = mountedView();
    tick(boxesOf(el)[0]);
    tick(boxesOf(el)[2]);

    const filePicker = el.querySelector('select.assist-cite-selectbar__file');
    expect([...filePicker.options].map(o => o.textContent)).toContain('Essay one');
    filePicker.value = 'p1';
    filePicker.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(store.refileCitations).toHaveBeenCalledTimes(1);
    expect(store.refileCitations).toHaveBeenCalledWith(['a', 'c'], 'p1');
  });

  test('filing clears the selection, whether or not the cards stay on screen', async () => {
    const { el } = mountedView();
    tick(boxesOf(el)[0]);
    tick(boxesOf(el)[2]);

    const filePicker = el.querySelector('select.assist-cite-selectbar__file');
    filePicker.value = 'p1';
    filePicker.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(barOf(el).hidden).toBe(true);
    expect(boxesOf(el).some(b => b.checked)).toBe(false);
  });

  test('copies a bibliography of the selection only', () => {
    const onCopyBibliography = jest.fn();
    const { el } = mountedView({ onCopyBibliography });
    tick(boxesOf(el)[1]);

    mousedown(barButton(el, 'Copy bibliography'));

    expect(onCopyBibliography).toHaveBeenCalledTimes(1);
    expect(onCopyBibliography.mock.calls[0][0].map(c => c.id)).toEqual(['b']);
  });

  test('exports the selection in the chosen format and resets the menu', () => {
    const onExportCitations = jest.fn();
    const { el } = mountedView({ onExportCitations });
    tick(boxesOf(el)[0]);

    const exportPicker = el.querySelector('select.assist-cite-selectbar__export');
    exportPicker.value = 'ris';
    exportPicker.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onExportCitations).toHaveBeenCalledWith('ris', [expect.objectContaining({ id: 'a' })]);
    expect(exportPicker.value).toBe('');
  });

  test('the format menu is the shared list, so it cannot drift from the header’s', () => {
    const { el } = mountedView({ onExportCitations: jest.fn() });

    const exportPicker = el.querySelector('select.assist-cite-selectbar__export');
    expect([...exportPicker.options].map(o => [o.value, o.textContent])).toEqual(EXPORT_FORMATS);
  });

  test('offers no copy or export control when the page provides no handler', () => {
    const { el } = mountedView();
    expect(el.querySelector('select.assist-cite-selectbar__export')).toBeNull();
    tick(boxesOf(el)[0]);
    expect(barButton(el, 'Copy bibliography')).toBeUndefined();
  });

  test('the selection survives a style switch and a re-sort', () => {
    const { el, store } = mountedView();
    tick(boxesOf(el)[0]);

    store.setStyle('apa');
    expect(barOf(el).querySelector('.assist-cite-selectbar__count').textContent).toBe('1 selected');

    const sort = el.querySelector('.assist-cite-toolbar__sort select');
    sort.value = 'title';
    sort.dispatchEvent(new Event('change', { bubbles: true }));

    expect(barOf(el).querySelector('.assist-cite-selectbar__count').textContent).toBe('1 selected');
    expect(boxesOf(el).filter(b => b.checked)).toHaveLength(1);
  });

  test('a search clears the selection', () => {
    const { el, store } = mountedView();
    tick(boxesOf(el)[0]);

    store.setFilter('Alpha');

    expect(barOf(el).hidden).toBe(true);
    expect(boxesOf(el).some(b => b.checked)).toBe(false);
  });

  test('changing the collection filter clears the selection', () => {
    const { el, store } = mountedView();
    tick(boxesOf(el)[0]);

    store.setActiveProject('p1');

    expect(barOf(el).hidden).toBe(true);
  });

  test('the trash offers no selection at all', () => {
    const { el, store } = mountedView();
    tick(boxesOf(el)[0]);

    store.setView('trash');

    expect(boxesOf(el)).toHaveLength(0);
    expect(barOf(el).hidden).toBe(true);
    expect(el.querySelector('.assist-cite-toolbar').hidden).toBe(true);
  });
});

// ── The storage echo ──────────────────────────────────────────────────────────

/**
 * The library re-renders twice for every mutation: once for the store's own reload, and again a
 * moment later when chrome.storage.onChanged echoes the write back. The second render is what took
 * a keyboard student's place in the list — the reconcile re-inserts every surviving card, and
 * re-inserting a node that contains document.activeElement blurs it in Chrome.
 *
 * jsdom does not model that blur, so these tests install it: `emulateChromeReinsertBlur` wraps the
 * list's <ul>.appendChild and blurs the active element when it is moved, exactly as the browser does.
 * Without the view's focus preservation every test in this block fails on <body>.
 */
describe('createLibraryView() — focus survives the storage echo', () => {
  function makeEchoStore(citations = [CITE_A, CITE_B, CITE_C]) {
    let _subscriber = null;
    const _state = {
      citations: [...citations],
      projects: [],
      trashed: [],
      filter: '',
      activeProjectId: null,
      style: 'harvard',
      loading: false,
      view: 'library',
    };
    function _emit() {
      if (_subscriber) {
        _subscriber({ ..._state, citations: [..._state.citations] });
      }
    }
    return {
      subscribe: jest.fn(fn => {
        _subscriber = fn;
        return () => {
          _subscriber = null;
        };
      }),
      getState: jest.fn(() => ({ ..._state })),
      getVisibleCitations: jest.fn(() =>
        _state.citations.filter(c =>
          _state.filter ? c.title.toLowerCase().includes(_state.filter.toLowerCase()) : true
        )
      ),
      setFilter: jest.fn(query => {
        _state.filter = String(query || '');
        _emit();
      }),
      setStyle: jest.fn(),
      setView: jest.fn(),
      setActiveProject: jest.fn(),
      remove: jest.fn(id => {
        _state.citations = _state.citations.filter(c => c.id !== id);
        _emit();
        return Promise.resolve();
      }),
      restore: jest.fn(() => Promise.resolve(true)),
      refileCitations: jest.fn(() => Promise.resolve()),

      /** The same data, emitted again — what chrome.storage.onChanged causes. */
      _echo: _emit,
      /** A citation arriving in the library: a save, or an Undo putting one back. */
      _add(citation) {
        _state.citations = [citation, ..._state.citations];
        _emit();
      },
    };
  }

  /** Blur the active element when the node holding it is re-inserted, as Chrome does. */
  function emulateChromeReinsertBlur(el) {
    const ul = el.querySelector('ul.assist-cite-list');
    const nativeAppend = ul.appendChild.bind(ul);
    ul.appendChild = node => {
      const active = document.activeElement;
      const result = nativeAppend(node);
      if (active && active !== document.body && node.contains(active)) {
        active.blur();
      }
      return result;
    };
  }

  function mount(citations) {
    const store = makeEchoStore(citations);
    const view = createLibraryView({ store, onEditCitation: jest.fn() });
    document.body.appendChild(view.el);
    emulateChromeReinsertBlur(view.el);
    return { store, view, el: view.el };
  }

  const cardsOf = el => [...el.querySelectorAll('.assist-cite-card')];
  const buttonIn = (card, label) =>
    [...card.querySelectorAll('button')].find(b => b.textContent === label);

  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  afterEach(() => {
    document.body.replaceChildren();
  });

  test('two consecutive renders leave the focus exactly where it was', () => {
    const { el, store } = mount();
    const target = buttonIn(cardsOf(el)[1], 'Remove');
    target.focus();

    store._echo();
    store._echo();

    expect(document.activeElement).toBe(target);
  });

  test('Remove lands on the neighbour and the echo does not take it away', async () => {
    const { el, store } = mount();
    const removes = cardsOf(el).map(card => buttonIn(card, 'Remove'));
    removes[0].focus();

    mousedown(removes[0]);
    await settle();
    expect(document.activeElement).toBe(removes[1]);

    store._echo();

    expect(document.activeElement).toBe(removes[1]);
  });

  test('the echo after an edit leaves the focus on that card’s Edit button', () => {
    const { el, store } = mount();
    const edit = buttonIn(cardsOf(el)[1], 'Edit');
    edit.focus();

    store._echo();

    expect(document.activeElement).toBe(edit);
  });

  test('a saved new citation hands the focus to its card', () => {
    const { el, store } = mount();
    const newBtn = [...el.querySelectorAll('button')].find(b => b.textContent === 'New citation');
    // The wizard gives the focus back to the button that opened it before the store is written.
    newBtn.focus();

    store._add(makeCitation('new', 'Newly Saved Source'));

    const newCard = cardsOf(el).find(card => /Newly Saved Source/.test(card.textContent));
    expect(newCard.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  test('a citation brought back by Undo takes the focus from <body>', () => {
    const { el, store } = mount();
    // The tray's Undo button is outside the view and goes with the tray, leaving nothing focused.
    document.body.focus();

    store._add(makeCitation('back', 'Restored Source'));

    const card = cardsOf(el).find(c => /Restored Source/.test(c.textContent));
    expect(card.contains(document.activeElement)).toBe(true);
  });

  test('a card already holding the focus keeps it when another citation arrives', () => {
    const { el, store } = mount();
    const target = buttonIn(cardsOf(el)[2], 'Remove');
    target.focus();

    store._add(makeCitation('new', 'Newly Saved Source'));

    expect(document.activeElement).toBe(target);
  });

  test('a citation arriving while a dialog is open does not pull the focus out of it', () => {
    const { store } = mount();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inside = document.createElement('button');
    dialog.appendChild(inside);
    document.body.appendChild(dialog);
    inside.focus();

    store._add(makeCitation('new', 'Newly Saved Source'));

    expect(document.activeElement).toBe(inside);
  });

  test('a search narrowing to one match does not move the focus onto it', () => {
    const { store } = mount();
    document.body.focus();

    store.setFilter('Gamma');

    expect(document.activeElement).toBe(document.body);
  });
});

// ── What a card shows ─────────────────────────────────────────────────────────

/**
 * The library's cards render the reference the way it will paste. Overnight testing found the
 * italics existed only in the copied rich flavour (verified <em> on book title, journal name and
 * volume), so a student could not see what their reference list would look like.
 */
describe('createLibraryView() — the reference on a card', () => {
  function mountWith(citation) {
    const store = makeFakeStore({ citations: [citation], visibleCitations: [citation] });
    const view = createLibraryView({ store });
    document.body.appendChild(view.el);
    return view.el;
  }

  afterEach(() => {
    document.body.replaceChildren();
  });

  /** Harvard italicises a book's title — the clearest case of something a student must be able to see. */
  const BOOK = {
    id: 'bk',
    type: 'book',
    title: 'Thinking, Fast and Slow',
    authors: ['Kahneman, Daniel'],
    publicationDate: '2011',
    publisher: 'Farrar, Straus and Giroux',
    url: 'https://example.com/book',
  };

  test('shows the parts the style italicises as real italics', () => {
    const el = mountWith(BOOK);

    const ref = el.querySelector('.assist-cite-card__reference');
    const italics = [...ref.querySelectorAll('em')].map(node => node.textContent);
    expect(italics).toContain('Thinking, Fast and Slow');
  });

  test('the plain reading of the reference is unchanged by the markup', () => {
    const el = mountWith(BOOK);

    const ref = el.querySelector('.assist-cite-card__reference');
    expect(ref.textContent).toContain('Thinking, Fast and Slow');
    expect(ref.textContent).toContain('Kahneman');
  });

  test('markup smuggled in from a scraped page is shown as text, never rendered', () => {
    const el = mountWith({
      ...makeCitation('x', '<img src=x onerror="alert(1)">Scraped Title'),
      journal: '<script>alert(2)</script>Journal',
    });

    const ref = el.querySelector('.assist-cite-card__reference');
    expect(ref.querySelector('img')).toBeNull();
    expect(ref.querySelector('script')).toBeNull();
    // The formatter escapes the record's metadata, so the tags arrive as the characters they are:
    // the student sees what the page tried to smuggle in, and no element carries an event handler.
    expect(ref.textContent).toContain('<img src=x onerror="alert(1)">');
    for (const node of ref.querySelectorAll('*')) {
      expect(node.attributes).toHaveLength(0);
    }
  });
});
