/**
 * Reference-check tests — deterministic in-text ↔ reference-list mismatch checker.
 * Pure and offline (no chrome, no DOM, no AI). Precision-critical: the product stance is
 * reassurance, so these tests pin down BOTH what must be recognised and what must NOT be
 * flagged (decoys: prose years, URLs, bare parentheticals, lifespans).
 */

import {
  extractInTextCitations,
  checkReferences,
  describeCheckResult,
} from '../../../src/features/citations/reference-check.js';
import { formatInText } from '../../../src/features/citations/citation-styles/index.js';

/** Minimal library record helper (checkReferences normalises internally). */
const rec = (authors, year, title = 'A Title', extraFields = {}) => ({
  type: 'journal',
  title,
  authors,
  publicationDate: year,
  url: '',
  ...extraFields,
});

/**
 * Realistic mixed fixture: narrative + parenthetical + multi-cite + locators + Chicago +
 * secondary citation + decoys (a "(for example)", a URL in parens, a year in prose).
 */
const MIXED_ESSAY = `Dyslexia support tools have moved online in the last decade (Smith, 2023). Smith et al. (2021) found that synchronized highlighting improved comprehension, and later work confirmed the effect (Doe & Lee, 2022, p. 114). Some researchers disagree (see Brown, 2020; Chen, 2019a). In 2023 the field shifted towards multimodal correction (for example), as several reviews note (https://example.com/report-2023).

Narrative styles vary. Ó Súilleabháin (2019) prefers immersive reading, while van der Berg and O'Neill (2021) argue for structured pauses. Older frameworks (Nguyen 2018, 24) still shape practice, and secondary evidence persists (Vygotsky, 1978, cited in Daniels, 2016).`;

const MIXED_LIB = [
  rec(['Smith, Jane'], '2023', 'Online tools'),
  rec(['Smith, Jane', 'Wu, K.'], '2021', 'Highlighting study'),
  rec(['Doe, John', 'Lee, Ann'], '2022', 'Confirmation study'),
  rec(['Brown, Pat'], '2020', 'A dissent'),
  rec(['Chen, Li'], '2019', 'Another dissent'),
  rec(['Ó Súilleabháin, Micheál'], '2019', 'Immersive reading'),
  rec(['van der Berg, Anna'], '2021', 'Structured pauses'),
  rec(['Nguyen, Minh'], '2018', 'Frameworks'),
  rec(['Daniels, Harry'], '2016', 'On Vygotsky'),
  rec(['Unused, Author'], '2015', 'Never cited'),
];

describe('extractInTextCitations — parenthetical forms', () => {
  it('recognises a simple parenthetical citation with raw/families/year/index', () => {
    const essay = 'Reading improved (Smith, 2023).';
    const out = extractInTextCitations(essay);
    expect(out).toHaveLength(1);
    expect(out[0].raw).toBe('Smith, 2023');
    expect(out[0].families).toEqual(['Smith']);
    expect(out[0].year).toBe('2023');
    expect(out[0].index).toBe(essay.indexOf('Smith'));
  });

  it('recognises two authors joined with &', () => {
    const out = extractInTextCitations('Later work agreed (Smith & Doe, 2023).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith', 'Doe']);
  });

  it('recognises two authors joined with "and"', () => {
    const out = extractInTextCitations('Later work agreed (Smith and Doe, 2023).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith', 'Doe']);
  });

  it('recognises et al. and keeps only the first family', () => {
    const out = extractInTextCitations('The effect held (Smith et al., 2023).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith']);
    expect(out[0].year).toBe('2023');
  });

  it('ignores a page locator', () => {
    const out = extractInTextCitations('As shown (Smith, 2023, p. 24).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith']);
    expect(out[0].year).toBe('2023');
  });

  it('strips a "see" prefix', () => {
    const out = extractInTextCitations('Others disagree (see Smith, 2023).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith']);
  });

  it('strips an "e.g.," prefix', () => {
    const out = extractInTextCitations('Reviews exist (e.g., Smith, 2023).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith']);
  });

  it('keeps a letter year suffix as written', () => {
    const out = extractInTextCitations('Twice in one year (Chen, 2019a).');
    expect(out).toHaveLength(1);
    expect(out[0].year).toBe('2019a');
  });

  it('recognises n.d.', () => {
    const out = extractInTextCitations('Guidance exists (NHS, n.d.).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['NHS']);
    expect(out[0].year).toBe('n.d.');
  });

  it('splits a multi-cite on semicolons into separate entries in order', () => {
    const essay = 'Several agree (Smith, 2023; Doe, 2021).';
    const out = extractInTextCitations(essay);
    expect(out).toHaveLength(2);
    expect(out[0].families).toEqual(['Smith']);
    expect(out[0].year).toBe('2023');
    expect(out[1].families).toEqual(['Doe']);
    expect(out[1].year).toBe('2021');
    expect(out[1].index).toBe(essay.indexOf('Doe'));
  });

  it('recognises the Chicago author-date form (Smith 2023, 24)', () => {
    const out = extractInTextCitations('An older view (Smith 2023, 24).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith']);
    expect(out[0].year).toBe('2023');
  });

  it('reports both parts of a secondary citation, flagging the inner one', () => {
    const out = extractInTextCitations('Foundational work (Vygotsky, 1978, cited in Daniels, 2016).');
    expect(out).toHaveLength(2);
    const inner = out.find(e => e.families[0] === 'Vygotsky');
    const outer = out.find(e => e.families[0] === 'Daniels');
    expect(inner).toBeTruthy();
    expect(inner.year).toBe('1978');
    expect(inner.secondary).toBe(true);
    expect(outer).toBeTruthy();
    expect(outer.year).toBe('2016');
    expect(outer.secondary).toBe(false);
  });

  it('handles the "as cited in" variant', () => {
    const out = extractInTextCitations('Foundational work (Vygotsky, 1978, as cited in Daniels, 2016).');
    expect(out).toHaveLength(2);
    expect(out.find(e => e.families[0] === 'Vygotsky').secondary).toBe(true);
  });
});

describe('extractInTextCitations — decoys that must NOT be flagged', () => {
  it('ignores a parenthetical with no year', () => {
    expect(extractInTextCitations('Tools help many students (for example).')).toEqual([]);
  });

  it('ignores a short non-citation parenthetical like (UK)', () => {
    expect(extractInTextCitations('Universities (UK) vary widely.')).toEqual([]);
  });

  it('ignores a URL in parentheses even when it contains a year-like number', () => {
    expect(extractInTextCitations('See the report (https://example.com/report-2023) for detail.')).toEqual([]);
  });

  it('does not extract a year in prose', () => {
    expect(extractInTextCitations('In 2023 the study changed everything.')).toEqual([]);
  });

  it('ignores a bare year parenthetical', () => {
    expect(extractInTextCitations('The framework was first published (2023) online.')).toEqual([]);
  });

  it('ignores lifespans and date ranges after a name', () => {
    expect(extractInTextCitations('Beethoven (1770–1827) wrote nine symphonies.')).toEqual([]);
    expect(extractInTextCitations('The conflict (1939-1945) reshaped Europe.')).toEqual([]);
  });

  it('ignores a lowercase phrase before a year', () => {
    expect(extractInTextCitations('This has been true (since 2020) in most cohorts.')).toEqual([]);
  });

  it('returns [] for an empty essay and for text with no citations', () => {
    expect(extractInTextCitations('')).toEqual([]);
    expect(extractInTextCitations('A plain paragraph about reading, with no sources at all.')).toEqual([]);
  });
});

describe('extractInTextCitations — narrative forms', () => {
  it('recognises a simple narrative citation', () => {
    const essay = 'Smith (2023) argued the opposite.';
    const out = extractInTextCitations(essay);
    expect(out).toHaveLength(1);
    expect(out[0].raw).toBe('Smith (2023)');
    expect(out[0].families).toEqual(['Smith']);
    expect(out[0].year).toBe('2023');
    expect(out[0].index).toBe(0);
  });

  it('recognises narrative et al.', () => {
    const out = extractInTextCitations('Smith et al. (2023) found a large effect.');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith']);
  });

  it('recognises narrative "and" pairs', () => {
    const out = extractInTextCitations('Smith and Doe (2023) replicated the result.');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith', 'Doe']);
  });

  it('handles a possessive before the year', () => {
    const out = extractInTextCitations("Smith's (2023) framework is widely used.");
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith']);
  });
});

describe('extractInTextCitations — MLA bare form (known-family gated)', () => {
  it('recognises (Family page) only when the family is known', () => {
    const out = extractInTextCitations('Imagery drives the poem (Heaney 24).', new Set(['heaney']));
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Heaney']);
    expect(out[0].year).toBeNull();
  });

  it('ignores the bare form entirely without knownFamilies', () => {
    expect(extractInTextCitations('Imagery drives the poem (Heaney 24).')).toEqual([]);
  });

  it('ignores the bare form when the family is not in the library', () => {
    const out = extractInTextCitations('A ratio appears often (Smith 24).', new Set(['heaney']));
    expect(out).toEqual([]);
  });
});

describe('extractInTextCitations — unicode names, particles, hyphens', () => {
  it('keeps an Irish family with a fada intact', () => {
    const out = extractInTextCitations('Music matters (Ó Súilleabháin, 2019).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Ó Súilleabháin']);
  });

  it('keeps Dutch particles in a narrative citation', () => {
    const out = extractInTextCitations('van der Berg (2020) argues for pauses.');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['van der Berg']);
  });

  it('survives an apostrophe', () => {
    const out = extractInTextCitations("Pauses help too (O'Neill, 2021).");
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(["O'Neill"]);
  });

  it('survives a hyphenated family', () => {
    const out = extractInTextCitations('Colour helps (Smith-Jones, 2022).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Smith-Jones']);
  });

  it('keeps Spanish particles intact', () => {
    const out = extractInTextCitations('Rhythm matters (de la Cruz, 2018).');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['de la Cruz']);
  });

  it('extracts everything from the mixed fixture, in document order', () => {
    const out = extractInTextCitations(MIXED_ESSAY);
    expect(out.map(e => e.families[0])).toEqual([
      'Smith', 'Smith', 'Doe', 'Brown', 'Chen',
      'Ó Súilleabháin', 'van der Berg', 'Nguyen', 'Vygotsky', 'Daniels',
    ]);
    expect(out.map(e => e.year)).toEqual([
      '2023', '2021', '2022', '2020', '2019a', '2019', '2021', '2018', '1978', '2016',
    ]);
    expect(out.filter(e => e.secondary).map(e => e.families[0])).toEqual(['Vygotsky']);
    expect(out.find(e => e.families[0] === 'Doe').families).toEqual(['Doe', 'Lee']);
    expect(out.find(e => e.families[0] === 'van der Berg').families).toEqual(['van der Berg', "O'Neill"]);
  });
});

describe('checkReferences — matching', () => {
  it('matches the full mixed fixture against its library', () => {
    const result = checkReferences(MIXED_ESSAY, MIXED_LIB);
    expect(result.counts.inText).toBe(10);
    // 9 of 10 match; the inner secondary (Vygotsky) is correctly absent from the list.
    expect(result.counts.matched).toBe(9);
    expect(result.citedNotListed).toEqual([]);
    expect(result.listedNotCited).toHaveLength(1);
    expect(result.listedNotCited[0].title).toBe('Never cited');
    expect(result.counts.problems).toBe(1);
  });

  it('matches family names case-insensitively', () => {
    const result = checkReferences('It was shown (SMITH, 2023).', [rec(['Smith, Jane'], '2023')]);
    expect(result.counts.matched).toBe(1);
    expect(result.citedNotListed).toEqual([]);
  });

  it('treats 2019a as 2019 when matching', () => {
    const result = checkReferences('Twice that year (Chen, 2019a).', [rec(['Chen, Li'], '2019')]);
    expect(result.counts.matched).toBe(1);
  });

  it('matches n.d. against a record with no year', () => {
    const lib = [{ type: 'website', title: 'Guidance', authors: ['NHS'], publicationDate: '', accessDate: '', url: '' }];
    const result = checkReferences('Official guidance exists (NHS, n.d.).', lib);
    expect(result.counts.matched).toBe(1);
    expect(result.citedNotListed).toEqual([]);
  });

  it('does not match n.d. against a record that has a year', () => {
    const result = checkReferences('Guidance exists (NHS, n.d.).', [rec(['NHS'], '2020')]);
    expect(result.counts.matched).toBe(0);
    expect(result.citedNotListed).toHaveLength(1);
  });

  it('matches et al. on the first author family only', () => {
    const lib = [rec(['García, M.', 'Lee, A.', 'Chen, B.'], '2020')];
    const result = checkReferences('García et al. (2020) showed this.', lib);
    expect(result.counts.matched).toBe(1);
  });

  it('never matches a record with no parseable author, and never flags it either', () => {
    const noAuthor = rec([], '2020', 'Anonymous report');
    const result = checkReferences('One study agrees (Smith, 2023).', [rec(['Smith, Jane'], '2023'), noAuthor]);
    expect(result.counts.matched).toBe(1);
    // Cannot verify an author-less record, so it is not flagged (no false alarms).
    expect(result.listedNotCited).toEqual([]);
  });

  it('tolerates particle differences between storage forms (both directions)', () => {
    // Record stored comma-form: family = "van der Berg"; in-text uses the bare surname.
    const commaForm = checkReferences('Pauses help (Berg, 2021).', [rec(['van der Berg, Anna'], '2021')]);
    expect(commaForm.counts.matched).toBe(1);
    // Record stored "Given Family" form: parseAuthor yields family "Berg"; in-text uses particles.
    const bareForm = checkReferences('Pauses help (van der Berg, 2021).', [rec(['Anna van der Berg'], '2021')]);
    expect(bareForm.counts.matched).toBe(1);
  });

  it('matches an MLA bare cite end-to-end via the library families', () => {
    const result = checkReferences('The image recurs (Heaney 24).', [rec(['Heaney, Seamus'], '1966')]);
    expect(result.counts.inText).toBe(1);
    expect(result.counts.matched).toBe(1);
  });

  it('does not flag an unmatched inner secondary citation', () => {
    const result = checkReferences(
      'Early theory persists (Vygotsky, 1978, cited in Daniels, 2016).',
      [rec(['Daniels, Harry'], '2016')]
    );
    expect(result.counts.matched).toBe(1);
    expect(result.citedNotListed).toEqual([]);
  });
});

describe('checkReferences — problems and suggestions', () => {
  it('reports a cited-not-listed source with a year-mismatch suggestion as data', () => {
    const result = checkReferences('It was found (Doe, 2021).', [rec(['Doe, John'], '2022', 'Doe study')]);
    expect(result.counts.matched).toBe(0);
    expect(result.citedNotListed).toHaveLength(1);
    const missing = result.citedNotListed[0];
    expect(missing.families).toEqual(['Doe']);
    expect(missing.year).toBe('2021');
    expect(missing.suggestion).toEqual(
      expect.objectContaining({ type: 'year-mismatch', family: 'Doe', year: '2022' })
    );
    // The suggested record is accounted for — it must not ALSO appear as never-cited.
    expect(result.listedNotCited).toEqual([]);
    expect(result.counts.problems).toBe(1);
  });

  it('suggests a close spelling (transposition, Damerau-Levenshtein distance 1)', () => {
    const result = checkReferences('It was found (Smtih, 2023).', [rec(['Smith, Jane'], '2023')]);
    expect(result.citedNotListed).toHaveLength(1);
    expect(result.citedNotListed[0].suggestion).toEqual(
      expect.objectContaining({ type: 'spelling', family: 'Smith' })
    );
    expect(result.listedNotCited).toEqual([]);
  });

  it('suggests a close spelling (single substitution)', () => {
    const result = checkReferences('It was found (Smyth, 2023).', [rec(['Smith, Jane'], '2023')]);
    expect(result.citedNotListed[0].suggestion).toEqual(
      expect.objectContaining({ type: 'spelling', family: 'Smith' })
    );
  });

  it('offers no suggestion when nothing in the library is close', () => {
    const result = checkReferences('It was found (Zhao, 2019).', [rec(['Smith, Jane'], '2023')]);
    expect(result.citedNotListed).toHaveLength(1);
    expect(result.citedNotListed[0].suggestion).toBeNull();
    expect(result.listedNotCited).toHaveLength(1);
    expect(result.counts.problems).toBe(2);
  });

  it('dedupes repeated mentions of the same missing source', () => {
    const result = checkReferences('First (Smith, 2023). Then again (Smith, 2023).', []);
    expect(result.counts.inText).toBe(2);
    expect(result.citedNotListed).toHaveLength(1);
  });

  it('handles an empty library: everything cited is missing', () => {
    const result = checkReferences('Two sources (Smith, 2023; Doe, 2021).', []);
    expect(result.counts.inText).toBe(2);
    expect(result.citedNotListed).toHaveLength(2);
    expect(result.listedNotCited).toEqual([]);
  });

  it('handles an empty essay without crashing', () => {
    const result = checkReferences('', MIXED_LIB);
    expect(result.counts.inText).toBe(0);
    expect(result.counts.matched).toBe(0);
    expect(result.citedAndListed).toEqual([]);
    expect(result.citedNotListed).toEqual([]);
  });

  it('pairs matched citations with their library record', () => {
    const lib = [rec(['Smith, Jane'], '2023', 'The one')];
    const result = checkReferences('Shown before (Smith, 2023).', lib);
    expect(result.citedAndListed).toHaveLength(1);
    expect(result.citedAndListed[0].citation.title).toBe('The one');
    expect(result.citedAndListed[0].inText.families).toEqual(['Smith']);
  });
});

describe('describeCheckResult — anxiety-aware plain language', () => {
  it('celebrates when every cited source is listed', () => {
    const result = checkReferences('Shown before (Smith, 2023).', [rec(['Smith, Jane'], '2023')]);
    const msgs = describeCheckResult(result);
    expect(msgs).toEqual(['Every source you cite is in your reference list — nice work.']);
  });

  it('lists missing sources concretely, with plural phrasing', () => {
    const result = checkReferences('Two claims (Smith, 2023) and (Doe, 2021).', []);
    const msgs = describeCheckResult(result);
    expect(msgs[0]).toBe("2 sources you cite aren't in your list yet: Smith (2023), Doe (2021).");
  });

  it('uses singular phrasing for one missing source', () => {
    const result = checkReferences('One claim (Zhao, 2019).', []);
    const msgs = describeCheckResult(result);
    expect(msgs[0]).toBe("1 source you cite isn't in your list yet: Zhao (2019).");
  });

  it('mentions never-cited list entries gently, with the marker context', () => {
    const result = checkReferences('Shown before (Smith, 2023).', [
      rec(['Smith, Jane'], '2023'),
      rec(['Adams, Rose'], '2019', 'Unused one'),
    ]);
    const msgs = describeCheckResult(result);
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toBe('1 source in your list is never cited in the text (markers often check this): Adams (2019).');
  });

  it('says nothing alarming when there are no citations at all', () => {
    const result = checkReferences('Just a draft paragraph.', MIXED_LIB);
    const msgs = describeCheckResult(result);
    expect(msgs).toEqual(['No citations found in this text yet — nothing to check.']);
  });

  it('surfaces a year-mismatch suggestion as a gentle question', () => {
    const result = checkReferences('It was found (Doe, 2021).', [rec(['Doe, John'], '2022')]);
    const msgs = describeCheckResult(result);
    expect(msgs[0]).toContain('Doe (2021)');
    expect(msgs[0]).toContain('your list has Doe (2022); same source?');
  });

  it('surfaces a spelling suggestion as a gentle question', () => {
    const result = checkReferences('It was found (Smtih, 2023).', [rec(['Smith, Jane'], '2023')]);
    const msgs = describeCheckResult(result);
    expect(msgs[0]).toContain('did you mean Smith?');
  });
});

/**
 * Grade Protection depends on the checker reading the SAME words the formatter writes. Harvard
 * (Cite Them Right) is the default style and spells an undated source "(Roe, no date)", so an
 * undated citation must be recognised in that wording as well as in the "n.d." of the other three.
 */
describe('undated citations — every styleʼs own wording is recognised', () => {
  const undatedRecord = {
    type: 'website',
    title: 'A page about cats',
    authors: ['Roe, Jane'],
    publicationDate: '',
    accessDate: '2025-11-24',
    url: 'https://cats.example/page',
  };

  it("matches Harvard's own in-text output for an undated record", () => {
    const inText = formatInText(undatedRecord, 'harvard');
    expect(inText).toBe('(Roe, no date)');
    const result = checkReferences(`Cats have been studied ${inText}.`, [undatedRecord]);
    expect(result.counts.matched).toBe(1);
    expect(result.citedNotListed).toEqual([]);
    expect(result.listedNotCited).toEqual([]);
  });

  it("matches APA 7's own in-text output for an undated record", () => {
    const inText = formatInText(undatedRecord, 'apa7');
    expect(inText).toBe('(Roe, n.d.)');
    const result = checkReferences(`Cats have been studied ${inText}.`, [undatedRecord]);
    expect(result.counts.matched).toBe(1);
    expect(result.listedNotCited).toEqual([]);
  });

  it('canonicalises every undated spelling to one token', () => {
    const year = essay => extractInTextCitations(essay)[0].year;
    expect(year('Guidance exists (NHS, no date).')).toBe('n.d.');
    expect(year('Guidance exists (NHS, No Date).')).toBe('n.d.');
    expect(year('Guidance exists (NHS,  no  date).')).toBe('n.d.');
    expect(year('Guidance exists (NHS, n.d).')).toBe('n.d.');
    expect(year('Guidance exists (NHS, n.d.).')).toBe('n.d.');
  });

  it('recognises the narrative form "Roe (no date)"', () => {
    const out = extractInTextCitations('Roe (no date) disagrees.');
    expect(out).toHaveLength(1);
    expect(out[0].families).toEqual(['Roe']);
    expect(out[0].year).toBe('n.d.');
  });

  it('still flags a "no date" citation with no undated record in the list', () => {
    const result = checkReferences('Guidance exists (NHS, no date).', [rec(['NHS'], '2020')]);
    expect(result.counts.matched).toBe(0);
    expect(result.citedNotListed).toHaveLength(1);
  });

  it('never reads a bare "(no date)" as a citation', () => {
    expect(extractInTextCitations('The letter is undated (no date).')).toEqual([]);
  });
});
