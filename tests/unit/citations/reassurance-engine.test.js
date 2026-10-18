/**
 * Reassurance-engine tests — green/amber/red verdicts and worst-level selection. Pure and
 * deterministic (no chrome, no AI).
 */

import {
  assessCitation,
  LEVELS,
  FIELDS,
} from '../../../src/features/citations/reassurance-engine.js';

const base = {
  type: 'website',
  title: 'A Good Source',
  authors: ['Smith, J.'],
  publicationDate: '2021',
  url: 'https://example.com/x',
  accessDate: '2024-01-01',
};

describe('reassurance-engine', () => {
  it('green for a complete citation', () => {
    const r = assessCitation(base);
    expect(r.level).toBe(LEVELS.GREEN);
    expect(r.reasons[0].message).toMatch(/complete/i);
  });

  it('red when the title is missing', () => {
    const r = assessCitation({ ...base, title: '' });
    expect(r.level).toBe(LEVELS.RED);
    expect(r.reasons.some(x => /title/i.test(x.message))).toBe(true);
  });

  it('tags every reason with the field it concerns (for deep-linking a fix)', () => {
    // Green carries the positive "none" field.
    expect(assessCitation(base).reasons[0].field).toBe(FIELDS.NONE);
    // Each problem reason carries a machine-readable field, never undefined.
    const messy = assessCitation({ type: 'website', title: '', authors: ['Anon.'], publicationDate: '', url: '' });
    expect(messy.reasons.every(r => Object.values(FIELDS).includes(r.field))).toBe(true);
    expect(messy.reasons.find(r => r.field === FIELDS.TITLE)).toBeTruthy();
    // A wrong year is tagged to the year field so a "Fix the year" link can target it.
    const badYear = assessCitation({ ...base, publicationDate: '3000' });
    expect(badYear.reasons.find(r => r.field === FIELDS.YEAR)).toBeTruthy();
  });

  it('red for an implausible 4-digit year', () => {
    expect(assessCitation({ ...base, publicationDate: '3000' }).level).toBe(LEVELS.RED);
  });

  it('amber for a date with no readable year (silent-fallback trap)', () => {
    const r = assessCitation({ ...base, publicationDate: '21' });
    expect(r.level).toBe(LEVELS.AMBER);
    expect(r.reasons.some(x => /read a year/i.test(x.message))).toBe(true);
  });

  it('amber for an Anon author', () => {
    expect(assessCitation({ ...base, authors: ['Anon.'] }).level).toBe(LEVELS.AMBER);
  });

  it('amber for a malformed author entry', () => {
    const r = assessCitation({ ...base, authors: ['Contact info@x.com'] });
    expect(r.level).toBe(LEVELS.AMBER);
    expect(r.reasons.some(x => /author/i.test(x.message))).toBe(true);
  });

  it('amber when there is no link or DOI', () => {
    const r = assessCitation({
      type: 'website',
      title: 'T',
      authors: ['Smith, J.'],
      publicationDate: '2020',
      url: '',
      accessDate: '',
    });
    expect(r.level).toBe(LEVELS.AMBER);
  });

  it('reports the worst level when multiple issues exist', () => {
    const r = assessCitation({
      type: 'website',
      title: '',
      authors: ['Anon.'],
      publicationDate: '',
      url: '',
    });
    expect(r.level).toBe(LEVELS.RED);
    expect(r.reasons.length).toBeGreaterThan(1);
  });
});

// The verdict and the reference list have to agree about the year. The access date — the day the
// student happened to open the page — used to stand in for a missing publication year, so a source
// the formatters were about to print as "(no date)" / "n.d." was reported as "looks complete".
describe('the year the verdict reads is the publication year', () => {
  it('warns about a missing publication year even when an access date is on record', () => {
    const r = assessCitation({ ...base, publicationDate: '' });
    expect(r.level).toBe(LEVELS.AMBER);
    const year = r.reasons.find(reason => reason.field === FIELDS.YEAR);
    expect(year.message).toMatch(/no publication year/i);
  });

  it('does not judge the access date for plausibility', () => {
    // A mistyped access year is not a citation error: it is not printed as the source's year.
    const r = assessCitation({ ...base, accessDate: '0021-01-01' });
    expect(r.level).toBe(LEVELS.GREEN);
  });

  it('still flags an implausible publication year', () => {
    const r = assessCitation({ ...base, publicationDate: '1200' });
    expect(r.level).toBe(LEVELS.RED);
    expect(r.reasons.some(reason => /1200 looks wrong/.test(reason.message))).toBe(true);
  });

  it('is green when the publication year is there', () => {
    expect(assessCitation(base).level).toBe(LEVELS.GREEN);
  });
});
