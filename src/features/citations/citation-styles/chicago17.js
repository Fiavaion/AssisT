/**
 * Chicago Manual of Style, 17th edition — Author–Date formatter.
 *
 * Receives an already-normalised citation (authors:string[], canonical type, extra.* journal
 * fields, siteName = container). Each exported function takes `(citation, { html })`; when
 * `html` is true, italicised parts are wrapped in <em> (for the in-popup preview), otherwise
 * plain text (for clipboard / .txt export).
 *
 * Key Chicago 17 author–date rules applied here:
 *   - Reference list: full given name; first author inverted ("Family, Given"), subsequent natural.
 *   - Up to 10 authors listed in full; "and" before last; 11 or more: the first seven, then
 *     "et al." (STYLE-RULES.md marks this one for the owner to confirm against CMOS 17).
 *   - Year follows author block: "Author. Year. …"; same author, same year: 2020a, 2020b
 *     (undated: n.d.-a, n.d.-b, as the CMOS CSL style prints them), assigned by the registry.
 *   - No author: the title moves into the author position: "Title." Year. …
 *   - In-text: (Family Year) — NO comma between name and year, except before n.d.:
 *     (Walsh, n.d.), (Walsh, n.d.-a, 2). Up to three authors named,
 *     "(Smith, Doe, and Lee 2023)"; four or more "(Smith et al. 2023)"; no author, the short
 *     title: ("Short Title" 2023).
 *   - A DOI is https://doi.org/…, the final element, with a full stop.
 *   - A web page with a publication date prints it in full after the site and gives no accessed
 *     date; an accessed date only when the page is undated.
 *   - An edition stored as a number prints as an ordinal, "2nd ed.". A page range takes an en dash
 *     and is shortened as CMOS 17 §9.61 sets it: 71–72, 1100–1113, 101–8, 321–28, 1496–500.
 */

import {
  degreeKind,
  editionLabel,
  getYear,
  italic,
  dateParts,
  parseAuthor,
  withSuffix,
  safe,
  formatLocator,
  doiUrl,
  linkFor,
  pageRange,
  shortTitle,
  initials,
  namesakes,
  postPlatform,
  postHandle,
} from './shared.js';
import { extractYear } from '../citation-model.js';

/** CMOS 17 lists every author up to this many; past it, the first LISTED_BEFORE_ET_AL then et al. */
const MAX_LISTED = 10;
const LISTED_BEFORE_ET_AL = 7;

/** CMOS 17 §14.209 uses up to this many characters of a post as its title. */
const POST_TITLE_CHARACTERS = 160;

/** Types whose title Chicago sets in italics; every other title takes quotation marks. */
const ITALIC_TITLE_TYPES = new Set(['book']);

/** @returns {string} the publication year (lettered), or "n.d." / "n.d.-a" */
function year(citation) {
  return getYear(citation);
}

// ─── Author formatting ────────────────────────────────────────────────────────

/**
 * Full name, first author inverted: "Smith, John Michael"
 * Single-token author (organisation) returned verbatim.
 */
function firstAuthorName(raw) {
  const { family, given, suffix } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return withSuffix(given ? `${family}, ${given}` : family, suffix);
}

/**
 * Full name in natural order for subsequent authors: "Jane Doe"
 * Single-token author returned verbatim.
 */
function naturalName(raw) {
  const { family, given, suffix } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return withSuffix(given ? `${given} ${family}` : family, suffix, { natural: true });
}

/**
 * Reference-list author block (Chicago 17 §15.10), always ending in a full stop:
 *   1     → "Family, Given."
 *   2     → "Family, Given, and Given Family."
 *   3–10  → "Family, Given, Given Family, and Given Family."
 *   11+   → the first seven, then "et al.": "Family, Given, Given Family, …, et al."
 * A post's handle follows the first name in parentheses: "Gates, Bill (@BillGates)."
 * Only called with at least one author: an authorless entry leads with its title (see lead()).
 */
function formatAuthors(authors, handle = '') {
  const first = `${firstAuthorName(authors[0])}${handle ? ` (${handle})` : ''}`;
  const rest = authors
    .slice(1)
    .map(a => naturalName(a))
    .filter(Boolean);
  if (rest.length === 0) {
    return `${first}.`;
  }
  if (authors.length > MAX_LISTED) {
    return `${[first, ...rest.slice(0, LISTED_BEFORE_ET_AL - 1)].join(', ')}, et al.`;
  }
  const last = rest.pop();
  const middle = rest.join(', ');
  if (middle) {
    return `${first}, ${middle}, and ${last}.`;
  }
  return `${first}, and ${last}.`;
}

/**
 * The opening of every entry: "Author. Year. Title." — or, with no author, the title in the
 * author position: "Title." Year.
 * @param {Object} c - normalised citation
 * @param {string} title - the title element as it prints, with its closing full stop
 * @param {string} [handle] - a post's account handle, "@BillGates"
 * @returns {string}
 */
function lead(c, title, handle = '') {
  if (c.authors.length === 0) {
    return `${title} ${year(c)}.`;
  }
  return `${formatAuthors(c.authors, handle)} ${year(c)}. ${title}`;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** "March 4, 2021", "March 2021" or "2021" — as much as was recorded; '' when none. */
function fullDate(dateString) {
  const p = dateParts(dateString);
  if (!p) {
    return '';
  }
  if (p.day) {
    return `${p.monthLong} ${p.day}, ${p.year}`;
  }
  return [p.monthLong, p.year].filter(Boolean).join(' ');
}

/** "Accessed Month Day, Year." or '' when no access date. */
function accessedClause(citation) {
  const d = fullDate(citation.accessDate);
  return d ? `Accessed ${d}. ` : '';
}

// ─── Type-specific formatters ─────────────────────────────────────────────────

/** " https://doi.org/…." / " https://….", the entry's closing location, or ''. */
function linkTail(c) {
  const link = linkFor(c);
  return link ? ` ${link}.` : '';
}

/** A DOI (and only a DOI) closing a print type: a book or chapter found by its DOI. */
function doiTail(c) {
  const doi = doiUrl(c.doi);
  return doi ? ` ${doi}.` : '';
}

/**
 * Web page (CMOS 17 §15.50–15.51, author-date): Author. Year. "Title." Site. Month Day, Year. URL.
 * A publication date is given in full when it has more than the year; an accessed date only when
 * the page has no publication date at all.
 */
function website(c, html) {
  const site = safe(c.siteName);
  const published = dateParts(c.publicationDate);
  let ref = lead(c, `"${safe(c.title)}."`);
  if (site) {
    ref += ` ${italic(site, html)}.`;
  }
  if (published && published.month) {
    ref += ` ${fullDate(c.publicationDate)}.`;
  } else if (!published) {
    ref += ` ${accessedClause(c)}`;
  }
  return `${ref}${linkTail(c)}`;
}

function journal(c, html) {
  const journalName = safe(c.siteName) || 'Journal name unknown';
  const volume = safe(c.extra && c.extra.volume);
  const issue = safe(c.extra && c.extra.issue);
  const pages = pageRange(c.extra && c.extra.pages, 'chicago');

  let ref = `${lead(c, `"${safe(c.title)}."`)} ${italic(journalName, html)}`;
  if (volume) {
    ref += ` ${volume}`;
    if (issue) {
      ref += ` (${issue})`;
    }
  }
  if (pages) {
    ref += `: ${pages}`;
  }
  return `${ref}.${doiTail(c)}`;
}

/**
 * Book (CMOS 17 §15.36, author-date): Author. Year. Title. 2nd ed. Place: Publisher.
 * The edition belongs to the entry — a 2nd edition is a different text from the 1st, so leaving
 * it out sent the reader to pages that do not hold the quoted passage.
 */
function book(c, html) {
  const ex = c.extra || {};
  const label = editionLabel(ex.edition, 'ed.');
  const edition = label ? ` ${label}` : '';
  const place = ex.place ? `${safe(ex.place)}: ` : '';
  const publisher = safe(c.publisher) || 'Publisher unknown';
  return `${lead(c, `${italic(c.title, html)}.`)}${edition} ${place}${publisher}.${doiTail(c)}`;
}

/**
 * Editors of a containing book (CMOS 17 §15.36), natural order:
 * "Ann Smith" / "Ann Smith and Bob Jones" / "Ann Smith, Bob Jones, and Chris Lee".
 * Empty when no editors are recorded, so the caller drops the "edited by" clause.
 * @param {string[]} editors
 * @returns {string}
 */
function editorNames(editors) {
  const list = (editors || []).map(naturalName).filter(Boolean);
  if (list.length === 0) {
    return '';
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]} and ${list[1]}`;
  }
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

/**
 * Chapter in an edited book (CMOS 17 §15.42, author-date):
 * Author. Year. "Chapter Title." In Book Title, edited by Editor Name, 2nd ed., x-y.
 * Place: Publisher.
 */
function chapter(c, html) {
  const ex = c.extra || {};
  const bookTitle = italic(safe(c.siteName) || 'Book title unknown', html);
  const editors = editorNames(ex.editors);

  const parts = [];
  if (editors) {
    parts.push(`edited by ${editors}`);
  }
  const edition = editionLabel(ex.edition, 'ed.');
  if (edition) {
    parts.push(edition);
  }
  if (ex.pages) {
    parts.push(pageRange(ex.pages, 'chicago'));
  }

  let ref = `${lead(c, `"${safe(c.title)}."`)} In ${bookTitle}`;
  if (parts.length) {
    ref += `, ${parts.join(', ')}`;
  }
  const place = ex.place ? `${safe(ex.place)}: ` : '';
  return `${ref}. ${place}${safe(c.publisher) || 'Publisher unknown'}.${doiTail(c)}`;
}

/**
 * Thesis or dissertation (CMOS 17 §15.47, author-date):
 * Author. Year. "Title." PhD diss., Institution. URL.
 */
function thesis(c) {
  const ex = c.extra || {};
  const kind = degreeKind(ex.thesisType);
  let descriptor;
  if (kind === 'doctoral') {
    descriptor = 'PhD diss.';
  } else if (kind === 'masters') {
    descriptor = "Master's thesis";
  } else {
    descriptor = safe(ex.thesisType) || 'Thesis';
  }
  const institution = safe(ex.institution) || safe(c.publisher);
  const tail = institution ? `${descriptor}, ${institution}` : descriptor;
  // A thesis title takes quotation marks, not italics (CMOS 17 §14.215), so this renderer
  // needs no `html` flag. A thesis read online closes on its location, as every other online
  // source here does.
  return `${lead(c, `"${safe(c.title)}."`)} ${tail}.${linkTail(c)}`;
}

function newspaper(c, html) {
  const paper = safe(c.siteName) || 'Newspaper name unknown';
  // A year alone is already printed after the author; the paper takes only a month or a day.
  const p = dateParts(c.publicationDate);
  const date = p && p.month ? fullDate(c.publicationDate) : '';

  let ref = `${lead(c, `"${safe(c.title)}."`)} ${italic(paper, html)}`;
  if (date) {
    ref += `, ${date}`;
  }
  // Chicago sets a page number bare, as it does in a chapter entry.
  const pages = pageRange(c.extra && c.extra.pages, 'chicago');
  if (pages) {
    ref += `, ${pages}`;
  }
  return `${ref}.${linkTail(c)}`;
}

function video(c, html) {
  const site = safe(c.siteName);
  let ref = lead(c, `"${safe(c.title)}."`);
  if (site) {
    ref += ` ${italic(site, html)}.`;
  }
  return `${ref}${linkTail(c)}`;
}

/**
 * A post's title (CMOS 17 §14.209): up to its first 160 characters, cut between words and marked
 * with an ellipsis when the post runs longer.
 * @param {string} text
 * @returns {string}
 */
function postTitle(text) {
  const post = safe(text).trim();
  if (post.length <= POST_TITLE_CHARACTERS) {
    return post;
  }
  let cut = post.slice(0, POST_TITLE_CHARACTERS);
  if (!/\s/.test(post.charAt(POST_TITLE_CHARACTERS))) {
    cut = cut.replace(/\s+\S*$/, '');
  }
  return `${cut.trimEnd()}…`;
}

/**
 * A post, author-date: Name (@handle). Year. "Up to the first 160 characters." Platform, Month
 * Day, Year. URL. The platform is roman, as CMOS 17's own example sets "Twitter".
 */
function social(c) {
  const text = postTitle(c.title);
  const title = /[.?!]$/.test(text) ? `"${text}"` : `"${text}."`;
  const platform = postPlatform(c) || 'Social Media';
  const posted = fullDate(c.publicationDate);
  return `${lead(c, title, postHandle(c))} ${platform}${posted ? `, ${posted}` : ''}.${linkTail(c)}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Tidy output: collapse accidental double periods (e.g. "n.d.." when a date is missing)
 * and guarantee a separating space before a bare URL that follows a closing quote/period.
 * @param {string} s
 * @returns {string}
 */
function tidy(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\.\.+(?=(\s|$|"|”))/g, '.')
    .replace(/(["."”])(https?:\/\/)/g, '$1 $2')
    .trim();
}

/**
 * Chicago 17 author–date in-text citation.
 * Format: (Family Year) — no comma, except before n.d.: (Family, n.d.), ("Short Title," n.d.).
 * With a locator: (Family Year, 24) — page numbers
 * follow a comma with NO "p." (CMOS 17 §15.23); non-numeric locators pass through verbatim.
 * Up to three authors are all named, "(Smith, Doe, and Lee 2023)"; four or more take the first
 * author plus "et al." (CMOS 17 §15.29).
 * @param {Object} citation - normalised citation
 * @param {{locator?: string, html?: boolean}} [options] - locator = page/paragraph/timestamp of
 *   the quote; html marks an italic title for <em>
 * @returns {string}
 */
export function formatInText(citation, options = {}) {
  const dated = year(citation);
  const authors = citation.authors;
  const fam = i => parseAuthor(authors[i]).family || safe(authors[i]);
  const locator = formatLocator(pageRange(options.locator, 'chicago'));
  const suffix = locator ? `, ${locator}` : '';
  const short = shortTitle(citation.title);
  const italicTitle = ITALIC_TITLE_TYPES.has(citation.type);
  // n.d. follows the name after a comma, as the CMOS CSL style prints it: (Walsh, n.d.).
  const undated = !extractYear(citation.publicationDate);

  if (authors.length === 0) {
    if (!short) {
      return `(${dated}${suffix})`;
    }
    if (italicTitle) {
      return `(${italic(short, options.html === true)}${undated ? ',' : ''} ${dated}${suffix})`;
    }
    // A quoted title carries its comma inside the closing quotation mark.
    return `("${short}${undated ? ',' : ''}" ${dated}${suffix})`;
  }
  const others = namesakes(citation);
  // A namesake with other initials: the first author is named with initials, "J. Smith".
  const first = others.some(n => !n.sameInitials) ? initialled(authors[0]) : fam(0);
  let who;
  if (authors.length === 1) {
    who = first;
  } else if (authors.length === 2) {
    who = `${first} and ${fam(1)}`;
  } else if (authors.length === 3) {
    who = `${first}, ${fam(1)}, and ${fam(2)}`;
  } else {
    who = `${first} et al.`;
  }
  // The same initials in the same year: a short title tells the two apart,
  // (Jones, Big Book, 2000) / (Jones, "Little Article," 2000).
  if (short && others.some(n => n.sameInitials && n.sameYear)) {
    const title = italicTitle ? `${italic(short, options.html === true)},` : `"${short},"`;
    return `(${who}, ${title} ${dated}${suffix})`;
  }
  return `(${who}${undated ? ',' : ''} ${dated}${suffix})`;
}

/** @returns {string} an author as the text names them with initials: "J. M. Smith" */
function initialled(raw) {
  const { family, given } = parseAuthor(raw);
  return given ? `${initials(given, { spaced: true })} ${family}` : family || safe(raw);
}

/**
 * Per-type renderer map. Canonical types not listed (website/pdf/other) fall back to `website`,
 * so adding a citation type needs an entry here only when it formats differently.
 */
const RENDERERS = { book, chapter, journal, newspaper, thesis, video, social_media: social };

/**
 * Chicago 17 author–date full reference-list entry.
 * @param {Object} citation - normalised citation
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatReference(citation, options = {}) {
  const html = options.html === true;
  const render = RENDERERS[citation.type] || website;
  return tidy(render(citation, html));
}

export default { formatInText, formatReference };
