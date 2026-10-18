/**
 * "Is this right?" reassurance engine.
 *
 * A fully DETERMINISTIC verdict on a citation's completeness and plausibility — it runs with AI
 * off (FERPA/offline) and never calls a network or a model. It returns an overall green / amber /
 * red level plus plain-English, anxiety-reducing reasons (no error codes, no colour-only meaning).
 * AI may later phrase a softer suggestion for amber edge cases, but the verdict here stands alone.
 *
 * Philosophy: only flag genuine problems. We do NOT nag about "Given Family" vs "Family, Given" —
 * the formatters handle both — because a false alarm raises anxiety, the opposite of the goal.
 */

import { normalizeCitation } from './citation-types.js';
import { extractYear } from './citation-model.js';

export const LEVELS = Object.freeze({ GREEN: 'green', AMBER: 'amber', RED: 'red' });

/**
 * The field each reason concerns, so a UI can deep-link a "Fix this" action to the right
 * capture/edit step without parsing the prose message. `none` is the positive (green) verdict.
 * @enum {string}
 */
export const FIELDS = Object.freeze({
  TITLE: 'title',
  AUTHOR: 'author',
  YEAR: 'year',
  LINK: 'link',
  CONTAINER: 'container',
  NONE: 'none',
});

const RANK = { green: 0, amber: 1, red: 2 };

/** Earliest plausible publication year (printing press era) — guards against typos like "21". */
const MIN_YEAR = 1450;

/** An author entry that looks like noise rather than a name (digits, contact info, a sentence). */
function looksMalformed(author) {
  const a = String(author || '').trim();
  if (!a) {
    return true;
  }
  if (/[@]|https?:\/\//i.test(a)) {
    return true;
  }
  if (/\d/.test(a)) {
    return true;
  }
  if (a.split(/\s+/).length >= 4) {
    return true;
  }
  return false;
}

/** How each style is named to a student. */
const STYLE_NAMES = Object.freeze({
  harvard: 'Harvard',
  apa7: 'APA',
  mla9: 'MLA',
  chicago17: 'Chicago',
});

/** The styles that write article and book titles in sentence case, and the types that means. */
const SENTENCE_CASE_STYLES = new Set(['harvard', 'apa7']);
const SENTENCE_CASE_NOUNS = Object.freeze({
  journal: 'article titles',
  newspaper: 'article titles',
  chapter: 'chapter titles',
  book: 'book titles',
});

/** The styles that write every title in title (headline) case. */
const TITLE_CASE_STYLES = new Set(['mla9', 'chicago17']);

/** Words a title-cased title leaves in lower case, so they say nothing either way. */
const LITTLE_WORDS = new Set(
  (
    'a an the and but or nor for so yet as at by in of off on per to up via vs with from into ' +
    'onto upon over than about above across after against along among around before behind ' +
    'below beneath beside between beyond during except inside near past since through toward ' +
    'towards under until within without'
  ).split(' ')
);

/** Fewest telling words either way before a title's capitals are worth a remark. */
const MIN_TELLING_WORDS = 3;

/**
 * Count the words that tell sentence case from title case. The first word of the title and of a
 * subtitle are capitalised in both; little words are lower case in both; short words and anything
 * with a capital after its first letter (NASA, iPhone, McDonald) are left out as likely acronyms
 * or names. What is left is either Capitalised or lower case.
 * @param {string} title
 * @returns {{capitalised: number, lower: number}}
 */
function tellingWords(title) {
  let capitalised = 0;
  let lower = 0;
  const clauses = String(title || '').split(/[:?!]\s+|\s[—–-]\s/);
  for (const clause of clauses) {
    const words = clause.split(/\s+/).filter(Boolean).slice(1);
    for (const raw of words) {
      const word = raw.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
      if (word.length < 4 || LITTLE_WORDS.has(word.toLowerCase()) || !/^\p{L}+$/u.test(word)) {
        continue;
      }
      if (/^\p{Lu}\p{Ll}+$/u.test(word)) {
        capitalised++;
      } else if (/^\p{Ll}+$/u.test(word)) {
        lower++;
      }
    }
  }
  return { capitalised, lower };
}

/**
 * The "check capitals" hint for the chosen style, or null. Conservative on purpose: it speaks
 * only when every telling word points the wrong way and there are enough of them, so a title that
 * is plausibly right — or mostly names and acronyms — is never flagged. It never changes the
 * title; converting would break the proper nouns it cannot see.
 * @param {Object} c - normalised citation
 * @param {string} [style]
 * @returns {string|null}
 */
function capitalsHint(c, style) {
  const name = STYLE_NAMES[style];
  if (!name || !c.title) {
    return null;
  }
  const { capitalised, lower } = tellingWords(c.title);
  if (SENTENCE_CASE_STYLES.has(style)) {
    const noun = SENTENCE_CASE_NOUNS[c.type];
    if (noun && capitalised >= MIN_TELLING_WORDS && lower === 0) {
      return `${name} writes ${noun} in sentence case: check the capitals.`;
    }
  } else if (TITLE_CASE_STYLES.has(style) && lower >= MIN_TELLING_WORDS && capitalised === 0) {
    return `${name} writes titles in title case: check the capitals.`;
  }
  return null;
}

/**
 * Assess a citation. Pure and synchronous.
 * @param {Object} citation - raw or normalised citation
 * @param {{style?: string}} [options] - the student's citation style, for the capitals hint
 * @returns {{ level: string, reasons: Array<{level: string, message: string}> }}
 */
export function assessCitation(citation, options = {}) {
  const c = normalizeCitation(citation) || {};
  const issues = [];
  const add = (level, field, message) => issues.push({ level, field, message });

  // Title — the one truly required field.
  if (!c.title || !c.title.trim()) {
    add(LEVELS.RED, FIELDS.TITLE, 'Missing the title.');
  } else {
    const hint = capitalsHint(c, options.style);
    if (hint) {
      add(LEVELS.AMBER, FIELDS.TITLE, hint);
    }
  }

  // Authors.
  const authors = Array.isArray(c.authors) ? c.authors : [];
  // An "Anon." placeholder is already gone (normalizeCitation drops it); "Anonymous" is a real
  // signature and needs no remark.
  if (authors.length === 0) {
    add(LEVELS.AMBER, FIELDS.AUTHOR, 'No author listed — the title will stand in for the author.');
  } else {
    const bad = authors.find(looksMalformed);
    if (bad) {
      add(
        LEVELS.AMBER,
        FIELDS.AUTHOR,
        `An author entry looks off: “${bad}”. Check it’s just a name.`
      );
    }
  }

  // Year. A non-empty date we can't read a 4-digit year from is a silent-error trap: the styles
  // print "(no date)" for it, so "21" would reach the reference list as undated without a word.
  const pubRaw = String(c.publicationDate || '').trim();
  const pubYear = extractYear(pubRaw);
  if (pubRaw && !pubYear) {
    add(LEVELS.AMBER, FIELDS.YEAR, `Couldn’t read a year from the date “${pubRaw}”.`);
  }
  // The PUBLICATION year only. The access date used to stand in for it, so a source with no date
  // was told "looks complete" while every style printed it "(no date)" / "n.d." — the one warning
  // the student needed, withheld by the one field that is always filled in.
  const year = Number(pubYear);
  const nextYear = new Date().getFullYear() + 1;
  if (!year) {
    add(LEVELS.AMBER, FIELDS.YEAR, 'No publication year — add one if you can find it.');
  } else if (year < MIN_YEAR || year > nextYear) {
    add(LEVELS.RED, FIELDS.YEAR, `The year ${year} looks wrong.`);
  }

  // Locatability — a reader needs a way to find the source.
  if (!String(c.doi || '').trim() && !String(c.url || '').trim()) {
    add(LEVELS.AMBER, FIELDS.LINK, 'No link or DOI, so the source can’t be located.');
  }

  // Journal articles need a container title.
  if (c.type === 'journal' && !String(c.siteName || '').trim()) {
    add(LEVELS.AMBER, FIELDS.CONTAINER, 'No journal name for this article.');
  }

  if (issues.length === 0) {
    return {
      level: LEVELS.GREEN,
      reasons: [
        {
          level: LEVELS.GREEN,
          field: FIELDS.NONE,
          message: 'Looks complete — title, author and year are all there.',
        },
      ],
    };
  }

  const level = issues.reduce(
    (worst, i) => (RANK[i.level] > RANK[worst] ? i.level : worst),
    LEVELS.GREEN
  );
  return { level, reasons: issues };
}

export default { LEVELS, FIELDS, assessCitation };
