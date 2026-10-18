/**
 * Shared primitives for all citation styles.
 *
 * Style modules (harvard, apa7, mla9, chicago17) receive an ALREADY-NORMALISED citation
 * (see normalizeCitation in ../citation-types.js): `authors` is always a string[], `type`
 * is canonical, journal fields live on `extra.*`, `siteName` holds the container title.
 *
 * These helpers only provide cross-style building blocks (year, dates, name parsing,
 * italic markers). Author-list grammar differs per style and lives in each style module.
 */

import { extractYear } from '../citation-model.js';
import { isNameSuffix } from '../author-names.js';

/**
 * Resolve the citation's PUBLICATION year, or the style's marker for an undated source, with the
 * year letter the registry assigned when the same author has two works that year in the list
 * being output ("2020a"; undated: "n.d.-a" in APA and Chicago, "no date a" in Harvard).
 *
 * The access date is deliberately NOT a fallback: the day a student happened to open a page is
 * not the year it was published, and every style has its own way of saying "undated" — Harvard
 * (Cite Them Right) "no date", APA 7 and Chicago 17 "n.d.". The access date still appears in the
 * "Available at … (Accessed …)" clause where a style asks for it.
 *
 * @param {Object} citation - normalised citation, possibly carrying the registry's `listMarks`
 * @param {string} [undated='n.d.'] - the calling style's undated marker
 * @param {string} [undatedJoin='-'] - what joins the undated marker to a year letter
 * @returns {string}
 */
export function getYear(citation, undated = 'n.d.', undatedJoin = '-') {
  const letter = yearLetter(citation);
  const year = extractYear(citation.publicationDate);
  if (year) {
    return `${year}${letter}`;
  }
  return letter ? `${undated}${undatedJoin}${letter}` : undated;
}

/**
 * The year letter the registry assigned this citation within the list being output, or ''.
 * Only the registry sets `listMarks` (it overwrites whatever a record carries), so a citation
 * formatted on its own never grows a letter.
 * @param {Object} citation
 * @returns {string}
 */
export function yearLetter(citation) {
  const marks = citation && citation.listMarks;
  return marks && typeof marks.letter === 'string' ? marks.letter : '';
}

/**
 * The works in the list being output whose first author is someone else with this work's
 * first-author surname, as the registry found them (`namesakesOf` in reference-set.js), or [].
 * Each style decides from them how its in-text citation tells the two people apart.
 * @param {Object} citation
 * @returns {Array<{sameInitials: boolean, sameFirstInitial: boolean, sameYear: boolean}>}
 */
export function namesakes(citation) {
  const marks = citation && citation.listMarks;
  return marks && Array.isArray(marks.namesakes) ? marks.namesakes : [];
}

/**
 * Classify a recorded degree ("PhD thesis", "MA dissertation") so each style can print its own
 * descriptor — APA "Doctoral dissertation", MLA "PhD dissertation", Chicago "PhD diss.".
 * Returns '' when the degree is unrecorded or unrecognised, so the caller can fall back to the
 * student's own wording rather than invent a degree they did not claim.
 * @param {string} thesisType
 * @returns {'doctoral'|'masters'|''}
 */
export function degreeKind(thesisType) {
  const t = safe(thesisType).toLowerCase();
  if (/\b(phd|ph\.?d\.?|doctor(al|ate)?|dphil)\b/.test(t)) {
    return 'doctoral';
  }
  if (/\b(ma|m\.a\.?|msc|m\.sc\.?|mphil|mfa|masters?)\b/.test(t)) {
    return 'masters';
  }
  return '';
}

/**
 * Private markers for an italic run. A style module marks italics with these instead of writing
 * <em> itself, so the registry can escape the WHOLE formatted string — every author, title and URL
 * the record carries — and only then turn the markers into real tags. A record can be scraped off a
 * page, so no sink in any style module is trusted with raw metadata: a title carrying markup comes
 * out as the text it claimed to be, and there is nothing to keep in sync per style.
 *
 * Control characters, so they cannot collide with anything a student would type; the registry
 * strips them from the record before formatting, so only `italic` can introduce one.
 */
const ITALIC_OPEN = String.fromCharCode(1);
const ITALIC_CLOSE = String.fromCharCode(2);

/**
 * Mark text as italic for HTML output; plain text passes through unchanged.
 * @param {string} text
 * @param {boolean} html
 * @returns {string}
 */
export function italic(text, html) {
  const value = safe(text);
  if (!value) {
    return '';
  }
  return html ? `${ITALIC_OPEN}${value}${ITALIC_CLOSE}` : value;
}

/**
 * Escape a plain string for use as HTML text. No formatter output ever lands in an attribute, so
 * the three structural characters are the whole job.
 * @param {*} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return safe(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Turn a marked-up reference into HTML: escape everything, then promote the italic markers to <em>.
 * In that order — after escaping there is no way for metadata to become markup.
 * @param {string} marked - a style module's output with `html: true`
 * @returns {string}
 */
export function toReferenceHtml(marked) {
  return escapeHtml(marked).split(ITALIC_OPEN).join('<em>').split(ITALIC_CLOSE).join('</em>');
}

/**
 * Remove the italic markers from every string in a record, so a value that happens to carry one
 * cannot open an <em> of its own. Shape-preserving and pure; returns a copy.
 * @param {*} value - a citation, or any part of one
 * @returns {*}
 */
export function stripItalicMarkers(value) {
  if (typeof value === 'string') {
    return value.split(ITALIC_OPEN).join('').split(ITALIC_CLOSE).join('');
  }
  if (Array.isArray(value)) {
    return value.map(stripItalicMarkers);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = stripItalicMarkers(value[key]);
    }
    return out;
  }
  return value;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The month a word names ("June", "Jun", "Jun.", "Sept") as 1-12, or 0 when the word is not a
 * month. Whole words only: "Marching" and "Mayor" name no month.
 * @param {string} word
 * @returns {number}
 */
function monthNamed(word) {
  const w = word.replace(/\.$/, '').toLowerCase();
  if (w === 'sept') {
    return 9;
  }
  return MONTH_NAMES.findIndex(m => m.toLowerCase() === w || m.slice(0, 3).toLowerCase() === w) + 1;
}

/**
 * True when the browser writes a numeric date month first (03/04/2020 is 4 March in en-US), read
 * from the browser's own date format rather than a list of locales. Day first when it cannot say.
 * @returns {boolean}
 */
function monthFirstLocale() {
  try {
    const language = typeof navigator !== 'undefined' ? navigator.language : undefined;
    const order = new Intl.DateTimeFormat(language)
      .formatToParts(new Date(2020, 11, 31))
      .map(part => part.type)
      .filter(type => type === 'month' || type === 'day');
    return order[0] === 'month';
  } catch {
    return false;
  }
}

/**
 * Day and month from the first two parts of a typed numeric date ("15/01", "01/15", "03/04"). A
 * part above 12 can only be the day; when both could be either, the browser's own order decides.
 * @param {number} a
 * @param {number} b
 * @returns {{month: number, day: number}} both 0 when neither reading is a date
 */
function dayAndMonth(a, b) {
  if (a > 12 && b > 12) {
    return { month: 0, day: 0 };
  }
  if (a > 12) {
    return { day: a, month: b };
  }
  if (b > 12) {
    return { month: a, day: b };
  }
  return monthFirstLocale() ? { month: a, day: b } : { day: a, month: b };
}

/**
 * Break a stored date into display parts, keeping only the precision it was recorded with.
 *
 * Records hold "2020", "2020-03" or "2020-03-04", and a student may type "March 2020",
 * "4 March 2020", "June 5, 2020", "Published June 2020", "15/01/2020" or "06/2020". Handing those
 * to `new Date` turned a bare year into 1 January and a month into its first day — a day the
 * student never claimed — and read an ISO date as UTC midnight, which is the previous day west of
 * Greenwich. So the parts are read straight from the text: `month` and `day` are 0 when the date
 * does not state them, and each style prints only what is there. Nothing is guessed: a date that
 * cannot be read keeps its year alone.
 *
 * @param {string} dateString
 * @returns {{year:number, month:number, day:number, monthLong:string}|null} month 1-12 or 0,
 *   day 1-31 or 0, monthLong '' when the month is unknown; null when there is no year
 */
export function dateParts(dateString) {
  const raw = safe(dateString).trim();
  let year = 0;
  let month = 0;
  let day = 0;

  const yearFirst = raw.match(/^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?(?!\d)/);
  const yearLast = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const monthYear = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
  // "2020 Sep 16" leads with its year but names the month in words.
  if (yearFirst && (yearFirst[2] || !/[A-Za-z]{3,}/.test(raw))) {
    year = Number(yearFirst[1]);
    month = Number(yearFirst[2] || 0);
    day = Number(yearFirst[3] || 0);
  } else if (yearLast) {
    year = Number(yearLast[3]);
    ({ month, day } = dayAndMonth(Number(yearLast[1]), Number(yearLast[2])));
  } else if (monthYear) {
    year = Number(monthYear[2]);
    month = Number(monthYear[1]);
  } else {
    const yearMatch = raw.match(/\b(\d{4})\b/);
    if (!yearMatch) {
      return null;
    }
    year = Number(yearMatch[1]);
    const words = raw.match(/[A-Za-z]+\.?/g) || [];
    month = words.map(monthNamed).find(Boolean) || 0;
    if (month) {
      const dayMatch = raw.replace(yearMatch[0], '').match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
      day = dayMatch ? Number(dayMatch[1]) : 0;
    }
  }

  if (month < 1 || month > 12) {
    month = 0;
  }
  if (!month || day < 1 || day > 31) {
    day = 0;
  }
  return { year, month, day, monthLong: month ? MONTH_NAMES[month - 1] : '' };
}

/**
 * Private marker for an author the record names as an organisation (`extra.organisationAuthors`).
 * The registry puts it in front of such a name before a style sees the record (see
 * `markOrganisations`), so `parseAuthor` — which every style, and the list ordering, reads names
 * through — can hand the whole name back as the family with no given name: "World Health
 * Organization" is never inverted into "Organization, W. H.". A control character, like the
 * italic markers: `normalizeCitation` removes every control character from a record's names, so a
 * record cannot mark itself.
 */
const ORGANISATION = String.fromCharCode(3);

/**
 * True when a name has been marked as an organisation's by `markOrganisations`.
 * @param {string} raw
 * @returns {boolean}
 */
export function isOrganisationAuthor(raw) {
  return typeof raw === 'string' && raw.startsWith(ORGANISATION);
}

/**
 * The citation as the styles read it: each author named in `extra.organisationAuthors` marked as
 * an organisation. Pure; returns a copy. A record without the list keeps its names as they are.
 * @param {Object} citation - normalised citation (so no name already carries the mark)
 * @returns {Object}
 */
export function markOrganisations(citation) {
  const organisations = new Set((citation.extra && citation.extra.organisationAuthors) || []);
  const authors = citation.authors.map(name =>
    organisations.has(name.trim()) ? `${ORGANISATION}${name.trim()}` : name
  );
  return { ...citation, authors };
}

/**
 * Two names for the same body, as a reader would judge it: case, spacing and an initial "The"
 * ignored ("The Royal Society" is the Royal Society).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameBody(a, b) {
  const key = text =>
    safe(text).replace(/\s+/g, ' ').trim().replace(LEADING_ARTICLE, '').toLowerCase();
  return key(a) !== '' && key(a) === key(b);
}

/**
 * True when the work's only author is an organisation that is also the named `body` — its
 * publisher or its site. APA 7 then leaves the repeated publisher or site name out, and MLA 9
 * leaves the author out and names the organisation only as publisher.
 * @param {Object} citation - citation as the styles read it (organisations marked)
 * @param {string} body - the publisher or site name to compare with
 * @returns {boolean}
 */
export function soleOrganisationIs(citation, body) {
  const authors = citation.authors || [];
  return (
    authors.length === 1 &&
    isOrganisationAuthor(authors[0]) &&
    sameBody(parseAuthor(authors[0]).family, body)
  );
}

/**
 * Parse an author token into family + given parts, with any generational suffix ("Jr.", "III")
 * held separately: it is neither name, and read as a family name it yields "Jr., M." — an author
 * no reader could look up. Handles "Family, Given, Jr." and "Given Family Jr.".
 * A single token is treated as the family name with empty given; so is a name marked as an
 * organisation's (see `markOrganisations`), whole, commas and all.
 * @param {string} raw
 * @returns {{family:string, given:string, suffix:string}}
 */
export function parseAuthor(raw) {
  if (isOrganisationAuthor(raw)) {
    return { family: raw.slice(ORGANISATION.length).trim(), given: '', suffix: '' };
  }
  const name = safe(raw).trim();
  if (!name) {
    return { family: '', given: '', suffix: '' };
  }
  if (name.includes(',')) {
    const parts = name.split(',').map(p => p.trim());
    const suffix = parts.length > 1 && isNameSuffix(parts[parts.length - 1]) ? parts.pop() : '';
    const [family, ...rest] = parts;
    return { family, given: rest.join(', '), suffix };
  }
  const words = name.split(/\s+/);
  const suffix = words.length > 1 && isNameSuffix(words[words.length - 1]) ? words.pop() : '';
  if (words.length === 1) {
    return { family: words[0], given: '', suffix };
  }
  const family = words.pop();
  return { family, given: words.join(' '), suffix };
}

/**
 * The authors a style prints when it never says "Anonymous" (Cite Them Right): a work signed
 * Anonymous is treated as having no author, so its title takes the author position.
 * @param {string[]} authors
 * @returns {string[]}
 */
export function withoutAnonymous(authors) {
  return (authors || []).filter(a => !/^anonymous$/i.test(safe(a).trim()));
}

/**
 * The authors MLA 9 prints: "When a work is published by an organization that is also its author,
 * begin the entry with the title, skipping the author element, and list the organization only as
 * publisher" (MLA Handbook, 9th ed., p. 25). A web page's publisher is usually the site itself, so
 * an organisation that is the site's name counts too.
 * @param {Object} citation - citation as the styles read it (organisations marked)
 * @returns {string[]}
 */
export function withoutPublishingOrganisation(citation) {
  const publishes =
    soleOrganisationIs(citation, citation.publisher) ||
    soleOrganisationIs(citation, citation.siteName);
  return publishes ? [] : citation.authors || [];
}

/**
 * Attach a generational suffix to a rendered name. An inverted name takes a comma before it
 * ("King, M.L., Jr."); a natural-order name takes a space ("Sammy Davis Jr").
 * @param {string} name - the rendered name, suffix not yet attached
 * @param {string} suffix
 * @param {{natural?: boolean}} [opts]
 * @returns {string}
 */
export function withSuffix(name, suffix, opts = {}) {
  const s = safe(suffix).trim();
  if (!name || !s) {
    return name;
  }
  return opts.natural === true ? `${name} ${s}` : `${name}, ${s}`;
}

/**
 * Build initials from a given-name string. "John Michael" -> "J.M." (or "J. M." when spaced).
 * @param {string} given
 * @param {{spaced?: boolean}} [opts]
 * @returns {string}
 */
export function initials(given, opts = {}) {
  const spaced = opts.spaced === true;
  const parts = safe(given)
    .split(/[\s.]+/)
    .filter(Boolean);
  const ini = parts.map(p => `${p.charAt(0).toUpperCase()}.`);
  return ini.join(spaced ? ' ' : '');
}

/**
 * Coerce a value to a safe string ('' for null/undefined).
 * @param {*} text
 * @returns {string}
 */
export function safe(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text);
}

/**
 * True when the value is an http(s) URL.
 * @param {string} url
 * @returns {boolean}
 */
export function isHttpUrl(url) {
  return /^https?:\/\//i.test(safe(url));
}

/** @returns {string} "1st", "2nd", "3rd", "4th", "11th", "21st" for a positive integer */
function ordinal(n) {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${n}th`;
  }
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}

/** A word the student may already have closed an edition with: "ed.", "edn", "edition". */
const EDITION_WORD = /\s*\b(?:edition|edn|ed)\.?$/i;

/**
 * An edition as a style prints it, with that style's own abbreviation: "2" becomes "2nd ed."
 * (APA, MLA, Chicago) or "2nd edn." (Cite Them Right). An edition written in words ("Revised",
 * "2nd") keeps the student's wording, and one that already carries an edition word ("2nd ed.",
 * "3rd edition") takes the style's abbreviation instead of a second one. '' when none is recorded.
 * @param {*} edition
 * @param {string} abbreviation - the style's word, "ed." or "edn."
 * @returns {string}
 */
export function editionLabel(edition, abbreviation) {
  const written = safe(edition).trim().replace(EDITION_WORD, '');
  if (!written) {
    return '';
  }
  const label = /^\d+$/.test(written) && Number(written) > 0 ? ordinal(Number(written)) : written;
  return `${label} ${abbreviation}`;
}

/**
 * Words APA 7 (§6.17) keeps lower case inside a title-case title: articles, and conjunctions and
 * prepositions of three letters or fewer. Four-letter words ("With", "From") are capitalised.
 */
const TITLE_MINOR_WORDS = new Set(
  'a an the and as but for if nor or so yet at by in of off on per to up via'.split(' ')
);

/** @returns {string} the word with its first letter capitalised, leading punctuation kept */
function capitalised(word) {
  return word.replace(/\p{L}/u, letter => letter.toUpperCase());
}

/**
 * One word (or hyphenated part) of a title in title case. A word with a capital after its first
 * letter ("NHS", "iPhone") is the student's own and kept as written.
 * @param {string} word
 * @param {boolean} minorAllowed - false for the first and last word and the first after a colon
 * @returns {string}
 */
function titleWord(word, minorAllowed) {
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (/\p{Lu}/u.test(letters.slice(1))) {
    return word;
  }
  if (minorAllowed && TITLE_MINOR_WORDS.has(letters.toLowerCase())) {
    return word.toLowerCase();
  }
  return capitalised(word);
}

/**
 * A title in title case as APA 7 sets it (§6.17), for a title standing in the author position of
 * an in-text citation (§8.14): major words capitalised, minor words lower case unless they are the
 * first or last word or follow a colon, and every major part of a hyphenated compound capitalised
 * ("Text-to-Speech"). Capitals the student typed inside a word are kept: acronyms, "iPhone".
 * @param {string} title
 * @returns {string}
 */
export function titleCase(title) {
  const words = safe(title).split(/(\s+)/);
  const lastWord = words.length - 1;
  let afterColon = true;
  return words
    .map((token, i) => {
      if (/^\s*$/.test(token)) {
        return token;
      }
      const edge = afterColon || i === lastWord;
      afterColon = /[:?!—–]["'”’]?$/.test(token);
      const parts = token.split('-');
      if (parts.length === 1) {
        return titleWord(token, !edge);
      }
      // A hyphenated compound is a major word: its first part is capitalised, and later parts
      // follow the minor-word rule ("Text-to-Speech", "On-Screen").
      return parts
        .map((part, j) => titleWord(part, j > 0 && !(edge && j === parts.length - 1)))
        .join('-');
    })
    .join('');
}

/** A plain numeric page range, "101-120", "101 – 120": the only kind `pageRange` reshapes. */
const NUMERIC_RANGE = /^\s*(\d+)\s*[-–—]\s*(\d+)\s*$/;

/**
 * The fewest trailing digits of `last` (at least `min`) that, written over the end of `first`,
 * give `last` back: 101–120 needs "20", 1608–1774 needs "774".
 * @param {string} first
 * @param {string} last
 * @param {number} min
 * @returns {string}
 */
function changedDigits(first, last, min) {
  for (let n = min; n < last.length; n++) {
    if (first.slice(0, -n) + last.slice(-n) === last) {
      return last.slice(-n);
    }
  }
  return last;
}

/**
 * A page range as a style prints it, always with an en dash. 'full' (APA 7, Cite Them Right) keeps
 * both numbers whole: 101–120. 'mla' (MLA 9) gives the second number in full through 99, and
 * otherwise only its last two digits unless more are needed: 101–20, 1608–774. 'chicago' (CMOS 17
 * §9.61): all digits below 100 and from a multiple of 100 (71–72, 1100–1113); from 101–109 in a
 * hundred, the changed part only (101–8, 808–33); from 110–199, two digits or more as needed
 * (321–28, 1496–500). Anything that is not a plain ascending numeric range ("e12-e19", "xii-xv",
 * "S1-S8") is left exactly as typed.
 * @param {*} pages
 * @param {'full'|'mla'|'chicago'} mode
 * @returns {string}
 */
export function pageRange(pages, mode) {
  const text = safe(pages);
  const m = text.match(NUMERIC_RANGE);
  if (!m || Number(m[2]) <= Number(m[1])) {
    return text;
  }
  const [, first, last] = m;
  const whole = `${first}–${last}`;
  if (mode === 'full' || Number(first) < 100 || first.length !== last.length) {
    return whole;
  }
  if (mode === 'chicago') {
    const inHundred = Number(first) % 100;
    if (inHundred === 0) {
      return whole;
    }
    return `${first}–${changedDigits(first, last, inHundred < 10 ? 1 : 2)}`;
  }
  return `${first}–${changedDigits(first, last, 2)}`;
}

/**
 * Normalise an in-text locator (page number, range, paragraph, chapter, timestamp).
 *
 * Rules:
 *   - trims; empty/absent input → ''
 *   - a bare number ("24") or numeric range ("24-26", "24–26") is a page locator:
 *     with `pageLabels: true` it gains "p. " / "pp. " (dash kept as the user typed it);
 *     otherwise it stays bare (Chicago/MLA convention)
 *   - anything already carrying a label ("p. 24", "para. 2", "chap. 3", "03:12")
 *     passes through verbatim
 *   - never throws
 *
 * @param {*} locator - raw user-supplied locator
 * @param {{pageLabels?: boolean}} [opts]
 * @returns {string}
 */
export function formatLocator(locator, opts = {}) {
  const value = safe(locator).trim();
  if (!value) {
    return '';
  }
  if (opts.pageLabels === true) {
    if (/^\d+$/.test(value)) {
      return `p. ${value}`;
    }
    if (/^\d+\s*[-–—]\s*\d+$/.test(value)) {
      return `pp. ${value}`;
    }
  }
  return value;
}

/**
 * A DOI wherever it sits in the stored value: "10.x/…" after a "doi:", "DOI " or a doi.org link
 * (www., dx. or none). The registrant is not held to four digits, because short test prefixes
 * ("10.1/x") are stored in the wild too; a trailing full stop or comma is sentence punctuation.
 */
const DOI_IN_TEXT = /10\.\d+(?:\.\d+)*\/\S+/;

/**
 * The bare DOI ("10.1037/abc") however it was stored: bare, a "doi:" / "DOI " form or any doi.org
 * URL. Returns '' when the value holds no DOI, so the caller drops the clause entirely rather than
 * print a doi.org link to something that is not one.
 * @param {string} doi
 * @returns {string}
 */
export function bareDoi(doi) {
  const found = safe(doi).match(DOI_IN_TEXT);
  return found ? found[0].replace(/[.,;]+$/, '') : '';
}

/**
 * A DOI as the resolvable link MLA 9 (§5.93), APA 7 and Chicago 17 all ask for. Accepts a bare
 * DOI, a "doi:" form or one already written as a doi.org URL, and never doubles the prefix.
 * Returns '' when there is no DOI, so the caller drops the clause entirely.
 * @param {string} doi
 * @returns {string}
 */
export function doiUrl(doi) {
  const bare = bareDoi(doi);
  return bare ? `https://doi.org/${bare}` : '';
}

/**
 * The link a reader follows to a source: its DOI as https://doi.org/…, which every style prefers
 * when there is one, else its http(s) URL, else ''.
 * @param {Object} citation - normalised citation
 * @returns {string}
 */
export function linkFor(citation) {
  return doiUrl(citation.doi) || (isHttpUrl(citation.url) ? safe(citation.url) : '');
}

/** The platforms a post's address names, for a post saved without a site name. */
const PLATFORM_DOMAINS = [
  ['X', ['x.com', 'twitter.com']],
  ['Facebook', ['facebook.com']],
  ['Instagram', ['instagram.com']],
  ['LinkedIn', ['linkedin.com']],
  ['TikTok', ['tiktok.com']],
];

/**
 * The platform a social-media post is on: the site name the student recorded, else the one its
 * address names ("x.com" and its subdomains, never "netflix.com"), else ''.
 * @param {Object} citation - normalised citation
 * @returns {string}
 */
export function postPlatform(citation) {
  const site = safe(citation.siteName).trim();
  if (site || !isHttpUrl(citation.url)) {
    return site;
  }
  let host;
  try {
    host = new URL(safe(citation.url)).hostname.toLowerCase();
  } catch {
    return '';
  }
  const known = PLATFORM_DOMAINS.find(([, domains]) =>
    domains.some(d => host === d || host.endsWith(`.${d}`))
  );
  return known ? known[0] : '';
}

/**
 * A post's account handle with its "@", "BillGates" and "@BillGates" alike; '' when none.
 * @param {Object} citation - normalised citation
 * @returns {string}
 */
export function postHandle(citation) {
  const handle = safe(citation.extra && citation.extra.handle)
    .trim()
    .replace(/^@+/, '');
  return handle ? `@${handle}` : '';
}

/**
 * Words a short title stops before: prepositions and conjunctions, where one noun phrase ends and
 * the next part of the title begins.
 */
const BREAK_WORDS = new Set(
  (
    'of in on for to at by with from about into onto over under through between among across ' +
    'after before during within without towards toward against beyond since via versus vs and ' +
    'or but nor yet because while'
  ).split(' ')
);

/** Words a short title never ends on: the break words, articles and possessive determiners. */
const DANGLING_WORDS = new Set([
  ...BREAK_WORDS,
  ...'a an the my your his her its our their whose'.split(' '),
]);

/** A main title this many words long or shorter is its own short title; none is longer. */
const SHORT_TITLE_WORDS = 6;

/** @param {string} word @returns {boolean} true when a short title cannot end on it */
function dangles(word) {
  const w = word.toLowerCase().replace(/[,.;:]+$/, '');
  return DANGLING_WORDS.has(w) || /['’]s?$/.test(w);
}

/** An initial article, which every style ignores when it alphabetises a title. */
export const LEADING_ARTICLE = /^(?:a|an|the)\s+/i;

/**
 * The short form of a title for an in-text citation: the main title (before any subtitle), whole
 * when it is six words or fewer. A longer one is cut where a noun phrase ends, before a
 * preposition or conjunction and as late as six words allow, so it never ends on an article,
 * preposition, conjunction or possessive, nor splits the words of a compound: "A history of the
 * teaching of reading in English primary schools" → "A history of the teaching". Nothing is
 * recapitalised; the student's own capitals are kept.
 * @param {string} title
 * @param {{dropArticle?: boolean}} [opts] - MLA begins a short title with the word the title is
 *   alphabetised by, so it drops an initial A/An/The (and capitalises the word that then leads)
 * @returns {string}
 */
export function shortTitle(title, opts = {}) {
  let main = safe(title)
    .trim()
    .split(/:\s|\s[—–-]\s/)[0]
    .trim();
  if (opts.dropArticle === true && LEADING_ARTICLE.test(main) && main.split(/\s+/).length > 1) {
    main = main.replace(LEADING_ARTICLE, '');
    main = main.charAt(0).toUpperCase() + main.slice(1);
  }
  const words = main.split(/\s+/).filter(Boolean);
  let keep = words.length;
  if (words.length > SHORT_TITLE_WORDS) {
    keep = SHORT_TITLE_WORDS;
    for (let i = SHORT_TITLE_WORDS; i >= 1; i--) {
      if (BREAK_WORDS.has(words[i].toLowerCase()) && !dangles(words[i - 1])) {
        keep = i;
        break;
      }
    }
    while (keep > 1 && dangles(words[keep - 1])) {
      keep--;
    }
  }
  return words
    .slice(0, keep)
    .join(' ')
    .replace(/[\s,.;:]+$/, '');
}
