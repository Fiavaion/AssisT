/**
 * @jest-environment jsdom
 *
 * importReport() — the one sentence a student gets after an import.
 *
 * The rules being held to (overnight testing found every one of them broken): nothing found is not a
 * success, a refused file gets plain words rather than the parser's, a partial import says both
 * numbers and names what failed, and the counts are singular or plural for real.
 */

import { importReport } from '../../../src/pages/citation-library/import-report.js';

/** An outcome with the shape importCitations returns. */
function outcome(partial) {
  return { filename: 'zotero.bib', added: 0, failed: 0, failedLabels: [], problem: null, ...partial };
}

describe('importReport()', () => {
  test('one citation is "1 citation", not "1 citations"', () => {
    expect(importReport(outcome({ added: 1 }))).toEqual({
      ok: true,
      message: 'Imported 1 citation from zotero.bib.',
    });
  });

  test('more than one is plural', () => {
    expect(importReport(outcome({ added: 3 })).message).toBe('Imported 3 citations from zotero.bib.');
  });

  test('nothing found is not a success, and says which file', () => {
    const report = importReport(outcome({ problem: 'empty', filename: 'garbage.bib' }));

    expect(report.ok).toBe(false);
    expect(report.message).toBe('No citations were found in garbage.bib.');
  });

  test('an unreadable file gets plain words and the reassurance that nothing changed', () => {
    const report = importReport(outcome({ problem: 'unreadable', filename: 'cut.json' }));

    expect(report.ok).toBe(false);
    expect(report.message).toMatch(/^AssisT could not read cut\.json\./);
    expect(report.message).toMatch(/Nothing in your library has changed\.$/);
    // Never the parser's own words.
    expect(report.message).not.toMatch(/JSON|map is not a function|undefined/);
  });

  test('a file we do not import lists the ones we do', () => {
    const report = importReport(outcome({ problem: 'unsupported', filename: 'notes.txt' }));

    expect(report.ok).toBe(false);
    expect(report.message).toBe(
      'AssisT can import .ris, .bib, .csl and .json files. notes.txt is not one of those.'
    );
  });

  test('a partial import gives both numbers and names what failed', () => {
    const report = importReport(
      outcome({ added: 1, failed: 1, failedLabels: ['Broken Record'], filename: 'half.bib' })
    );

    expect(report.ok).toBe(true);
    expect(report.message).toBe(
      'Imported 1 citation from half.bib. 1 entry could not be read: “Broken Record”.'
    );
  });

  test('several failures are counted as entries and named, three at most', () => {
    const report = importReport(
      outcome({ added: 2, failed: 5, failedLabels: ['One', 'Two', 'Three', 'Four', 'Five'] })
    );

    expect(report.message).toBe(
      'Imported 2 citations from zotero.bib. 5 entries could not be read: ' +
        '“One”, “Two”, “Three” and 2 more.'
    );
  });

  test('a position reads as itself, not as a quoted title', () => {
    const report = importReport(
      outcome({ failed: 4, failedLabels: ['entry 1', 'entry 2', 'entry 3', 'entry 4'], filename: 'list.json' })
    );

    expect(report.ok).toBe(false);
    expect(report.message).toBe(
      'No citations could be read from list.json. 4 entries were not in a shape AssisT ' +
        'understands: entry 1, entry 2, entry 3 and 1 more.'
    );
  });

  test('one unreadable entry and nothing saved agrees with itself grammatically', () => {
    const report = importReport(outcome({ failed: 1, failedLabels: ['entry 1'], filename: 'x.json' }));

    expect(report.ok).toBe(false);
    expect(report.message).toBe(
      'No citations could be read from x.json. 1 entry was not in a shape AssisT understands: entry 1.'
    );
  });
});
