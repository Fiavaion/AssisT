/**
 * Flashcard persistence — chrome.storage.local, keyed by card id.
 *
 * Thin storage layer over the pure card-model: this module owns the read/write/cap concerns,
 * card-model.js owns shape/validation. Defensive throughout — a missing or corrupt storage
 * value never throws, it degrades to an empty deck.
 *
 * @module features/flashcards/flashcards-store
 */

import { validateCard } from './card-model.js';

export const STORE_KEY = 'companionFlashcards';
export const MAX_CARDS = 500;

// Mutations run through one promise chain: a card save (from a selection) racing a review-grade
// update would otherwise read the same base deck and the later write would drop the earlier one.
let writeChain = Promise.resolve();
function serialize(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Load every stored card. Missing or malformed storage (not an array) degrades to [].
 * @returns {Promise<object[]>}
 */
export async function loadCards() {
  try {
    const result = await chrome.storage.local.get(STORE_KEY);
    const cards = result?.[STORE_KEY];
    return Array.isArray(cards) ? cards : [];
  } catch {
    return [];
  }
}

async function writeCards(cards) {
  await chrome.storage.local.set({ [STORE_KEY]: cards });
}

/**
 * Persist a new card. Validates first (front/back required) and enforces the 500-card cap —
 * neither condition writes to storage.
 * @param {object} card - a card built by createCard()
 * @returns {Promise<{saved:boolean, reason?:string}>}
 */
export function saveCard(card) {
  return serialize(async () => {
    const { valid, errors } = validateCard(card);
    if (!valid) {
      return { saved: false, reason: errors.join('; ') };
    }

    const cards = await loadCards();
    if (cards.length >= MAX_CARDS) {
      return { saved: false, reason: `card limit reached (${MAX_CARDS})` };
    }

    await writeCards([...cards, card]);
    return { saved: true };
  });
}

/**
 * Replace a stored card (matched by id) with an updated copy. A card with an unknown id is a
 * no-op (nothing removed, nothing added).
 * @param {object} card - a full card, including its existing id
 * @returns {Promise<{saved:boolean, reason?:string}>}
 */
export function updateCard(card) {
  return serialize(async () => {
    if (!card || typeof card.id !== 'string' || !card.id) {
      return { saved: false, reason: 'card must have an id' };
    }

    const cards = await loadCards();
    const index = cards.findIndex(c => c.id === card.id);
    if (index === -1) {
      return { saved: false, reason: 'card not found' };
    }

    const next = cards.slice();
    next[index] = card;
    await writeCards(next);
    return { saved: true };
  });
}
