/**
 * The words for an import.
 *
 * One owner for the whole message: `importCitations()` returns facts and says nothing, and this
 * turns those facts into one sentence the library announces once. Before that, the exporter and the
 * file-input handler each toasted, so every import was read out twice — and a refused file arrived
 * as a green tick or as `s.map is not a function`.
 *
 * The rules the wording holds to:
 *   - Nothing found is NOT a success. "No citations were found in x.bib." with an error status.
 *   - A file that cannot be read gets a plain sentence, never the parser's own error text.
 *   - A partial import says how many were saved AND how many were not, with the entries named.
 *   - Counts are singular or plural for real: "1 citation", "2 citations", "1 entry", "3 entries".
 */

/** "1 citation" / "3 citations". */
function citationCount(n) {
  return `${n} citation${n === 1 ? '' : 's'}`;
}

/** "1 entry" / "3 entries" — what a line in the file is called before it is a citation. */
function entryCount(n) {
  return `${n} entr${n === 1 ? 'y' : 'ies'}`;
}

/** A title is quoted; a position ("entry 3") reads as itself. */
function nameEntry(label) {
  return /^entry \d+$/.test(label) ? label : `“${label}”`;
}

/**
 * Name the entries that could not be read — at most three, so the sentence stays readable, and the
 * rest counted rather than dropped in silence.
 * @param {string[]} labels
 * @returns {string} '' when there is nothing to name
 */
function nameFailures(labels) {
  const named = labels.slice(0, 3).map(nameEntry);
  if (named.length === 0) {
    return '';
  }
  const rest = labels.length - named.length;
  return rest > 0 ? `${named.join(', ')} and ${rest} more` : named.join(', ');
}

/**
 * Turn an import outcome into the one thing the student is told.
 * @param {import('../../features/citations/citation-export.js').ImportOutcome} outcome
 * @returns {{ ok: boolean, message: string }} ok:false must be announced as a problem, never a tick
 */
export function importReport(outcome) {
  const { filename, added, failed, failedLabels, problem } = outcome;

  if (problem === 'unsupported') {
    return {
      ok: false,
      message: `AssisT can import .ris, .bib, .csl and .json files. ${filename} is not one of those.`,
    };
  }

  if (problem === 'unreadable') {
    return {
      ok: false,
      message:
        `AssisT could not read ${filename}. It may be incomplete, or saved in a different ` +
        'format from the one its name promises. Nothing in your library has changed.',
    };
  }

  if (problem === 'empty' || (added === 0 && failed === 0)) {
    return { ok: false, message: `No citations were found in ${filename}.` };
  }

  if (added === 0) {
    return {
      ok: false,
      message:
        `No citations could be read from ${filename}. ${entryCount(failed)} ` +
        `${failed === 1 ? 'was' : 'were'} not in a shape AssisT understands: ` +
        `${nameFailures(failedLabels)}.`,
    };
  }

  if (failed === 0) {
    return { ok: true, message: `Imported ${citationCount(added)} from ${filename}.` };
  }

  return {
    ok: true,
    message:
      `Imported ${citationCount(added)} from ${filename}. ${entryCount(failed)} could not be ` +
      `read: ${nameFailures(failedLabels)}.`,
  };
}

export default { importReport };
