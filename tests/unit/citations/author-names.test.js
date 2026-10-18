/**
 * Author name canonicalisation. Every expectation here is a name a student would otherwise have to
 * retype, taken from the pages the autofill was measured against (Nature, PMC, GOV.UK, Wikipedia).
 */

import {
  canonicalName,
  isOrganisation,
  splitAuthorList,
} from '../../../src/features/citations/author-names.js';

describe('canonicalName', () => {
  test('passes an already-canonical "Family, Given" through untouched', () => {
    expect(canonicalName('Smith, J.')).toBe('Smith, J.');
    expect(canonicalName('Harris, Charles R.')).toBe('Harris, Charles R.');
  });

  test('normalises the spacing of a canonical name without reordering it', () => {
    expect(canonicalName('  Guyer ,   Paul  ')).toBe('Guyer, Paul');
  });

  test('reorders "Given Family" into "Family, Given"', () => {
    expect(canonicalName('Charles R Harris')).toBe('Harris, Charles R');
    expect(canonicalName('Jonathan Jones')).toBe('Jones, Jonathan');
  });

  test('keeps a nobiliary particle with the family name', () => {
    expect(canonicalName('Stéfan J van der Walt')).toBe('van der Walt, Stéfan J');
    expect(canonicalName('Ludwig van Beethoven')).toBe('van Beethoven, Ludwig');
    expect(canonicalName('Jaime Fernández del Río')).toBe('del Río, Jaime Fernández');
    expect(canonicalName('Marten H van Kerkwijk')).toBe('van Kerkwijk, Marten H');
    expect(canonicalName('José Ortega y Gasset')).toBe('Ortega y Gasset, José');
  });

  test('does not mistake a middle initial for the Spanish "y" particle', () => {
    expect(canonicalName('Kim Y Lee')).toBe('Lee, Kim Y');
  });

  test('leaves a single-token name alone', () => {
    expect(canonicalName('Aristotle')).toBe('Aristotle');
  });

  test('leaves an organisation in its reading order', () => {
    expect(canonicalName('World Health Organization')).toBe('World Health Organization');
    expect(canonicalName('Wikimedia contributors')).toBe('Wikimedia contributors');
  });

  test('returns an empty string for nothing usable', () => {
    expect(canonicalName('')).toBe('');
    expect(canonicalName('   ')).toBe('');
    expect(canonicalName(null)).toBe('');
  });
});

describe('isOrganisation', () => {
  test.each([
    'Women and Equalities Unit',
    'World Health Organization',
    'Department for Work and Pensions',
    'Wikimedia contributors',
    'Contributors to Wikimedia projects',
    'Oxford University Press',
    'The National Gallery',
  ])('recognises %s as an organisation', name => {
    expect(isOrganisation(name)).toBe(true);
  });

  test.each(['Jane Doe', 'van der Walt, Stéfan J', 'Guyer, Paul', 'Aristotle', ''])(
    'does not mistake %s for an organisation',
    name => {
      expect(isOrganisation(name)).toBe(false);
    }
  );

  test('matches whole words only, so a person is not an organisation by coincidence', () => {
    expect(isOrganisation('Grouper Smith')).toBe(false);
  });
});

describe('splitAuthorList', () => {
  test('splits on "and", ";" and "&", canonicalising each name', () => {
    expect(splitAuthorList('Smith, J. and Doe, M.')).toEqual(['Smith, J.', 'Doe, M.']);
    expect(splitAuthorList('Vaswani, Ashish; Shazeer, Noam')).toEqual([
      'Vaswani, Ashish',
      'Shazeer, Noam',
    ]);
    expect(splitAuthorList('Jane Doe & John Roe')).toEqual(['Doe, Jane', 'Roe, John']);
  });

  test('keeps an organisation whose own name contains "and" as one author', () => {
    expect(splitAuthorList('Women and Equalities Unit')).toEqual(['Women and Equalities Unit']);
    expect(splitAuthorList('Department for Work and Pensions')).toEqual([
      'Department for Work and Pensions',
    ]);
  });

  test('still separates a person from an organisation joined by "and"', () => {
    expect(splitAuthorList('Jane Doe and World Health Organization')).toEqual([
      'Doe, Jane',
      'World Health Organization',
    ]);
  });

  test('treats a two-word organisation as one author', () => {
    expect(splitAuthorList('Wikimedia contributors')).toEqual(['Wikimedia contributors']);
  });

  test('returns an empty list for nothing usable', () => {
    expect(splitAuthorList('')).toEqual([]);
    expect(splitAuthorList(null)).toEqual([]);
    expect(splitAuthorList(' ; ')).toEqual([]);
  });
});

describe('canonicalName — generational suffixes', () => {
  test('moves a suffix behind the given name', () => {
    expect(canonicalName('Martin Luther King Jr.')).toBe('King, Martin Luther, Jr.');
    expect(canonicalName('Sammy Davis Jr')).toBe('Davis, Sammy, Jr');
    expect(canonicalName('Henry Ford II')).toBe('Ford, Henry, II');
  });

  test('leaves an already-canonical suffixed name alone, with single spaces', () => {
    expect(canonicalName('King, Martin Luther, Jr.')).toBe('King, Martin Luther, Jr.');
    expect(canonicalName('King,  Martin Luther,   Jr.')).toBe('King, Martin Luther, Jr.');
  });

  test('does not treat an ordinary last word as a suffix', () => {
    expect(canonicalName('Jane Doe')).toBe('Doe, Jane');
  });
});

describe('splitAuthorList — organisations whose names contain "and"', () => {
  test.each([
    ['Department of Health and Social Care', ['Department of Health and Social Care']],
    ['Arts Council England', ['Arts Council England']],
    ['The National Gallery', ['The National Gallery']],
    ['Women and Equalities Unit', ['Women and Equalities Unit']],
  ])('keeps %s whole', (input, expected) => {
    expect(splitAuthorList(input)).toEqual(expected);
  });

  test('still splits genuine author lists', () => {
    expect(splitAuthorList('Smith, J. & Jones, K.')).toEqual(['Smith, J.', 'Jones, K.']);
    expect(splitAuthorList('Smith; Jones')).toEqual(['Smith', 'Jones']);
    expect(splitAuthorList('Jane Doe and World Health Organization')).toEqual([
      'Doe, Jane',
      'World Health Organization',
    ]);
  });
});
