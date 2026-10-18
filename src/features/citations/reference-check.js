/**
 * Reference check — deterministic, offline in-text ↔ reference-list mismatch checker.
 *
 * In-text/reference-list mismatches are one of the most common mark-loss mechanisms in
 * student essays. This module cross-checks the citations written in an essay against the
 * student's saved citation library and reports, as data:
 *   - citedAndListed  — in-text citations with a matching library record (the good news)
 *   - citedNotListed  — in-text citations with no matching record (with a gentle suggestion
 *                       when a record differs only by year or by a one-keystroke spelling)
 *   - listedNotCited  — library records never cited in the text
 *
 * Pure module: no DOM, no chrome APIs, no network, no AI. Author parsing and year
 * resolution intentionally REUSE the formatter's own helpers (parseAuthor / getYear from
 * citation-styles/shared.js) so the checker agrees with what the formatter renders.
 *
 * DESIGN STANCE — reassurance, not policing. False alarms cause anxiety (the product's
 * anti-goal), so every ambiguity resolves toward NOT flagging:
 *   - Parentheticals with no plausible year ("(for example)", "(UK)") are ignored.
 *   - URLs in parentheses and years in prose ("In 2023 the study…") are never citations.
 *   - Year RANGES ("(1939-1945)", "Beethoven (1770–1827)") read as event/lifespan dates,
 *     not citations, and are ignored.
 *   - MLA bare "(Family 24)" is ambiguous with maths/ratios, so it is recognised ONLY when
 *     the family already exists in the library (the knownFamilies gate).
 *   - The inner (original) source of a secondary citation "(X, 1978, cited in Y, 2016)" is
 *     reported with `secondary: true` but is NEVER flagged as missing — style guides put
 *     only the outer source in the reference list.
 *   - A library record with no parseable author matches nothing (never guess) AND is never
 *     flagged as un-cited (we cannot verify it, so we stay silent).
 *   - A record used as a suggestion (year-mismatch / near-spelling) is not ALSO reported
 *     as never-cited: one problem, one message.
 *
 * MATCHING RULES (locked):
 *   - Case-insensitive first-author family + year. "et al." ignores the rest; a multi-author
 *     in-text cite matches on its FIRST family only.
 *   - A year letter picks one work: "2023a" matches the record the formatter letters "a" within
 *     its collection (the same reference list the formatter letters over); a year with no letter
 *     matches any of that year's records, the first one not yet cited. Every undated marker a
 *     style prints — "n.d.", Harvard's "no date", and their lettered forms "n.d.-a", "no date a",
 *     "n.d.a" — matches a record with no publication date, mirroring the formatter: the access
 *     date is never read as a publication year.
 *   - A work with no author is cited by its title, and the title is recognised ONLY when it is a
 *     title in the library (the full title, its main title or its short form): ("Climate and
 *     health," 2021), (Mystery page, 2020), ("Mystery page" 2020), ("Mystery page" 5).
 *   - MLA 9's author-plus-short-title form, (Morrison, Beloved 27), is recognised when both the
 *     family and the title are in the library, and matches that work alone.
 *   - Particle tolerance: "van der Berg" matches a record whose parsed family is "Berg" and
 *     vice versa (word-suffix match), because parseAuthor derives different families from
 *     "van der Berg, Anna" vs "Anna van der Berg".
 *   - Spelling suggestions use Damerau-Levenshtein distance 1, families >= 4 chars only
 *     (short names would produce noisy suggestions).
 *
 * KNOWN LIMITATIONS (v1, documented deliberately):
 *   - Footnote styles (Chicago notes-bibliography, OSCOLA) and numeric styles
 *     (Vancouver, IEEE "[12]") are OUT of scope.
 *   - Capitalised non-name phrases directly before a year can be over-extracted
 *     ("The Second World War, 1939"); rare in practice and bounded by the year requirement.
 *   - Only one "cited in" chain per citation segment is handled.
 */

import { normalizeCitation } from './citation-types.js';
import { parseAuthor, getYear, shortTitle, LEADING_ARTICLE } from './citation-styles/shared.js';
import { assignYearLetters, collectionOf } from './citation-styles/reference-set.js';
import { listRulesFor } from './citation-styles/index.js';

/** Lowercase surname particles that may precede the capitalised family word. */
const PARTICLES = new Set([
  'van',
  'von',
  'der',
  'den',
  'de',
  'la',
  'le',
  'du',
  'da',
  'di',
  'del',
  'della',
  'dos',
  'das',
  'ter',
  'ten',
  'te',
  'af',
  'av',
  'el',
  'al',
  'bin',
  'ibn',
  'y',
]);

/**
 * How a style spells an undated source: "n.d" / "n.d." (APA, MLA, Chicago) and "no date"
 * (Harvard — Cite Them Right, the default style). Written as character classes rather than an
 * `i` flag because the patterns these join also carry `\p{Lu}`, which case-insensitive matching
 * would stop distinguishing from a lowercase word.
 */
const UNDATED_SRC = String.raw`[nN]\.[dD]\.?(?:-?[a-z](?!\p{L}))?|[nN][oO]\s+[dD][aA][tT][eE](?:\s[a-z](?!\p{L}))?`;

/** Plausible citation year (1400s–2000s), optional disambiguating letter, or an undated marker. */
const YEAR_SRC = String.raw`(?:1[4-9]\d{2}|20\d{2})[a-z]?|${UNDATED_SRC}`;

/** A capitalised name word: "Smith", "Ó", "Súilleabháin", "O'Neill", "Smith-Jones", "J.". */
const WORD_SRC = String.raw`[\p{Lu}][\p{L}'’.-]*`;
/** Lowercase-apostrophe name forms: "d'Souza", "l'Estrange". */
const APOS_SRC = String.raw`[dDlLoO]['’][\p{Lu}][\p{L}'’.-]*`;
const PART_SRC = `(?:${[...PARTICLES].join('|')})`;
const FAMWORD_SRC = `(?:${WORD_SRC}|${APOS_SRC}|${PART_SRC})`;
/** A family name: 1–4 words of capitalised words and/or particles. */
const FAM_SRC = `${FAMWORD_SRC}(?: ${FAMWORD_SRC}){0,3}`;

/**
 * Narrative citations: "Smith (2023)", "Smith et al. (2023)", "Smith and Doe (2023)".
 * The leading lookbehind stops a particle matching the tail of a word ("whi-le van…");
 * the negative lookahead after the year rejects date ranges ("(1770–1827)" lifespans).
 */
const NARRATIVE_RE = new RegExp(
  `(?<![\\p{L}'’-])(${FAM_SRC}(?:\\s+et\\s+al\\.?|\\s+(?:and|&)\\s+${FAM_SRC})?)\\s*\\(\\s*((?:${YEAR_SRC}))(?![–-]\\d)[^)]*\\)`,
  'gu'
);

/**
 * First plausible year token inside a parenthetical segment. Must be preceded by
 * start/space/comma and followed by space/comma/semicolon/end — so digits embedded in
 * words, URLs, or ranges ("2019-2023") never qualify.
 */
const SEG_YEAR_RE = new RegExp(`(?:^|[\\s,])((?:${YEAR_SRC}))(?=[\\s,;)]|$)`, 'u');

/** Non-citation lead-ins that may precede the author list inside a parenthetical. */
const PREFIX_RE =
  /^(?:see\s+also|see|e\.g\.|cf\.|compare|but\s+see|for\s+example|as\s+in)[,:]?\s+/iu;

/** Secondary-citation connector: "…, cited in …" / "…, as cited in …". */
const CITED_IN_RE = /,?\s+(?:as\s+)?cited\s+in\s+/iu;

const CAP_WORD_RE = /^[\p{Lu}][\p{L}'’.-]*$/u;
/** Initials alone, each with its full stop: "J.", "J. M", "J.M." — never an acronym ("NHS"). */
const INITIALS_RE = /^\p{Lu}\.(?:\s?\p{Lu}\.?)*$/u;
const APOS_WORD_RE = /^[dDlLoO]['’][\p{Lu}][\p{L}'’.-]*$/u;

/**
 * True when the string plausibly is a family name (or organisation acronym):
 * 1–4 words, each a capitalised word or a known particle, ending on a capitalised word.
 * @param {string} text
 * @returns {boolean}
 */
function isFamilyName(text) {
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0 || words.length > 4) {
    return false;
  }
  const last = words[words.length - 1];
  if (!CAP_WORD_RE.test(last) && !APOS_WORD_RE.test(last)) {
    return false;
  }
  return words.every(
    w => CAP_WORD_RE.test(w) || APOS_WORD_RE.test(w) || PARTICLES.has(w.toLowerCase())
  );
}

/**
 * Strip possessives and sentence punctuation from a family token ("Smith's" -> "Smith").
 * Single-letter initials ("J.") keep their dot.
 * @param {string} token
 * @returns {string}
 */
function cleanToken(token) {
  let s = token
    .trim()
    .replace(/['’]s$/u, '')
    .replace(/['’]$/u, '');
  if (s.length > 2) {
    s = s.replace(/\.+$/u, '');
  }
  return s;
}

/**
 * Parse the author part of a citation ("Smith & Doe", "Smith et al.", "van der Berg and
 * O'Neill") into family names. Returns null when any token does not look like a name —
 * the not-a-citation signal.
 * @param {string} text
 * @returns {{families: string[], etAl: boolean}|null}
 */
function parseAuthorPart(text) {
  let s = String(text || '').trim();
  let etAl = false;
  const etAlMatch = s.match(/[\s,]+et\s+al\.?$/iu);
  if (etAlMatch) {
    etAl = true;
    s = s.slice(0, etAlMatch.index);
  }
  s = s.replace(/[\s,]+$/u, '');
  if (!s) {
    return null;
  }
  const families = [];
  for (const token of s
    .split(/\s*(?:,|&|\band\b)\s*/iu)
    .map(cleanToken)
    .filter(Boolean)) {
    // Cite Them Right tells two Smiths apart with initials after the surname: "Smith, J.".
    if (families.length > 0 && INITIALS_RE.test(token)) {
      families.push(`${token} ${families.pop()}`);
    } else {
      families.push(token);
    }
  }
  if (families.length === 0 || !families.every(isFamilyName)) {
    return null;
  }
  return { families, etAl };
}

/**
 * Canonicalise a year token: every undated spelling ("n.d", "n.d.", "no date", whatever the
 * style prints) folds to "n.d.", keeping a year letter as "n.d.a" ("n.d.-a", "no date a");
 * digits are kept as written ("2019a").
 * @param {string} token
 * @returns {string}
 */
function normaliseYearToken(token) {
  const t = String(token).trim();
  const undated = t.match(/^(?:n\.d\.?|no\s+date)(?:-?\s*([a-z]))?$/iu);
  return undated ? `n.d.${(undated[1] || '').toLowerCase()}` : t;
}

/**
 * A title as the checker compares it: lower case, quotation marks, trailing punctuation and an
 * initial A/An/The removed, spaces collapsed. "“The Bluest Eye,”" → "bluest eye".
 * @param {string} text
 * @returns {string}
 */
function titleKey(text) {
  return String(text || '')
    .replace(/["“”‘’]/gu, '')
    .replace(/^[\s,]+|[\s,.;:]+$/gu, '')
    .replace(LEADING_ARTICLE, '')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

/**
 * Every way a record's title can stand in a citation: in full, its main title, and the short
 * forms the formatters print (MLA's drops an initial article).
 * @param {string} title
 * @returns {Set<string>}
 */
function titleKeysOf(title) {
  const main = String(title || '').split(/:\s|\s[—–-]\s/u)[0];
  return new Set(
    [title, main, shortTitle(title), shortTitle(title, { dropArticle: true })]
      .map(titleKey)
      .filter(Boolean)
  );
}

/**
 * A citation segment that names a work by its title, when that title is one the library holds.
 * @param {string} text - the segment's author part
 * @param {Set<string>|null} knownTitles
 * @returns {string} the title key, or ''
 */
function knownTitle(text, knownTitles) {
  const key = titleKey(text);
  return key && knownTitles && knownTitles.has(key) ? key : '';
}

/**
 * Parse one parenthetical segment (already split on ';' and 'cited in') into families (or a
 * known title) + year. Returns null for anything that does not read as a citation.
 * @param {string} text
 * @param {Set<string>|null} knownFamilies - lowercase families for the MLA forms
 * @param {Set<string>|null} knownTitles - title keys of the library's records
 * @returns {{families: string[], year: string|null, title?: string, titleText?: string}|null}
 */
function parseSegmentText(text, knownFamilies, knownTitles) {
  let s = String(text || '')
    .trim()
    .replace(/^[\s,]+/u, '');
  let prev;
  do {
    prev = s;
    s = s.replace(PREFIX_RE, '');
  } while (s !== prev);
  if (!s || /:\/\/|\bwww\./iu.test(s)) {
    return null;
  }

  const ym = SEG_YEAR_RE.exec(s);
  if (!ym) {
    return parseMlaSegment(s, knownFamilies, knownTitles);
  }

  const authorsText = s.slice(0, ym.index).replace(/[\s,]+$/u, '');
  if (!authorsText) {
    return null;
  }
  const year = normaliseYearToken(ym[1]);
  const parsed = parseAuthorPart(authorsText);
  // A work with no author is cited by its title; a known title wins over a lookalike family.
  const title = knownTitle(authorsText, knownTitles);
  const isKnownFamily = parsed && isKnown(parsed.families[0], knownFamilies);
  if (title && !isKnownFamily) {
    return { families: [], title, titleText: authorsText.replace(/["“”,]/gu, ''), year };
  }
  if (!parsed) {
    return null;
  }
  return { families: parsed.families, year };
}

/**
 * The MLA forms, which carry no year: "(Family 24)", "(Family, Short Title 24)" and
 * "(\"Short Title\" 24)". A bare family and a page is ambiguous with maths, so every form is gated
 * on what the library holds: a known family, a known title, or both.
 * @param {string} s - the segment, prefixes removed
 * @param {Set<string>|null} knownFamilies
 * @param {Set<string>|null} knownTitles
 * @returns {{families: string[], year: null, title?: string, titleText?: string}|null}
 */
function parseMlaSegment(s, knownFamilies, knownTitles) {
  const located = s.match(/^(.+?)(?:\s+\d{1,4}(?:\s*[–-]\s*\d{1,4})?)?$/u);
  const head = located ? located[1] : s;

  const title = knownTitle(head, knownTitles);
  if (title) {
    return { families: [], title, titleText: head.replace(/["“”]/gu, ''), year: null };
  }

  const comma = head.indexOf(',');
  if (comma > 0 && knownFamilies) {
    const who = parseAuthorPart(head.slice(0, comma));
    const named = knownTitle(head.slice(comma + 1), knownTitles);
    if (who && named && isKnown(who.families[0], knownFamilies)) {
      return { families: who.families, title: named, year: null };
    }
  }

  // The bare family form needs a page: "(Smith)" alone is too easily something else.
  if (!knownFamilies || knownFamilies.size === 0) {
    return null;
  }
  const bare = s.match(/^(.+?)\s+\d{1,4}(?:\s*[–-]\s*\d{1,4})?$/u);
  const parsed = bare ? parseAuthorPart(bare[1]) : null;
  if (!parsed || parsed.families.length !== 1) {
    return null;
  }
  if (!isKnown(parsed.families[0], knownFamilies)) {
    return null;
  }
  return { families: parsed.families, year: null };
}

/**
 * True when a cited name is a family the library holds, alone or after a given name or initials
 * that tell two people with that surname apart: "Smith", "J. Smith", "John Smith".
 * @param {string} name
 * @param {Set<string>|null} knownFamilies - lowercase
 * @returns {boolean}
 */
function isKnown(name, knownFamilies) {
  if (!knownFamilies) {
    return false;
  }
  const key = name.toLowerCase();
  return knownFamilies.has(key) || [...knownFamilies].some(f => key.endsWith(` ${f}`));
}

/**
 * Split parenthetical content on ';' keeping each segment's offset within the content.
 * @param {string} content
 * @returns {Array<{text: string, offset: number}>}
 */
function splitSegments(content) {
  const segments = [];
  let start = 0;
  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content[i] === ';') {
      segments.push({ text: content.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  return segments;
}

/**
 * One entry for a parsed segment: the families (or the known title) it names and its year.
 * @param {string} raw
 * @param {Object} parsed - a parseSegmentText result
 * @param {number} index
 * @param {boolean} secondary
 * @returns {Object}
 */
function toEntry(raw, parsed, index, secondary) {
  const entry = { raw, families: parsed.families, year: parsed.year, index, secondary };
  if (parsed.title) {
    entry.title = parsed.title;
    entry.titleText = (parsed.titleText || '').trim();
  }
  return entry;
}

/**
 * Extract the in-text citations from an essay.
 *
 * Recognises parenthetical APA/Harvard/Chicago author-date forms (with prefixes, locators,
 * year letters, n.d. / "no date" and their lettered forms, semicolon multi-cites, and "cited in"
 * secondary chains), narrative forms ("Smith (2023)"), and — only for what the library holds —
 * a title in the author position, the MLA bare form "(Family 24)" and MLA's
 * "(Family, Short Title 24)".
 *
 * @param {string} essayText
 * @param {Set<string>|Iterable<string>} [knownFamilies] - library family names (any case);
 *   enables the MLA forms for those families only
 * @param {Set<string>|Iterable<string>} [knownTitles] - title keys of the library's records;
 *   enables the title forms for those titles only
 * @returns {Array<{raw: string, families: string[], year: string|null, index: number,
 *   secondary: boolean, title?: string, titleText?: string}>} entries in document order; `year`
 *   is null only for MLA cites; `title` is set when the citation names a work by its title;
 *   `index` is the segment's start position in the essay
 */
export function extractInTextCitations(essayText, knownFamilies = null, knownTitles = null) {
  const text = typeof essayText === 'string' ? essayText : '';
  const kf = knownFamilies ? new Set([...knownFamilies].map(f => String(f).toLowerCase())) : null;
  const kt = knownTitles ? new Set([...knownTitles].map(titleKey)) : null;
  const entries = [];

  // Parenthetical citations.
  const parenRe = /\(([^()]*)\)/g;
  let pm;
  while ((pm = parenRe.exec(text)) !== null) {
    const contentStart = pm.index + 1;
    for (const seg of splitSegments(pm[1])) {
      const lead = seg.text.length - seg.text.trimStart().length;
      const segIndex = contentStart + seg.offset + lead;
      const segText = seg.text.trim();
      if (!segText) {
        continue;
      }

      const cim = CITED_IN_RE.exec(segText);
      if (cim) {
        const innerText = segText.slice(0, cim.index).trim();
        const outerText = segText.slice(cim.index + cim[0].length).trim();
        const inner = parseSegmentText(innerText, kf, kt);
        const outer = parseSegmentText(outerText, kf, kt);
        if (inner) {
          entries.push(toEntry(innerText, inner, segIndex, true));
        }
        if (outer) {
          entries.push(toEntry(outerText, outer, segIndex + cim.index + cim[0].length, false));
        }
        continue;
      }

      const parsed = parseSegmentText(segText, kf, kt);
      if (parsed) {
        entries.push(toEntry(segText, parsed, segIndex, false));
      }
    }
  }

  // Narrative citations.
  NARRATIVE_RE.lastIndex = 0;
  let nm;
  while ((nm = NARRATIVE_RE.exec(text)) !== null) {
    const parsed = parseAuthorPart(nm[1]);
    if (!parsed) {
      continue;
    }
    entries.push({
      raw: nm[0],
      families: parsed.families,
      year: normaliseYearToken(nm[2]),
      index: nm.index,
      secondary: false,
    });
  }

  entries.sort((a, b) => a.index - b.index);
  return entries;
}

/**
 * Case-insensitive family comparison with particle tolerance: "van der berg" matches
 * "berg" (word-suffix in either direction) because parseAuthor derives different families
 * from the two stored author forms.
 * @param {string} a - lowercase family
 * @param {string} b - lowercase family
 * @returns {boolean}
 */
function familiesMatch(a, b) {
  if (!a || !b) {
    return false;
  }
  return a === b || a.endsWith(` ${b}`) || b.endsWith(` ${a}`);
}

/**
 * True when the given names or initials a citation puts before the family ("J. Smith", "John
 * Smith") could be the record's first author's: an initial agrees with a name it begins, a name
 * with the same name. Particles ("van der") are part of the family, not a given name, and a record
 * with no given name recorded agrees with anything.
 * @param {string} cited - lowercase, as cited ("j. smith")
 * @param {{key: string, given: string[]}} record - lowercase family and given names
 * @returns {boolean}
 */
function givenAgrees(cited, record) {
  if (!cited.endsWith(` ${record.key}`)) {
    return true;
  }
  const said = cited
    .slice(0, -(record.key.length + 1))
    .split(/[\s.]+/u)
    .filter(word => word && !PARTICLES.has(word));
  return said.every((word, i) => {
    const known = record.given[i];
    if (!known) {
      return true;
    }
    return word.length === 1 || known.length === 1
      ? word.charAt(0) === known.charAt(0)
      : word === known;
  });
}

/**
 * Split a canonical year token into its year and letter: "2023a" → 2023 + a, "n.d.b" → n.d. + b.
 * @param {string} token
 * @returns {{base: string, letter: string}}
 */
function splitYear(token) {
  if (token.startsWith('n.d.')) {
    return { base: 'n.d.', letter: token.slice(4) };
  }
  const m = token.match(/^(\d{4})([a-z]?)$/iu);
  return m ? { base: m[1], letter: m[2].toLowerCase() } : { base: token, letter: '' };
}

/**
 * Year comparison: null (MLA) matches any year; "n.d." matches only a record resolved to "n.d.".
 * A year letter must be the letter the record carries in its reference list; a citation with no
 * letter, or a record that has none, matches on the year alone (never a false alarm).
 * @param {string|null} inYear - year from the in-text citation
 * @param {{year: string, letter: string}} record - the record's year (getYear) and list letter
 * @returns {boolean}
 */
function yearsMatch(inYear, record) {
  if (inYear === null) {
    return true;
  }
  const { base, letter } = splitYear(inYear);
  if (base !== record.year) {
    return false;
  }
  return !letter || !record.letter || letter === record.letter;
}

/**
 * True when two lowercase strings are exactly one Damerau-Levenshtein edit apart
 * (substitution, insertion, deletion, or adjacent transposition).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isEditDistanceOne(a, b) {
  if (a === b) {
    return false;
  }
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];
  if (t.length - s.length > 1) {
    return false;
  }
  if (s.length === t.length) {
    const diffs = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== t[i]) {
        diffs.push(i);
      }
    }
    if (diffs.length === 1) {
      return true;
    }
    return (
      diffs.length === 2 &&
      diffs[1] === diffs[0] + 1 &&
      s[diffs[0]] === t[diffs[1]] &&
      s[diffs[1]] === t[diffs[0]]
    );
  }
  let i = 0;
  while (i < s.length && s[i] === t[i]) {
    i++;
  }
  return s.slice(i) === t.slice(i + 1);
}

/**
 * Cross-check an essay's in-text citations against the citation library.
 *
 * @param {string} essayText
 * @param {Object[]} citations - citation records (normalised defensively here)
 * @param {string} [style] - the student's citation style; its rules decide the year letters, so
 *   they equal the ones the reference list prints (unknown or absent: the default style)
 * @returns {{
 *   citedAndListed: Array<{inText: Object, citation: Object}>,
 *   citedNotListed: Array<{raw: string, families: string[], year: string|null,
 *     suggestion: {type: string, family: string, year: string, citation: Object}|null}>,
 *   listedNotCited: Object[],
 *   counts: {inText: number, matched: number, problems: number}
 * }}
 */
export function checkReferences(essayText, citations, style) {
  const records = Array.isArray(citations)
    ? citations.map(normalizeCitation).filter(c => c && typeof c === 'object')
    : [];
  // Year letters are the formatter's: assigned within each collection, which is the reference
  // list a card is copied in, so "(Smith, 2020b)" points at the record the student copied as b.
  const letters = new Array(records.length).fill('');
  const rules = listRulesFor(style);
  const byCollection = new Map();
  records.forEach((citation, i) => {
    const home = collectionOf(citation);
    if (!byCollection.has(home)) {
      byCollection.set(home, []);
    }
    byCollection.get(home).push(i);
  });
  for (const members of byCollection.values()) {
    const assigned = assignYearLetters(
      members.map(i => records[i]),
      rules
    );
    members.forEach((i, n) => {
      letters[i] = assigned[n];
    });
  }

  const library = records.map((citation, i) => {
    const first = parseAuthor((citation.authors && citation.authors[0]) || '');
    const family = first.family.trim();
    return {
      citation,
      family,
      key: family.toLowerCase(),
      given: first.given
        .toLowerCase()
        .split(/[\s.]+/u)
        .filter(Boolean),
      year: getYear(citation),
      letter: letters[i],
      titleKeys: titleKeysOf(citation.title),
      cited: false,
      suggested: false,
    };
  });
  const knownFamilies = new Set(library.map(e => e.key).filter(Boolean));
  const knownTitles = new Set(library.flatMap(e => [...e.titleKeys]));
  const inText = extractInTextCitations(essayText, knownFamilies, knownTitles);

  const citedAndListed = [];
  const citedNotListed = [];
  const missingKeys = new Set();

  for (const entry of inText) {
    const fam = (entry.families[0] || '').toLowerCase();
    // A title names one work; with a family too (MLA), both must agree.
    const candidates = library.filter(e =>
      entry.title
        ? e.titleKeys.has(entry.title) && (!fam || (e.key && familiesMatch(fam, e.key)))
        : e.key && familiesMatch(fam, e.key) && givenAgrees(fam, e)
    );
    const matches = candidates.filter(e => yearsMatch(entry.year, e));
    const match = matches.find(e => !e.cited) || matches[0];
    if (match) {
      match.cited = true;
      citedAndListed.push({ inText: entry, citation: match.citation });
      continue;
    }
    if (entry.secondary) {
      // The original inside "(X, cited in Y)" is not expected in the reference list.
      continue;
    }

    let suggestion = null;
    if (candidates.length > 0) {
      const near = candidates[0];
      candidates.forEach(e => {
        e.suggested = true;
      });
      suggestion = {
        type: 'year-mismatch',
        family: near.family || near.citation.title,
        year: near.year,
        citation: near.citation,
      };
    } else if (!entry.title && fam.length >= 4) {
      const near = library.find(e => e.key.length >= 4 && isEditDistanceOne(fam, e.key));
      if (near) {
        near.suggested = true;
        suggestion = {
          type: 'spelling',
          family: near.family,
          year: near.year,
          citation: near.citation,
        };
      }
    }

    const who = entry.title && !fam ? entry.title : fam;
    const dedupeKey = `${who}|${entry.year === null ? '' : splitYear(entry.year).base}`;
    if (!missingKeys.has(dedupeKey)) {
      missingKeys.add(dedupeKey);
      const missing = { raw: entry.raw, families: entry.families, year: entry.year, suggestion };
      if (entry.title) {
        missing.titleText = entry.titleText;
      }
      citedNotListed.push(missing);
    }
  }

  const listedNotCited = library
    .filter(e => e.key && !e.cited && !e.suggested)
    .map(e => e.citation);

  return {
    citedAndListed,
    citedNotListed,
    listedNotCited,
    counts: {
      inText: inText.length,
      matched: citedAndListed.length,
      problems: citedNotListed.length + listedNotCited.length,
    },
  };
}

/**
 * Display label for an in-text entry: "Smith (2023)" / "Smith (n.d.)" / "Heaney" (MLA) /
 * "“Climate and health” (2019)" for a work cited by its title.
 * @param {{families: string[], year: string|null, titleText?: string}} entry
 * @returns {string}
 */
function entryLabel(entry) {
  const who = entry.families[0] || `“${entry.titleText || ''}”`;
  return entry.year ? `${who} (${entry.year})` : who;
}

/**
 * Turn a checkReferences result into short, concrete, anxiety-aware sentences for the UI.
 * Never blaming; problems read as next steps, and suggestions as gentle questions.
 * @param {Object} result - a checkReferences result
 * @returns {string[]} one message per situation
 */
export function describeCheckResult(result) {
  if (!result || !result.counts || result.counts.inText === 0) {
    return ['No citations found in this text yet — nothing to check.'];
  }
  const messages = [];
  const missing = result.citedNotListed || [];
  const unused = result.listedNotCited || [];

  if (missing.length === 0) {
    messages.push('Every source you cite is in your reference list — nice work.');
  } else {
    const labels = missing.map(m => {
      let label = entryLabel(m);
      if (m.suggestion && m.suggestion.type === 'year-mismatch') {
        label += ` — your list has ${m.suggestion.family} (${m.suggestion.year}); same source?`;
      } else if (m.suggestion && m.suggestion.type === 'spelling') {
        label += ` — did you mean ${m.suggestion.family}?`;
      }
      return label;
    });
    messages.push(
      missing.length === 1
        ? `1 source you cite isn't in your list yet: ${labels[0]}.`
        : `${missing.length} sources you cite aren't in your list yet: ${labels.join(', ')}.`
    );
  }

  if (unused.length > 0) {
    const labels = unused.map(c => {
      const family =
        parseAuthor((c.authors && c.authors[0]) || '').family || c.title || 'Untitled source';
      return `${family} (${getYear(c)})`;
    });
    messages.push(
      unused.length === 1
        ? `1 source in your list is never cited in the text (markers often check this): ${labels[0]}.`
        : `${unused.length} sources in your list are never cited in the text (markers often check this): ${labels.join(', ')}.`
    );
  }

  return messages;
}

export default { extractInTextCitations, checkReferences, describeCheckResult };
