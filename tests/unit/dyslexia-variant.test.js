/**
 * Dyslexia-mode variant resolution — syllable is the default, explicit choices always win.
 *
 * Bionic Reading was demoted from the default variant after empirical results (Snell 2024,
 * Acta Psychologica; Readwise 2022) showed no benefit and a small cost vs plain text. Users who
 * explicitly chose bionic keep it — only missing variant state falls back to syllable.
 */
import { dyslexia_resolveVariant } from '../../src/content/features/dyslexia.js';

describe('dyslexia_resolveVariant', () => {
  test('defaults to syllable highlighting when no variant is stored', () => {
    expect(dyslexia_resolveVariant({})).toEqual({
      bionicReading: false,
      syllableHighlighting: true,
      grammarColors: false,
    });
  });

  test('defaults to syllable for a legacy object with only the enabled flag', () => {
    expect(dyslexia_resolveVariant({ enabled: true })).toEqual({
      bionicReading: false,
      syllableHighlighting: true,
      grammarColors: false,
    });
  });

  test('keeps an explicitly chosen bionic reading', () => {
    const stored = { bionicReading: true, syllableHighlighting: false, grammarColors: false };
    expect(dyslexia_resolveVariant(stored)).toEqual({
      bionicReading: true,
      syllableHighlighting: false,
      grammarColors: false,
    });
  });

  test('keeps an explicitly chosen grammar colours', () => {
    const stored = { bionicReading: false, syllableHighlighting: false, grammarColors: true };
    expect(dyslexia_resolveVariant(stored)).toEqual({
      bionicReading: false,
      syllableHighlighting: false,
      grammarColors: true,
    });
  });

  test('an explicit syllable choice is not overridden when bionicReading is merely absent', () => {
    expect(dyslexia_resolveVariant({ syllableHighlighting: true })).toEqual({
      bionicReading: false,
      syllableHighlighting: true,
      grammarColors: false,
    });
  });

  test('handles a missing settings object', () => {
    expect(dyslexia_resolveVariant(undefined)).toEqual({
      bionicReading: false,
      syllableHighlighting: true,
      grammarColors: false,
    });
  });
});
