/**
 * @jest-environment jsdom
 *
 * A library card formats itself within its whole collection, on every render. Done naively that is
 * quadratic: each of n cards normalised all n members of its set, which took about half a minute
 * for 500 cards. The work is counted here rather than timed (see tests/performance), so the check
 * means the same on a busy machine: formatting n cards normalises each record a bounded number of
 * times, however large the collection.
 */

jest.mock('../../../src/features/citations/citation-types.js', () => {
  const actual = jest.requireActual('../../../src/features/citations/citation-types.js');
  // A plain function, not jest.fn: resetMocks would wipe a factory implementation.
  return {
    ...actual,
    normalizeCitation: c => {
      mockWork.normalised += 1;
      return actual.normalizeCitation(c);
    },
  };
});

const mockWork = { normalised: 0 };

import {
  formatReference,
  formatInText,
  referenceSetFor,
} from '../../../src/features/citations/citation-styles/index.js';

const library = n =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i),
    type: 'journal',
    title: `Source number ${i}`,
    // Ten authors, each with many works across few years: plenty of letters to assign.
    authors: [`Author${i % 10}, A.`],
    publicationDate: String(2000 + (i % 5)),
    siteName: 'Journal',
    projectId: i % 2 ? 'essay' : null,
  }));

/** Normalisations spent rendering every card of a library once. */
function workToRender(pool) {
  mockWork.normalised = 0;
  for (const citation of pool) {
    const set = referenceSetFor(citation, pool);
    formatReference(citation, 'apa7', { html: true, set });
    formatInText(citation, 'apa7', { set });
  }
  return mockWork.normalised;
}

test('each card costs a bounded number of normalisations, whatever the collection size', () => {
  const small = library(40);
  const large = library(400);
  const perCardSmall = workToRender(small) / small.length;
  const perCardLarge = workToRender(large) / large.length;
  // Two per card (the reference and the in-text citation) plus one per record, once.
  expect(perCardLarge).toBeLessThanOrEqual(4);
  expect(perCardLarge).toBeLessThanOrEqual(perCardSmall + 0.5);
});

test('the letters are still right when the work is shared', () => {
  const pool = library(40);
  const set = referenceSetFor(pool[1], pool);
  // Author1 in "essay": ids 1, 11, 21, 31 — years 2001, 2001, 2001, 2001 → a, b, c, d by title.
  expect(formatInText(pool[1], 'apa7', { set })).toBe('(Author1, 2001a)');
  expect(formatInText(pool[31], 'apa7', { set })).toBe('(Author1, 2001d)');
});
