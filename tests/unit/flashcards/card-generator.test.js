/**
 * Deterministic flashcard-generation tests.
 */

import { fromHighlight } from '../../../src/features/flashcards/card-generator.js';

describe('fromHighlight', () => {
  const LONG_TEXT =
    'The extraordinary discovery changed everything we knew about ancient history forever.';

  test('returns null for text shorter than 8 words', () => {
    expect(fromHighlight({ text: 'Too short a sentence here' })).toBeNull();
  });

  test('returns null for empty or non-string text', () => {
    expect(fromHighlight({ text: '' })).toBeNull();
    expect(fromHighlight({ text: '   ' })).toBeNull();
    expect(fromHighlight({ text: 42 })).toBeNull();
    expect(fromHighlight({})).toBeNull();
  });

  test('blanks the longest eligible content word', () => {
    const card = fromHighlight({ text: LONG_TEXT });
    expect(card.back).toBe('extraordinary');
    expect(card.front).toBe(
      'The ____ discovery changed everything we knew about ancient history forever.'
    );
  });

  test('is deterministic: same input always yields the same card', () => {
    const first = fromHighlight({ text: LONG_TEXT });
    const second = fromHighlight({ text: LONG_TEXT });
    expect(first).toEqual(second);
  });

  test('breaks length ties by picking the first occurrence', () => {
    const text = 'alpha bravo delta could would about tiger eagle now here';
    const card = fromHighlight({ text });
    expect(card.back).toBe('alpha');
  });

  test('skips stopwords and short words, returning null when no candidate remains', () => {
    const text = 'when about there which would could these those where while';
    expect(fromHighlight({ text })).toBeNull();
  });

  test('attaches a trimmed pageTitle when provided', () => {
    const card = fromHighlight({ text: LONG_TEXT, pageTitle: '  My Notes Page  ' });
    expect(card.pageTitle).toBe('My Notes Page');
  });

  test('omits pageTitle when not provided or blank', () => {
    const withoutTitle = fromHighlight({ text: LONG_TEXT });
    expect(withoutTitle).not.toHaveProperty('pageTitle');

    const blankTitle = fromHighlight({ text: LONG_TEXT, pageTitle: '   ' });
    expect(blankTitle).not.toHaveProperty('pageTitle');
  });
});
