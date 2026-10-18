/**
 * Flashcard storage tests — chrome.storage.local persistence layer.
 */

import { createCard, SOURCE_TYPES } from '../../../src/features/flashcards/card-model.js';
import {
  STORE_KEY,
  MAX_CARDS,
  loadCards,
  saveCard,
  updateCard,
} from '../../../src/features/flashcards/flashcards-store.js';

const NOW = 1700000000000;

function makeCard(id, overrides = {}) {
  return createCard(
    { front: `Front ${id}`, back: `Back ${id}`, sourceType: SOURCE_TYPES.MANUAL, ...overrides },
    NOW,
    () => id
  );
}

let store;

beforeEach(() => {
  store = {};
  chrome.storage.local.get.mockImplementation(async (key) => {
    const k = typeof key === 'string' ? key : key[0];
    return k in store ? { [k]: store[k] } : {};
  });
  chrome.storage.local.set.mockImplementation(async (obj) => {
    Object.assign(store, obj);
  });
});

describe('loadCards', () => {
  test('returns [] when nothing is stored', async () => {
    await expect(loadCards()).resolves.toEqual([]);
  });

  test('round-trips cards saved via saveCard', async () => {
    const card = makeCard('a');
    await saveCard(card);
    await expect(loadCards()).resolves.toEqual([card]);
  });

  test('corrupt storage (non-array value) degrades to []', async () => {
    store[STORE_KEY] = 'not-an-array';
    await expect(loadCards()).resolves.toEqual([]);
  });

  test('corrupt storage (object instead of array) degrades to []', async () => {
    store[STORE_KEY] = { oops: true };
    await expect(loadCards()).resolves.toEqual([]);
  });

  test('a throwing chrome.storage.local.get degrades to [] rather than rejecting', async () => {
    chrome.storage.local.get.mockImplementation(async () => {
      throw new Error('storage unavailable');
    });
    await expect(loadCards()).resolves.toEqual([]);
  });
});

describe('write serialization (reviewer fix)', () => {
  test('a concurrent save and grade-update both land', async () => {
    const cardA = makeCard('a');
    await saveCard(cardA);

    const graded = { ...cardA, srs: { ...cardA.srs, reps: 1 } };
    const cardB = makeCard('b');
    await Promise.all([updateCard(graded), saveCard(cardB)]);

    const cards = await loadCards();
    expect(cards).toHaveLength(2);
    expect(cards.find(c => c.id === 'a').srs.reps).toBe(1);
    expect(cards.find(c => c.id === 'b')).toBeDefined();
  });

  test('a burst of concurrent saves keeps every card', async () => {
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map(id => saveCard(makeCard(id))));
    const cards = await loadCards();
    expect(cards.map(c => c.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('saveCard', () => {
  test('saves a valid card and reports saved:true', async () => {
    const card = makeCard('a');
    await expect(saveCard(card)).resolves.toEqual({ saved: true });
    const all = await loadCards();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('a');
  });

  test('rejects an invalid card (missing front/back) without writing to storage', async () => {
    const badCard = { id: 'bad', front: '', back: '', sourceType: SOURCE_TYPES.MANUAL };
    const result = await saveCard(badCard);
    expect(result.saved).toBe(false);
    expect(typeof result.reason).toBe('string');
    await expect(loadCards()).resolves.toEqual([]);
  });

  test('rejects a 501st card once the store is at the 500-card cap', async () => {
    const cards = Array.from({ length: MAX_CARDS }, (_, i) => makeCard(`c${i}`));
    store[STORE_KEY] = cards;

    const result = await saveCard(makeCard('overflow'));
    expect(result).toEqual({ saved: false, reason: expect.stringMatching(/500|limit/i) });
    await expect(loadCards()).resolves.toHaveLength(MAX_CARDS);
  });

  test('allows saving exactly up to the cap (the 500th card succeeds)', async () => {
    const cards = Array.from({ length: MAX_CARDS - 1 }, (_, i) => makeCard(`c${i}`));
    store[STORE_KEY] = cards;

    const result = await saveCard(makeCard('last'));
    expect(result).toEqual({ saved: true });
    await expect(loadCards()).resolves.toHaveLength(MAX_CARDS);
  });
});

describe('updateCard', () => {
  test('replaces an existing card by id', async () => {
    const card = makeCard('a');
    await saveCard(card);

    const updated = { ...card, srs: { ...card.srs, reps: 3 } };
    await expect(updateCard(updated)).resolves.toEqual({ saved: true });

    const all = await loadCards();
    expect(all[0].srs.reps).toBe(3);
  });

  test('an unknown id is a no-op that reports saved:false', async () => {
    const result = await updateCard(makeCard('ghost'));
    expect(result.saved).toBe(false);
    await expect(loadCards()).resolves.toEqual([]);
  });
});
