/**
 * Flashcard model tests.
 */

import { createCard, validateCard, SOURCE_TYPES } from '../../../src/features/flashcards/card-model.js';

const NOW = 1700000000000;

describe('createCard', () => {
  test('normalizes a minimal input into a full card', () => {
    const card = createCard(
      { front: 'Q', back: 'A', sourceType: SOURCE_TYPES.MANUAL },
      NOW,
      () => 'id-1'
    );

    expect(card).toEqual({
      id: 'id-1',
      front: 'Q',
      back: 'A',
      sourceType: 'manual',
      sourceRef: null,
      tags: [],
      createdAt: NOW,
      srs: { interval: 0, ease: 2.5, due: NOW, reps: 0, lapses: 0 },
    });
  });

  test('preserves sourceRef and copies tags (not the same array reference)', () => {
    const tags = ['bio', 'exam'];
    const card = createCard(
      { front: 'Q', back: 'A', sourceType: SOURCE_TYPES.CITATION, sourceRef: 'cite-42', tags },
      NOW,
      () => 'id-2'
    );

    expect(card.sourceRef).toBe('cite-42');
    expect(card.tags).toEqual(['bio', 'exam']);
    expect(card.tags).not.toBe(tags);
  });

  test('defaults tags to an empty array when omitted', () => {
    const card = createCard({ front: 'Q', back: 'A', sourceType: SOURCE_TYPES.HIGHLIGHT }, NOW, () => 'id-3');
    expect(card.tags).toEqual([]);
  });

  test('sets createdAt and srs.due to the supplied now, with a fresh srs state', () => {
    const card = createCard({ front: 'Q', back: 'A', sourceType: SOURCE_TYPES.OCR }, NOW, () => 'id-4');
    expect(card.createdAt).toBe(NOW);
    expect(card.srs).toEqual({ interval: 0, ease: 2.5, due: NOW, reps: 0, lapses: 0 });
  });

  test('uses crypto.randomUUID when no id generator is injected', () => {
    const card = createCard({ front: 'Q', back: 'A', sourceType: SOURCE_TYPES.ANNOTATION }, NOW);
    expect(typeof card.id).toBe('string');
    expect(card.id.length).toBeGreaterThan(0);
  });

  test('two cards created without an injected id get distinct ids', () => {
    const a = createCard({ front: 'Q1', back: 'A1', sourceType: SOURCE_TYPES.MANUAL }, NOW);
    const b = createCard({ front: 'Q2', back: 'A2', sourceType: SOURCE_TYPES.MANUAL }, NOW);
    expect(a.id).not.toBe(b.id);
  });

  test('supports every documented sourceType', () => {
    Object.values(SOURCE_TYPES).forEach((sourceType, i) => {
      const card = createCard({ front: 'Q', back: 'A', sourceType }, NOW, () => `id-${i}`);
      expect(card.sourceType).toBe(sourceType);
    });
  });
});

describe('validateCard', () => {
  function makeCard(overrides = {}) {
    return { front: 'Question', back: 'Answer', ...overrides };
  }

  test('accepts a valid card', () => {
    expect(validateCard(makeCard())).toEqual({ valid: true, errors: [] });
  });

  test('rejects a missing front', () => {
    const { valid, errors } = validateCard(makeCard({ front: undefined }));
    expect(valid).toBe(false);
    expect(errors).toContain('front must be a non-empty string');
  });

  test('rejects an empty/whitespace-only back', () => {
    const { valid, errors } = validateCard(makeCard({ back: '   ' }));
    expect(valid).toBe(false);
    expect(errors).toContain('back must be a non-empty string');
  });

  test('rejects a non-string front', () => {
    const { valid, errors } = validateCard(makeCard({ front: 42 }));
    expect(valid).toBe(false);
    expect(errors).toContain('front must be a non-empty string');
  });

  test('rejects a front over 2000 characters', () => {
    const { valid, errors } = validateCard(makeCard({ front: 'x'.repeat(2001) }));
    expect(valid).toBe(false);
    expect(errors).toContain('front must be 2000 characters or fewer');
  });

  test('accepts a field at exactly 2000 characters', () => {
    const { valid } = validateCard(makeCard({ front: 'x'.repeat(2000) }));
    expect(valid).toBe(true);
  });

  test('collects errors for both fields when both are invalid', () => {
    const { valid, errors } = validateCard({ front: '', back: '' });
    expect(valid).toBe(false);
    expect(errors).toHaveLength(2);
  });

  test('rejects a non-object card without throwing', () => {
    expect(validateCard(null)).toEqual({ valid: false, errors: ['Card must be an object'] });
    expect(validateCard(undefined)).toEqual({ valid: false, errors: ['Card must be an object'] });
  });
});
