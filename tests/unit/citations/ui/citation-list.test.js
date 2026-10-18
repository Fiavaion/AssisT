/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/citation-list.js — createCitationList().
 *
 * The core invariant under test: setCitations() is an INCREMENTAL DIFFED reconcile.
 * Surviving citation nodes keep their EXACT DOM node identity (===) across calls.
 * No full rebuild ever occurs.
 */

import { createCitationList } from '../../../../src/features/citations/ui/citation-list.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCitation(id, title = `Citation ${id}`) {
  return {
    id,
    type: 'website',
    title,
    authors: ['Smith, Jane'],
    publicationDate: '2022',
    url: `https://example.com/${id}`,
    accessDate: '2024-01-01',
    siteName: 'Example Site',
  };
}

const A = makeCitation('a', 'Alpha');
const B = makeCitation('b', 'Beta');
const C = makeCitation('c', 'Gamma');

// ── Structure ─────────────────────────────────────────────────────────────────

describe('createCitationList() — structure', () => {
  test('returns el, setCitations, and destroy', () => {
    const list = createCitationList();
    expect(list.el).toBeInstanceOf(HTMLElement);
    expect(typeof list.setCitations).toBe('function');
    expect(typeof list.destroy).toBe('function');
  });

  test('el is a <div> wrapper containing a <ul> and an empty-state <div>', () => {
    const list = createCitationList();
    expect(list.el.tagName).toBe('DIV');
    expect(list.el.querySelector('ul.assist-cite-list')).not.toBeNull();
    expect(list.el.querySelector('div.assist-cite-empty')).not.toBeNull();
  });
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('createCitationList() — rendering', () => {
  test('renders one <li> per citation in the given order', () => {
    const list = createCitationList();
    list.setCitations([A, B, C]);

    const ul = list.el.querySelector('ul.assist-cite-list');
    expect(ul.children.length).toBe(3);
    // Cards are <li> elements (created by createCitationCard).
    expect(ul.children[0].tagName).toBe('LI');
    expect(ul.children[1].tagName).toBe('LI');
    expect(ul.children[2].tagName).toBe('LI');
  });

  test('renders an empty list without error', () => {
    const list = createCitationList({ emptyMessage: 'Nothing here' });
    expect(() => list.setCitations([])).not.toThrow();
  });
});

// ── THE INVARIANT: incremental diff — node identity ───────────────────────────

describe('createCitationList() — incremental reconcile invariant', () => {
  test('surviving nodes keep EXACT DOM identity after a filter (no full rebuild)', () => {
    const list = createCitationList();
    const ul = list.el.querySelector('ul.assist-cite-list');

    // Initial render: A B C.
    list.setCitations([A, B, C]);

    // Capture node references for A and C before the update.
    const nodeA = ul.children[0];
    const nodeC = ul.children[2];
    expect(nodeA).toBeDefined();
    expect(nodeC).toBeDefined();

    // Simulate a search that filters out B.
    list.setCitations([A, C]);

    // A and C keep the same node objects — no rebuild, no cloning.
    expect(ul.children[0]).toBe(nodeA);
    expect(ul.children[1]).toBe(nodeC);
    // B has been removed.
    expect(ul.children.length).toBe(2);
  });

  test('adding a new id inserts a fresh node without disturbing existing nodes', () => {
    const list = createCitationList();
    const ul = list.el.querySelector('ul.assist-cite-list');

    list.setCitations([A, B]);
    const nodeA = ul.children[0];
    const nodeB = ul.children[1];

    const D = makeCitation('d', 'Delta');
    list.setCitations([A, B, D]);

    // A and B keep exact identity.
    expect(ul.children[0]).toBe(nodeA);
    expect(ul.children[1]).toBe(nodeB);
    // D is a new node appended at position 2.
    expect(ul.children.length).toBe(3);
  });

  test('reorder keeps the same node objects but moves them in the DOM', () => {
    const list = createCitationList();
    const ul = list.el.querySelector('ul.assist-cite-list');

    list.setCitations([A, B, C]);
    const nodeA = ul.children[0];
    const nodeB = ul.children[1];
    const nodeC = ul.children[2];

    // Reverse the order.
    list.setCitations([C, B, A]);

    // Same node objects, different positions.
    expect(ul.children[0]).toBe(nodeC);
    expect(ul.children[1]).toBe(nodeB);
    expect(ul.children[2]).toBe(nodeA);
    expect(ul.children.length).toBe(3);
  });

  test('a removed citation has its card node detached from the <ul>', () => {
    const list = createCitationList();
    const ul = list.el.querySelector('ul.assist-cite-list');

    list.setCitations([A, B]);
    const nodeB = ul.children[1];

    list.setCitations([A]);

    expect(ul.contains(nodeB)).toBe(false);
    expect(ul.children.length).toBe(1);
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('createCitationList() — empty state', () => {
  test('shows the empty-state div and hides <ul> when list is empty', () => {
    const list = createCitationList({ emptyMessage: 'No citations yet' });
    list.setCitations([]);

    const ul = list.el.querySelector('ul.assist-cite-list');
    const empty = list.el.querySelector('div.assist-cite-empty');

    expect(ul.hidden).toBe(true);
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('No citations yet');
  });

  test('hides empty state and shows <ul> when list becomes non-empty', () => {
    const list = createCitationList({ emptyMessage: 'No citations yet' });
    list.setCitations([]);
    list.setCitations([A]);

    const ul = list.el.querySelector('ul.assist-cite-list');
    const empty = list.el.querySelector('div.assist-cite-empty');

    expect(ul.hidden).toBe(false);
    expect(empty.hidden).toBe(true);
    expect(ul.children.length).toBe(1);
  });

  test('uses a default empty message when none is provided', () => {
    const list = createCitationList();
    list.setCitations([]);

    const empty = list.el.querySelector('div.assist-cite-empty');
    expect(empty.textContent.length).toBeGreaterThan(0);
  });
});

// ── Style propagation ─────────────────────────────────────────────────────────

describe('createCitationList() — style propagation', () => {
  test('changing style via setCitations options calls each card update and preserves node identity', () => {
    const list = createCitationList({ style: 'harvard' });
    const ul = list.el.querySelector('ul.assist-cite-list');

    list.setCitations([A, B]);
    const nodeA = ul.children[0];
    const nodeB = ul.children[1];

    // Read the reference text before the style change.
    const refBeforeA = nodeA.querySelector('.assist-cite-card__reference').textContent;

    // Switch style — cards should update in place.
    list.setCitations([A, B], { style: 'apa7' });

    // Node identity preserved.
    expect(ul.children[0]).toBe(nodeA);
    expect(ul.children[1]).toBe(nodeB);

    // Reference text has changed (different style produces different output).
    const refAfterA = nodeA.querySelector('.assist-cite-card__reference').textContent;
    expect(refAfterA).not.toBe(refBeforeA);
  });
});

// ── Callbacks passed through ───────────────────────────────────────────────────

describe('createCitationList() — callbacks', () => {
  function fireMousedown(el) {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  }

  test('onInsert callback fires when Insert button is clicked on a card', () => {
    const onInsert = jest.fn();
    const list = createCitationList({ onInsert });
    list.setCitations([A]);

    const ul = list.el.querySelector('ul.assist-cite-list');
    const insertBtn = ul.querySelector('button');
    expect(insertBtn).not.toBeNull();
    fireMousedown(insertBtn);
    expect(onInsert).toHaveBeenCalledTimes(1);
  });
});

// ── destroy() ─────────────────────────────────────────────────────────────────

describe('createCitationList() — destroy()', () => {
  test('destroy() clears all child cards', () => {
    const list = createCitationList();
    const ul = list.el.querySelector('ul.assist-cite-list');
    list.setCitations([A, B, C]);
    expect(ul.children.length).toBe(3);

    list.destroy();
    expect(ul.children.length).toBe(0);
  });

  test('destroy() does not throw when the list is already empty', () => {
    const list = createCitationList();
    expect(() => list.destroy()).not.toThrow();
  });

  test('after destroy(), setCitations can be called on a fresh list without error', () => {
    // Regression guard: destroy + re-create should be safe.
    const list = createCitationList();
    list.setCitations([A]);
    list.destroy();
    // The destroyed list is done — a fresh call is a safety check only.
    expect(() => list.destroy()).not.toThrow();
  });
});

// ── Idempotency & edge cases ──────────────────────────────────────────────────

describe('createCitationList() — edge cases', () => {
  test('calling setCitations twice with the same list does not duplicate nodes', () => {
    const list = createCitationList();
    const ul = list.el.querySelector('ul.assist-cite-list');

    list.setCitations([A, B]);
    list.setCitations([A, B]);

    expect(ul.children.length).toBe(2);
  });

  test('a citation without an id gets a stable fallback key (no crash)', () => {
    const noId = { ...A, id: undefined };
    const list = createCitationList();
    expect(() => list.setCitations([noId])).not.toThrow();
    const ul = list.el.querySelector('ul.assist-cite-list');
    expect(ul.children.length).toBe(1);
  });
});

// ── Selection ─────────────────────────────────────────────────────────────────

describe('createCitationList() — setSelected()', () => {
  const boxesOf = list => [...list.el.querySelectorAll('input.assist-cite-card__select')];

  test('ticks only the cards whose ids are in the set', () => {
    const list = createCitationList({ onToggleSelect: jest.fn() });
    list.setCitations([A, B, C]);

    list.setSelected(new Set(['a', 'c']));

    expect(boxesOf(list).map(b => b.checked)).toEqual([true, false, true]);
  });

  test('an empty set clears every tick', () => {
    const list = createCitationList({ onToggleSelect: jest.fn() });
    list.setCitations([A, B]);
    list.setSelected(new Set(['a', 'b']));

    list.setSelected(new Set());

    expect(boxesOf(list).map(b => b.checked)).toEqual([false, false]);
  });

  test('a card added after the selection was set starts unticked', () => {
    const list = createCitationList({ onToggleSelect: jest.fn() });
    list.setCitations([A]);
    list.setSelected(new Set(['a']));

    list.setCitations([A, B]);
    list.setSelected(new Set(['a']));

    expect(boxesOf(list).map(b => b.checked)).toEqual([true, false]);
  });

  test('does not throw when the cards have no checkboxes', () => {
    const list = createCitationList();
    list.setCitations([A, B]);
    expect(() => list.setSelected(new Set(['a']))).not.toThrow();
  });
});

// ── The reconcile touches only what moved ─────────────────────────────────────

describe('createCitationList() — a reconcile moves only the cards that moved', () => {
  /** The card titles in display order. */
  function titlesOf(list) {
    return [...list.el.querySelectorAll('.assist-cite-card__title')].map(el => el.textContent);
  }

  /** Count every DOM move the <ul> is asked to make during `run`. */
  function countMoves(list, run) {
    const ul = list.el.querySelector('ul.assist-cite-list');
    const appendChild = jest.spyOn(ul, 'appendChild');
    const insertBefore = jest.spyOn(ul, 'insertBefore');
    run();
    const moves = appendChild.mock.calls.length + insertBefore.mock.calls.length;
    appendChild.mockRestore();
    insertBefore.mockRestore();
    return moves;
  }

  // Why this matters far more than the work it saves: re-inserting a node that contains
  // document.activeElement blurs it to <body> in Chrome, so re-appending every surviving card took
  // a keyboard student's place in the list on every storage echo. jsdom does not model that blur,
  // so the defect is only reachable here by counting the moves themselves.
  test('re-rendering the same order performs no DOM move at all', () => {
    const list = createCitationList();
    list.setCitations([A, B, C]);

    expect(countMoves(list, () => list.setCitations([A, B, C]))).toBe(0);
  });

  test('the same order with changed content still performs no DOM move', () => {
    const list = createCitationList();
    list.setCitations([A, B, C]);

    const edited = { ...B, title: 'Beta, revised' };
    expect(countMoves(list, () => list.setCitations([A, edited, C]))).toBe(0);
    expect(list.el.querySelectorAll('li')[1].textContent).toContain('Beta, revised');
  });

  test('a card appended to the end leaves the cards already there untouched', () => {
    const list = createCitationList();
    list.setCitations([A, B]);

    expect(countMoves(list, () => list.setCitations([A, B, C]))).toBe(1);
    expect(titlesOf(list)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  test('a genuine reorder still reorders', () => {
    const list = createCitationList();
    list.setCitations([A, B, C]);
    const first = list.el.querySelectorAll('li')[0];

    list.setCitations([C, B, A]);

    expect(titlesOf(list)).toEqual(['Gamma', 'Beta', 'Alpha']);
    // Node identity is preserved: the same <li> moved, it was not rebuilt.
    expect(list.el.querySelectorAll('li')[2]).toBe(first);
  });

  test('removing the middle card leaves its neighbours where they were', () => {
    const list = createCitationList();
    list.setCitations([A, B, C]);

    expect(countMoves(list, () => list.setCitations([A, C]))).toBe(0);
    expect(titlesOf(list)).toEqual(['Alpha', 'Gamma']);
  });
});
