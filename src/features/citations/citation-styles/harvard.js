/**
 * Harvard — Cite Them Right (13th edition) formatter.
 *
 * Receives an already-normalised citation (authors:string[], canonical type, extra.* journal
 * fields, siteName = container) carrying the registry's `listMarks`. Each exported function takes
 * `(citation, { html })`; when `html` is true, italicised parts are marked for <em> (for the
 * previews), otherwise plain text (for clipboard / .txt export).
 *
 * Rules (STYLE-RULES.md, verified 2026-09-26):
 *   - All authors are listed; "et al." only when there are more than ten.
 *   - Same author, same year: 2020a, 2020b (undated: "no date a") — the registry assigns them.
 *   - No author: the italic title moves into the author position. Cite Them Right does not use
 *     "Anonymous", so an author recorded as Anonymous is treated as no author.
 *   - Undated: "no date", never "n.d.".
 *   - A DOI is given as "Available at: https://doi.org/…" with no accessed date; a URL without a
 *     DOI keeps its "(Accessed: …)".
 *   - A different first author with the same surname and a work in the same year: initials after
 *     the surname in text, (Smith, J., 2020). The same initials too: the full given name, in the
 *     list (Smith, John (2020)) and in text (John Smith, 2020), as the CTR CSL style prints it.
 *   - An edition stored as a number prints as an ordinal, "2nd edn."; editors are "(ed.)" and
 *     "(eds)"; page ranges take an en dash with both numbers in full, "pp. 101–120".
 *   - A social-media post: the handle after the name, the whole post in single quotation marks,
 *     the platform in square brackets, then the day posted.
 */

import {
  editionLabel,
  getYear,
  italic,
  dateParts,
  parseAuthor,
  initials,
  withSuffix,
  safe,
  isHttpUrl,
  formatLocator,
  doiUrl,
  pageRange,
  shortTitle,
  withoutAnonymous,
  namesakes,
  postPlatform,
  postHandle,
} from './shared.js';

/** Cite Them Right spells an undated source out in full: "(no date)", never "n.d.". */
const UNDATED = 'no date';

/** Cite Them Right lists every author up to this many; past it, the first author and et al. */
const MAX_LISTED = 10;

/** @param {Object} citation @returns {string} publication year (lettered), or "no date" */
function pubYear(citation) {
  return getYear(citation, UNDATED, ' ');
}

/**
 * The authors Cite Them Right prints: a work signed "Anonymous" is cited by its title instead.
 * @param {Object} citation
 * @returns {string[]}
 */
function authorsOf(citation) {
  return withoutAnonymous(citation.authors);
}

/**
 * Family + closed-up initials, Harvard style: "Smith, J.M." (single token kept verbatim,
 * a generational suffix trailing the initials: "King, M.L., Jr.").
 */
function authorName(raw) {
  const { family, given, suffix } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return withSuffix(given ? `${family}, ${initials(given)}` : family, suffix);
}

/** "Smith, John": family and the whole given name, for a first author who needs telling apart. */
function givenName(raw) {
  const { family, given, suffix } = parseAuthor(raw);
  return given ? withSuffix(`${family}, ${given.trim()}`, suffix) : authorName(raw);
}

/**
 * True when someone else with the first author's surname AND initials has a work in the same year:
 * initials cannot tell the two apart, so the first author's given name is written out.
 * @param {Object} citation
 * @returns {boolean}
 */
function namedInFull(citation) {
  return namesakes(citation).some(n => n.sameYear && n.sameInitials);
}

/**
 * Reference-list author list: "A, B. and C, D." / "A, B., C, D. and E, F." / "A, B. et al.".
 * With `fullFirst`, the first author's given name is written out: "Smith, John".
 */
function formatAuthors(authors, fullFirst = false) {
  const list = (authors || [])
    .map((author, i) => (fullFirst && i === 0 ? givenName(author) : authorName(author)))
    .filter(Boolean);
  if (list.length === 1) {
    return list[0];
  }
  if (list.length > MAX_LISTED) {
    return `${list[0]} et al.`;
  }
  if (list.length === 2) {
    return `${list[0]} and ${list[1]}`;
  }
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** "24 November 2025", "November 2025" or "2025" — as much as was recorded; '' when none. */
function longDate(dateString) {
  const p = dateParts(dateString);
  return p ? [p.day, p.monthLong, p.year].filter(Boolean).join(' ') : '';
}

/**
 * "24 November" or "November" after a newspaper's name; '' for a year alone, which the entry
 * already gives after the author.
 */
function dayMonth(dateString) {
  const p = dateParts(dateString);
  return p ? [p.day, p.monthLong].filter(Boolean).join(' ') : '';
}

/** " (Accessed: 24 November 2025)" or "" when no access date. */
function accessedClause(citation) {
  const accessed = longDate(citation.accessDate);
  return accessed ? ` (Accessed: ${accessed})` : '';
}

/**
 * The clause Cite Them Right closes an online source with. A DOI: " Available at:
 * https://doi.org/…." with no accessed date, since a DOI does not move. A URL without one:
 * " Available at: https://… (Accessed: …)." And NOTHING when there is no link to give — a source
 * saved without a URL used to print "Available at:  (Accessed: 3 May 2026).", an empty promise
 * that the marker could follow a link the student never had.
 * @param {Object} citation
 * @returns {string}
 */
function onlineClause(citation) {
  const doi = doiUrl(citation.doi);
  if (doi) {
    return ` Available at: ${doi}.`;
  }
  if (!isHttpUrl(citation.url)) {
    return '';
  }
  return ` Available at: ${safe(citation.url)}${accessedClause(citation)}.`;
}

/** The DOI clause alone, for print types (a book or chapter found by its DOI). */
function doiClause(citation) {
  const doi = doiUrl(citation.doi);
  return doi ? ` Available at: ${doi}.` : '';
}

/**
 * Assemble a reference. With authors: "Author (Year) <title element><rest>". With none, the
 * italic title takes the author position: "Title [descriptor] (Year)<rest>", closed with a full
 * stop when nothing follows.
 * @param {Object} c - normalised citation
 * @param {boolean} html
 * @param {{titled: string, rest: string, descriptor?: string}} parts - `titled` is the title
 *   element as it follows the date in an authored entry
 * @returns {string}
 */
function assemble(c, html, { titled, rest, descriptor = '' }) {
  const authors = authorsOf(c);
  if (authors.length > 0) {
    return `${formatAuthors(authors, namedInFull(c))} (${pubYear(c)}) ${titled}${rest}`;
  }
  const ref = `${italic(c.title, html)}${descriptor} (${pubYear(c)})${rest}`;
  return ref.endsWith('.') ? ref : `${ref}.`;
}

/**
 * In-text citation: (Smith, 2023) / (Smith and Doe, 2023) / (Smith, Doe and Lee, 2023) /
 * (Smith et al., 2023) from four authors / (Short title, 2023) with no author, the title in
 * italics as it leads the reference. With a locator: (Smith, 2023, p. 24) — "p." single page,
 * "pp." range (Cite Them Right).
 * @param {Object} citation
 * @param {{locator?: string, html?: boolean}} [options] - locator = page/paragraph/timestamp of
 *   the quote; html marks the italic title for <em>
 * @returns {string}
 */
export function formatInText(citation, options = {}) {
  const year = pubYear(citation);
  const authors = authorsOf(citation);
  const fam = i => parseAuthor(authors[i]).family || safe(authors[i]);
  const locator = formatLocator(pageRange(options.locator, 'full'), { pageLabels: true });
  const suffix = locator ? `, ${locator}` : '';

  if (authors.length === 0) {
    const title = italic(shortTitle(citation.title), options.html === true);
    return title ? `(${title}, ${year}${suffix})` : `(${year}${suffix})`;
  }
  // Someone else with the same surname and a work in the same year: the first author's initials
  // follow the surname, (Williams, A., 2009); with the same initials as well, the given name
  // leads, (John Smith, 2021).
  let first = fam(0);
  if (namedInFull(citation)) {
    const { family, given } = parseAuthor(authors[0]);
    first = `${given.trim()} ${family}`;
  } else if (namesakes(citation).some(n => n.sameYear && !n.sameInitials)) {
    first = authorName(authors[0]);
  }
  if (authors.length === 1) {
    return `(${first}, ${year}${suffix})`;
  }
  if (authors.length === 2) {
    return `(${first} and ${fam(1)}, ${year}${suffix})`;
  }
  // Cite Them Right names up to three authors in the text, and shortens to et al. from four.
  if (authors.length === 3) {
    return `(${first}, ${fam(1)} and ${fam(2)}, ${year}${suffix})`;
  }
  return `(${first} et al., ${year}${suffix})`;
}

/**
 * Per-type renderer map. Canonical types not listed (website/pdf/other) fall back to `website`,
 * so adding a citation type needs an entry here only when it formats differently.
 */
const RENDERERS = { book, chapter, journal, newspaper, thesis, video, social_media: social };

/**
 * Full reference-list entry.
 * @param {Object} citation - normalised citation
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatReference(citation, options = {}) {
  const html = options.html === true;
  const render = RENDERERS[citation.type] || website;
  return render(citation, html);
}

function website(c, html) {
  return assemble(c, html, { titled: `${italic(c.title, html)}.`, rest: onlineClause(c) });
}

function book(c, html) {
  const label = editionLabel(c.extra && c.extra.edition, 'edn.');
  const edition = label ? ` ${label}` : '';
  const place = c.extra && c.extra.place ? `${c.extra.place}: ` : '';
  const publisher = safe(c.publisher) || 'Publisher unknown';
  return assemble(c, html, {
    titled: `${italic(c.title, html)}.`,
    rest: `${edition} ${place}${publisher}.${doiClause(c)}`,
  });
}

/**
 * Editors of a containing book: "Smith, A. (ed.)" / "Smith, A. and Jones, B. (eds)" — Cite Them
 * Right closes "ed." with a full stop and "eds" without one, as it contracts rather than cuts it.
 * Empty when no editors are recorded, so the caller drops the whole clause.
 * @param {string[]} editors
 * @returns {string}
 */
function editorClause(editors) {
  const list = (editors || []).map(authorName).filter(Boolean);
  if (list.length === 0) {
    return '';
  }
  let joined;
  if (list.length === 1) {
    joined = list[0];
  } else if (list.length === 2) {
    joined = `${list[0]} and ${list[1]}`;
  } else {
    joined = `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  }
  return `${joined} (${list.length === 1 ? 'ed.' : 'eds'})`;
}

/**
 * Chapter in an edited book:
 * Author, A. (Year) 'Chapter title', in Editor, E. (ed.) Book title. Edition. Place: Publisher,
 * pp. x-y.
 */
function chapter(c, html) {
  const ex = c.extra || {};
  const editors = editorClause(ex.editors);
  const bookTitle = safe(c.siteName) || 'Book title unknown';

  let rest = ` in ${editors ? `${editors} ` : ''}${italic(bookTitle, html)}.`;
  const edition = editionLabel(ex.edition, 'edn.');
  if (edition) {
    rest += ` ${edition}`;
  }
  const place = ex.place ? `${safe(ex.place)}: ` : '';
  rest += ` ${place}${safe(c.publisher) || 'Publisher unknown'}`;
  if (ex.pages) {
    rest += `, pp. ${pageRange(ex.pages, 'full')}`;
  }
  return assemble(c, html, { titled: `'${safe(c.title)}',`, rest: `${rest}.${doiClause(c)}` });
}

/**
 * Thesis or dissertation: Author, A. (Year) Title. PhD thesis. Institution.
 * The degree is printed as the student recorded it ("PhD thesis", "MA dissertation"), which is
 * what Cite Them Right asks for; an unrecorded degree degrades to the neutral "Thesis".
 * A thesis read online closes with the same "Available at: …" clause as any other online source,
 * so the marker can follow the link.
 */
function thesis(c, html) {
  const ex = c.extra || {};
  const institution = safe(ex.institution) || safe(c.publisher);
  const rest = ` ${safe(ex.thesisType) || 'Thesis'}.${institution ? ` ${institution}.` : ''}`;
  return assemble(c, html, {
    titled: `${italic(c.title, html)}.`,
    rest: `${rest}${onlineClause(c)}`,
  });
}

function journal(c, html) {
  const journalName = safe(c.siteName) || 'Journal name unknown';
  const volume = safe(c.extra && c.extra.volume);
  const issue = safe(c.extra && c.extra.issue);
  const pages = pageRange(c.extra && c.extra.pages, 'full');

  let rest = ` ${italic(journalName, html)}`;
  if (volume) {
    rest += `, ${volume}`;
    if (issue) {
      rest += `(${issue})`;
    }
  }
  if (pages) {
    rest += `, pp. ${pages}`;
  }
  return assemble(c, html, { titled: `'${safe(c.title)}',`, rest: `${rest}.${onlineClause(c)}` });
}

function newspaper(c, html) {
  const paper = safe(c.siteName) || 'Newspaper name unknown';
  const date = dayMonth(c.publicationDate);
  const pages = formatLocator(pageRange(c.extra && c.extra.pages, 'full'), { pageLabels: true });
  let rest = ` ${italic(paper, html)}`;
  if (date) {
    rest += `, ${date}`;
  }
  if (pages) {
    rest += `, ${pages}`;
  }
  return assemble(c, html, { titled: `'${safe(c.title)}',`, rest: `${rest}.${onlineClause(c)}` });
}

function video(c, html) {
  return assemble(c, html, {
    titled: `${italic(c.title, html)} [Video].`,
    rest: onlineClause(c),
    descriptor: ' [Video]',
  });
}

/**
 * A post (Cite Them Right 13th): Author [@handle] (Year) 'Text of post' [Platform] Day Month.
 * Available at: URL (Accessed: date). The text is quoted whole, as the post wrote it; the platform
 * is the recorded site name. With no author the quoted text leads.
 */
function social(c) {
  const text = safe(c.title).trim();
  const post = text ? `'${text}' ` : '';
  const platform = `[${postPlatform(c) || 'Social media'}]`;
  const posted = dayMonth(c.publicationDate);
  const rest = `${posted ? ` ${posted}` : ''}.${onlineClause(c)}`;
  const authors = authorsOf(c);
  if (authors.length === 0) {
    return `${post}${platform} (${pubYear(c)})${rest}`;
  }
  const handle = postHandle(c);
  const who = `${formatAuthors(authors, namedInFull(c))}${handle ? ` [${handle}]` : ''}`;
  return `${who} (${pubYear(c)}) ${post}${platform}${rest}`;
}

export default { formatInText, formatReference };
