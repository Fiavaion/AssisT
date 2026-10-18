/**
 * Flashcard data model.
 *
 * Pure — no chrome.*, no Date.now(). Callers pass `now` (ms epoch) so behaviour stays
 * deterministic and testable. `createCard` also accepts an injectable id generator so tests
 * don't depend on crypto.randomUUID being wired a particular way.
 */

const MAX_FIELD_LENGTH = 2000;

/** @enum {string} */
export const SOURCE_TYPES = Object.freeze({
  HIGHLIGHT: 'highlight',
  ANNOTATION: 'annotation',
  CITATION: 'citation',
  OCR: 'ocr',
  MANUAL: 'manual',
  MINDMAP: 'mindmap',
});

function defaultGenerateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC-4122-ish v4 id for environments without crypto.randomUUID (some jsdom setups).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, placeholder => {
    const random = (Math.random() * 16) | 0;
    const value = placeholder === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Build a normalized flashcard with a fresh SM-2-lite scheduling state.
 * @param {{front:string, back:string, sourceType:string, sourceRef?:*, tags?:string[]}} input
 * @param {number} now - ms epoch; used for createdAt and the initial due date.
 * @param {() => string} [generateId] - injectable id generator (defaults to crypto.randomUUID).
 * @returns {object} normalized card
 */
export function createCard(input, now, generateId = defaultGenerateId) {
  const { front, back, sourceType, sourceRef = null, tags = [] } = input || {};

  return {
    id: generateId(),
    front,
    back,
    sourceType,
    sourceRef,
    tags: Array.isArray(tags) ? [...tags] : [],
    createdAt: now,
    srs: {
      interval: 0,
      ease: 2.5,
      due: now,
      reps: 0,
      lapses: 0,
    },
  };
}

function validateTextField(name, value, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${name} must be a non-empty string`);
    return;
  }
  if (value.trim().length > MAX_FIELD_LENGTH) {
    errors.push(`${name} must be ${MAX_FIELD_LENGTH} characters or fewer`);
  }
}

/**
 * Validate a card's required text fields.
 * @param {object} card
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateCard(card) {
  const errors = [];

  if (!card || typeof card !== 'object') {
    return { valid: false, errors: ['Card must be an object'] };
  }

  validateTextField('front', card.front, errors);
  validateTextField('back', card.back, errors);

  return { valid: errors.length === 0, errors };
}
