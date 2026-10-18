/**
 * Unit tests for flashcards-ui.js — the floating "cards ready" companion card.
 *
 * EVENT DISPATCH NOTE: companionButton() wires attachAccessibleHandler(), which triggers on
 * mousedown (not click) — see src/utils/event-handlers.js. Trigger button handlers by
 * dispatching a mousedown MouseEvent (bubbles + cancelable), matching the citation-card tests.
 */

jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  isCompanionEnabled: jest.fn(),
}));

jest.mock('../../../src/features/companion/companion-ui.js', () => {
  const actual = jest.requireActual('../../../src/features/companion/companion-ui.js');
  return {
    ...actual,
    isLmsHost: jest.fn(),
  };
});

import { isCompanionEnabled } from '../../../src/features/companion/companion-settings.js';
import { isLmsHost } from '../../../src/features/companion/companion-ui.js';
import { init, cleanup, createCardFromSelection } from '../../../src/features/flashcards/flashcards-ui.js';
import { STORE_KEY } from '../../../src/features/flashcards/flashcards-store.js';
import { createCard, SOURCE_TYPES } from '../../../src/features/flashcards/card-model.js';

const CARD_ID = 'assist-companion-flashcards';
const DAY_MS = 24 * 60 * 60 * 1000;

let store;

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function findButton(root, label) {
  return Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label);
}

function makeDueCard(id, now, overrides = {}) {
  const card = createCard(
    { front: `Front ${id}`, back: `Back ${id}`, sourceType: SOURCE_TYPES.MANUAL },
    now,
    () => id
  );
  return { ...card, srs: { ...card.srs, due: now - 1000, ...overrides.srs } };
}

beforeEach(() => {
  document.body.innerHTML = '';
  store = {};
  chrome.storage.local.get.mockImplementation(async (key) => {
    const k = typeof key === 'string' ? key : key[0];
    return k in store ? { [k]: store[k] } : {};
  });
  chrome.storage.local.set.mockImplementation(async (obj) => {
    Object.assign(store, obj);
  });

  isCompanionEnabled.mockResolvedValue(true);
  isLmsHost.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  document.getElementById(CARD_ID)?.remove();
});

describe('init — gating', () => {
  test('renders the floating card when enabled, on Canvas, with due cards', async () => {
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now), makeDueCard('b', now)];

    await init();

    const el = document.getElementById(CARD_ID);
    expect(el).not.toBeNull();
    expect(el.textContent).toContain('2');
  });

  test('renders nothing when the feature is disabled', async () => {
    isCompanionEnabled.mockResolvedValue(false);
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now)];

    await init();

    expect(document.getElementById(CARD_ID)).toBeNull();
  });

  test('renders nothing off a Canvas host', async () => {
    isLmsHost.mockReturnValue(false);
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now)];

    await init();

    expect(document.getElementById(CARD_ID)).toBeNull();
  });

  test('renders nothing when there are no due cards', async () => {
    const now = Date.now();
    const card = createCard(
      { front: 'F', back: 'B', sourceType: SOURCE_TYPES.MANUAL },
      now,
      () => 'future'
    );
    // Due far in the future — not due yet.
    store[STORE_KEY] = [{ ...card, srs: { ...card.srs, due: now + 10 * DAY_MS } }];

    await init();

    expect(document.getElementById(CARD_ID)).toBeNull();
  });

  test('is idempotent — a second init() call does not duplicate the card', async () => {
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now)];

    await init();
    await init();

    expect(document.querySelectorAll(`#${CARD_ID}`)).toHaveLength(1);
  });
});

describe('review flow', () => {
  test('Show answer reveals the back, then Good advances to the next due card', async () => {
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now), makeDueCard('b', now)];

    await init();
    const el = document.getElementById(CARD_ID);

    fireMousedown(findButton(el, '▶ Review'));
    expect(el.textContent).toContain('Front a');
    expect(el.textContent).not.toContain('Back a');

    fireMousedown(findButton(el, '👁 Show answer'));
    expect(el.textContent).toContain('Back a');

    fireMousedown(findButton(el, 'Good'));
    await flush();

    expect(el.textContent).toContain('Front b');
  });

  test('grading the last due card shows a completion message and Close', async () => {
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now)];

    await init();
    const el = document.getElementById(CARD_ID);

    fireMousedown(findButton(el, '▶ Review'));
    fireMousedown(findButton(el, '👁 Show answer'));
    fireMousedown(findButton(el, 'Good'));
    await flush();

    expect(findButton(el, 'Close')).toBeTruthy();
    expect(document.getElementById(CARD_ID)).not.toBeNull();
  });

  test('grading persists updated srs state back to storage', async () => {
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now)];

    await init();
    const el = document.getElementById(CARD_ID);

    fireMousedown(findButton(el, '▶ Review'));
    fireMousedown(findButton(el, '👁 Show answer'));
    fireMousedown(findButton(el, 'Easy'));
    await flush();

    expect(store[STORE_KEY][0].srs.reps).toBe(1);
    expect(store[STORE_KEY][0].srs.due).toBeGreaterThan(now);
  });
});

describe('createCardFromSelection', () => {
  test('saves a card when the selection has at least 8 words', async () => {
    window.getSelection = jest.fn(() => ({
      toString: () => 'The quick brown fox jumps over the lazy dog today',
    }));
    document.title = 'Test Page';

    const result = await createCardFromSelection();

    expect(result).toEqual({ created: true });
    expect(store[STORE_KEY]).toHaveLength(1);
    expect(store[STORE_KEY][0].sourceType).toBe('highlight');
  });

  test('refuses a selection under 8 words and saves nothing', async () => {
    window.getSelection = jest.fn(() => ({ toString: () => 'too short' }));

    const result = await createCardFromSelection();

    expect(result.created).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(store[STORE_KEY]).toBeUndefined();
  });

  test('handles no selection at all without throwing', async () => {
    window.getSelection = jest.fn(() => null);
    await expect(createCardFromSelection()).resolves.toEqual(
      expect.objectContaining({ created: false })
    );
  });

  test('the floating card footer button creates a card and confirms via the status region', async () => {
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now)];
    window.getSelection = jest.fn(() => ({
      toString: () => 'The quick brown fox jumps over the lazy dog today',
    }));

    await init();
    const el = document.getElementById(CARD_ID);

    fireMousedown(findButton(el, '➕ Card from selection'));
    await flush();

    const status = el.querySelector('[role="status"]');
    expect(status.textContent).toMatch(/card made/i);
    expect(store[STORE_KEY]).toHaveLength(2);
  });
});

describe('cleanup', () => {
  test('removes the floating card', async () => {
    const now = Date.now();
    store[STORE_KEY] = [makeDueCard('a', now)];

    await init();
    expect(document.getElementById(CARD_ID)).not.toBeNull();

    cleanup();
    expect(document.getElementById(CARD_ID)).toBeNull();
  });

  test('is safe to call when nothing is mounted', () => {
    expect(() => cleanup()).not.toThrow();
  });
});
