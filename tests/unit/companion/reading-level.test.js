/**
 * Reading-level dial — preference round-trip and prompt addendum gating.
 */
jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  isCompanionEnabled: jest.fn(),
}));

import { isCompanionEnabled } from '../../../src/features/companion/companion-settings.js';
import {
  READING_LEVELS,
  getReadingLevel,
  setReadingLevel,
  getReadingLevelAddendum,
} from '../../../src/features/companion/reading-level.js';

let store;

beforeEach(() => {
  store = {};
  isCompanionEnabled.mockResolvedValue(true);
  chrome.storage.local.get.mockImplementation(async key => {
    return key in store ? { [key]: store[key] } : {};
  });
  chrome.storage.local.set.mockImplementation(async obj => {
    Object.assign(store, obj);
  });
});

test('defaults to standard with an empty addendum', async () => {
  await expect(getReadingLevel()).resolves.toBe('standard');
  await expect(getReadingLevelAddendum('summary')).resolves.toBe('');
});

// Very plain means something different in each feature. A summary is short, so hard words are
// swapped for everyday ones: asking for each term to be explained in brackets pulled against a
// "1-2 sentences" summary, and llama3.2:3b kept the brackets and dropped the brevity in 5 of 5 runs.
// Simplified text is a full rewrite the student reads to learn from, so it keeps the proper term
// and explains it in brackets right after.
describe('very plain, per feature', () => {
  beforeEach(async () => {
    await setReadingLevel('very-plain');
  });

  test('a summary swaps hard words for everyday ones rather than adding explanations', async () => {
    const addendum = await getReadingLevelAddendum('summary');

    expect(addendum).toContain('everyday words');
    expect(addendum).toMatch(/everyday word in place of a technical term/);
    expect(addendum).not.toMatch(/bracket|explain/i);
  });

  test('simplified text keeps the proper term and explains it in brackets', async () => {
    const addendum = await getReadingLevelAddendum('simplify');

    expect(addendum).toContain('everyday words');
    expect(addendum).toMatch(/explain any technical term in brackets right after it/i);
    expect(addendum).not.toMatch(/in place of a technical term/);
  });
});

test('plain reads the same in both features', async () => {
  await setReadingLevel('plain');

  const summary = await getReadingLevelAddendum('summary');
  expect(summary).toContain('plain language');
  await expect(getReadingLevelAddendum('simplify')).resolves.toBe(summary);
});

test('round-trips a level', async () => {
  await setReadingLevel('very-plain');
  await expect(getReadingLevel()).resolves.toBe('very-plain');
});

test('an unknown feature is refused rather than given the wrong wording', async () => {
  await setReadingLevel('very-plain');
  await expect(getReadingLevelAddendum('translate')).rejects.toThrow(/feature/i);
});

test('empty addendum when the summaryDial toggle is off', async () => {
  await setReadingLevel('plain');
  isCompanionEnabled.mockResolvedValue(false);
  await expect(getReadingLevelAddendum('summary')).resolves.toBe('');
  await expect(getReadingLevelAddendum('simplify')).resolves.toBe('');
});

test('rejects unknown levels and falls back on corrupt storage', async () => {
  await expect(setReadingLevel('phd')).rejects.toThrow(/unknown/i);
  store.companionReadingLevel = 'garbage';
  await expect(getReadingLevel()).resolves.toBe('standard');
});

test('exposes the three levels for the popup select', () => {
  expect(READING_LEVELS.map(l => l.id)).toEqual(['standard', 'plain', 'very-plain']);
});
