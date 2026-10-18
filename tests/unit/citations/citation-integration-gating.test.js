/**
 * @jest-environment jsdom
 *
 * The citation manager is DEFAULT ON from 1.0: its in-page capture bar shows unless the student
 * has explicitly turned the feature off. This locks the gate that decides that.
 */

import { citationEnabledFrom } from '../../../src/features/citations/citation-integration.js';

describe('citationEnabledFrom() — citation manager is on by default', () => {
  test('on when settings are absent (fresh install)', () => {
    expect(citationEnabledFrom(undefined)).toBe(true);
    expect(citationEnabledFrom(null)).toBe(true);
    expect(citationEnabledFrom({})).toBe(true);
  });

  test('on when the citation key is absent from the profile', () => {
    expect(citationEnabledFrom({ tts: { enabled: true } })).toBe(true);
  });

  test('on when present without an explicit disable', () => {
    expect(citationEnabledFrom({ citation: {} })).toBe(true);
    expect(citationEnabledFrom({ citation: { enabled: true } })).toBe(true);
  });

  test('off only when explicitly disabled', () => {
    expect(citationEnabledFrom({ citation: { enabled: false } })).toBe(false);
  });
});
