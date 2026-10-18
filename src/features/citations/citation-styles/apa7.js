/**
 * APA 7th edition formatter.
 *
 * Receives an already-normalised citation (authors:string[], canonical type, extra.* journal
 * fields, siteName = container) carrying the registry's `listMarks`. Each exported function takes
 * `(citation, { html })`; when `html` is true, italicised parts are marked for <em> (for the
 * previews), otherwise plain text (for clipboard / .txt export).
 *
 * Rules (STYLE-RULES.md, verified 2026-09-26):
 *   - Author format "Family, I. I."; up to 20 listed with an Oxford comma and "&"; 21 or more:
 *     the first 19, an ellipsis, then the last.
 *   - Same author, same year: 2020a, 2020b (undated: n.d.-a) — the registry assigns the letter.
 *   - No author: the title moves into the author position, italic where the title is normally
 *     italic; in text, the short title in title case (§8.14), in quotation marks when the title
 *     is roman.
 *   - An edition stored as a number prints as an ordinal: (2nd ed.). Page ranges take an en dash
 *     and both numbers in full: 101–120.
 *   - A DOI is https://doi.org/…, last, with no full stop after it.
 *   - A different first author with the same surname (§8.20): different initials put the first
 *     author's initials in every in-text citation, whatever the years (J. Smith, 2020); the same
 *     initials keep the standard citation in text and add the given name in square brackets in
 *     the reference list: Smith, J. [Jane].
 *   - A group author is spelled out whole and never inverted; when it is also the publisher or
 *     the site, the publisher or site name is left out.
 *   - A video names its platform after the description; a post gives the account's handle after
 *     the name, its first 20 words as the title, "[Post]" and the platform (apastyle.apa.org
 *     YouTube and X reference examples).
 */

import {
  degreeKind,
  editionLabel,
  getYear,
  italic,
  dateParts,
  parseAuthor,
  initials,
  withSuffix,
  safe,
  formatLocator,
  linkFor,
  pageRange,
  shortTitle,
  titleCase,
  namesakes,
  soleOrganisationIs,
  postHandle,
} from './shared.js';

/** APA 7 uses this many words of a social-media post as its title. */
const POST_TITLE_WORDS = 20;

/** APA 7 names every author up to this many in the reference list. */
const MAX_LISTED = 20;
/** Past MAX_LISTED: this many, then "…", then the last author. */
const LISTED_BEFORE_ELLIPSIS = 19;

/** Types whose title APA sets roman (articles, chapters); every other title is italic. */
const ROMAN_TITLE_TYPES = new Set(['journal', 'newspaper', 'chapter']);

/**
 * Family + spaced initials, APA 7 style: "Smith, J. M." (single token kept verbatim,
 * a generational suffix trailing the initials: "King, M. L., Jr."). With `bracketGiven`, a
 * written-out given name follows in square brackets: "Smith, J. [Jane]".
 * @param {string} raw
 * @param {boolean} [bracketGiven]
 * @returns {string}
 */
function authorName(raw, bracketGiven = false) {
  const { family, given, suffix } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  if (!given) {
    return withSuffix(family, suffix);
  }
  const written = bracketGiven && given.split(/[\s.]+/).some(name => name.length > 1);
  const bracket = written ? ` [${given.trim()}]` : '';
  return withSuffix(`${family}, ${initials(given, { spaced: true })}${bracket}`, suffix);
}

/**
 * True when another person with the first author's surname AND initials is in the list, so the
 * reference entry gives the first author's given name in brackets (APA 7 §9.8).
 * @param {Object} c
 * @returns {boolean}
 */
function sharesInitials(c) {
  return namesakes(c).some(n => n.sameInitials);
}

/**
 * Reference-list author list, a post's account handle after the first name ("Gates, B.
 * [@BillGates]"):
 *   1     → "Smith, J. M."
 *   2     → "Smith, J. M., & Doe, A. B."
 *   3–20  → "Smith, J. M., Doe, A. B., & Lee, C."
 *   21+   → the first 19, "…", the last: "A, A., … Z, Z."
 * @param {string[]} authors
 * @returns {string}
 */
function formatAuthors(authors, bracketFirst = false, handle = '') {
  const list = (authors || [])
    .map((author, i) => authorName(author, bracketFirst && i === 0))
    .filter(Boolean);
  if (handle && list.length > 0) {
    list[0] = `${list[0]} [${handle}]`;
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]}, & ${list[1]}`;
  }
  if (list.length > MAX_LISTED) {
    return `${list.slice(0, LISTED_BEFORE_ELLIPSIS).join(', ')}, … ${list[list.length - 1]}`;
  }
  return `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
}

/** @returns {string} the text, closed with a full stop unless it already ends in one */
function closed(text) {
  return text.endsWith('.') ? text : `${text}.`;
}

/**
 * The opening of every reference: "Author, A. (Year). Title." — or, with no author, the title
 * moved into the author position: "Title. (Year)."
 * @param {Object} c - normalised citation
 * @param {string} title - the title element as it prints (styled, with any bracket description)
 * @param {string} [dated] - the parenthesised date, when it is more than the year
 * @param {string} [handle] - a post's account handle, "@BillGates"
 * @returns {string}
 */
function lead(c, title, dated = getYear(c), handle = '') {
  if (c.authors.length === 0) {
    return `${closed(title)} (${dated}).`;
  }
  const authors = formatAuthors(c.authors, sharesInitials(c), handle);
  return `${closed(authors)} (${dated}). ${closed(title)}`;
}

/**
 * "Month Day" for newspaper dates, e.g. "March 4", or "March" when no day was recorded. Returns ''
 * for a year alone (the year is already printed) or an unparseable date.
 * @param {string} dateString
 * @returns {string}
 */
function monthDay(dateString) {
  const p = dateParts(dateString);
  return p ? [p.monthLong, p.day].filter(Boolean).join(' ') : '';
}

/**
 * In-text citation: (Smith, 2023) / (Smith & Doe, 2023) / (Smith et al., 2023) /
 * ("Article title," 2023) / (Book Title, 2023). With no author the short title stands in: in
 * quotation marks when APA sets the title roman (articles, chapters), in italics otherwise. With a
 * locator: (Smith, 2023, p. 24) — "p." single page, "pp." range (APA 7 §8.13).
 * @param {Object} citation
 * @param {{locator?: string, html?: boolean}} [options] - locator = page/paragraph/timestamp of
 *   the quote; html marks the italic title for <em>
 * @returns {string}
 */
export function formatInText(citation, options = {}) {
  const year = getYear(citation);
  const authors = citation.authors;
  const fam = i => parseAuthor(authors[i]).family || safe(authors[i]);
  const locator = formatLocator(pageRange(options.locator, 'full'), { pageLabels: true });
  const suffix = locator ? `, ${locator}` : '';

  if (authors.length === 0) {
    // APA 7 §8.14: a title in the author position of a citation takes title case, although the
    // reference list keeps it in sentence case.
    const short = titleCase(shortTitle(citation.title));
    if (!short) {
      return `(${year}${suffix})`;
    }
    // A quoted title carries its own comma inside the closing quotation mark.
    return ROMAN_TITLE_TYPES.has(citation.type)
      ? `("${short}," ${year}${suffix})`
      : `(${italic(short, options.html === true)}, ${year}${suffix})`;
  }
  // A namesake with other initials: the first author is named with initials, "J. Smith".
  const first = namesakes(citation).some(n => !n.sameInitials) ? initialled(authors[0]) : fam(0);
  if (authors.length === 1) {
    return `(${first}, ${year}${suffix})`;
  }
  if (authors.length === 2) {
    return `(${first} & ${fam(1)}, ${year}${suffix})`;
  }
  return `(${first} et al., ${year}${suffix})`;
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

/** " https://doi.org/…" / " https://…" — the closing link, never followed by a full stop. */
function linkTail(c) {
  const link = linkFor(c);
  return link ? ` ${link}` : '';
}

/**
 * The date in parentheses, with the month and day where recorded: "2020, June 5" (a web page, a
 * newspaper article, a video or a social-media post, APA 7 §9.14), or the year alone.
 * @param {Object} c
 * @returns {string}
 */
function fullDated(c) {
  const md = monthDay(c.publicationDate);
  return md ? `${getYear(c)}, ${md}` : getYear(c);
}

function website(c, html) {
  // A group author that is also the site is not named twice.
  const site = soleOrganisationIs(c, c.siteName) ? '' : safe(c.siteName);
  return `${lead(c, italic(c.title, html), fullDated(c))}${site ? ` ${site}.` : ''}${linkTail(c)}`;
}

function book(c, html) {
  const label = editionLabel(c.extra && c.extra.edition, 'ed.');
  const edition = label ? ` (${label})` : '';
  const head = lead(c, `${italic(c.title, html)}${edition}`);
  // A group author that is also the publisher is not named twice.
  if (soleOrganisationIs(c, c.publisher)) {
    return `${head}${doiTail(c)}`;
  }
  return `${head} ${safe(c.publisher) || 'Publisher unknown'}.${doiTail(c)}`;
}

/** A DOI (and only a DOI) closing a print type: a book or chapter found by its DOI. */
function doiTail(c) {
  const link = linkFor({ doi: c.doi });
  return link ? ` ${link}` : '';
}

/**
 * Editor name in APA's reference-list form for a container's editors: "A. B. Smith"
 * (initials first, natural order — the reverse of an author entry).
 * @param {string} raw
 * @returns {string}
 */
function editorName(raw) {
  const { family, given, suffix } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return withSuffix(given ? `${initials(given, { spaced: true })} ${family}` : family, suffix, {
    natural: true,
  });
}

/**
 * "A. Smith (Ed.)" / "A. Smith & B. Jones (Eds.)" / "A. Smith, B. Jones, & C. Lee (Eds.)".
 * Empty when no editors are recorded, so the caller drops the whole clause.
 * @param {string[]} editors
 * @returns {string}
 */
function editorClause(editors) {
  const list = (editors || []).map(editorName).filter(Boolean);
  if (list.length === 0) {
    return '';
  }
  let joined;
  if (list.length === 1) {
    joined = list[0];
  } else if (list.length === 2) {
    joined = `${list[0]} & ${list[1]}`;
  } else {
    joined = `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
  }
  return `${joined} (${list.length === 1 ? 'Ed.' : 'Eds.'})`;
}

/**
 * Chapter in an edited book (APA 7 §10.3):
 * Author, A. A. (Year). Chapter title. In E. E. Editor (Ed.), Book title (2nd ed., pp. x-y).
 * Publisher.
 */
function chapter(c, html) {
  const ex = c.extra || {};
  const editors = editorClause(ex.editors);
  const bookTitle = safe(c.siteName) || 'Book title unknown';

  const inner = [];
  const edition = editionLabel(ex.edition, 'ed.');
  if (edition) {
    inner.push(edition);
  }
  if (ex.pages) {
    inner.push(`pp. ${pageRange(ex.pages, 'full')}`);
  }
  const parenthetical = inner.length ? ` (${inner.join(', ')})` : '';

  let ref = `${lead(c, safe(c.title))} In `;
  if (editors) {
    ref += `${editors}, `;
  }
  ref += `${italic(bookTitle, html)}${parenthetical}.`;
  return `${ref} ${safe(c.publisher) || 'Publisher unknown'}.${doiTail(c)}`;
}

/**
 * Thesis or dissertation (APA 7 §10.6). A thesis a reader can reach is the PUBLISHED form —
 * "[Doctoral dissertation, Institution]. Repository. URL" — and one with no link is the
 * unpublished form, where the descriptor says so and the institution follows the brackets:
 * "[Unpublished doctoral dissertation]. Institution."
 */
function thesis(c, html) {
  const ex = c.extra || {};
  const kind = degreeKind(ex.thesisType);
  let descriptor;
  if (kind === 'doctoral') {
    descriptor = 'Doctoral dissertation';
  } else if (kind === 'masters') {
    descriptor = "Master's thesis";
  } else {
    descriptor = safe(ex.thesisType) || 'Thesis';
  }
  const institution = safe(ex.institution) || safe(c.publisher);
  const link = linkFor(c);
  const title = italic(c.title, html);

  if (!link) {
    // "Unpublished doctoral dissertation" — the descriptor keeps its own wording, lower-cased
    // after "Unpublished" as APA sets it.
    const unpublished = `Unpublished ${descriptor.charAt(0).toLowerCase()}${descriptor.slice(1)}`;
    const head = lead(c, `${title} [${unpublished}]`);
    return institution ? `${head} ${institution}.` : head;
  }

  const bracket = institution ? `${descriptor}, ${institution}` : descriptor;
  // The wizard has no repository box; the site name is where a student types "NCAD Research Repository".
  const repoName = safe(ex.repository) || safe(c.siteName);
  const repository = repoName ? ` ${repoName}.` : '';
  return `${lead(c, `${title} [${bracket}]`)}${repository} ${link}`;
}

function journal(c, html) {
  const journalName = safe(c.siteName) || 'Journal name unknown';
  const volume = safe(c.extra && c.extra.volume);
  const issue = safe(c.extra && c.extra.issue);
  const pages = pageRange(c.extra && c.extra.pages, 'full');

  let ref = `${lead(c, safe(c.title))} ${italic(journalName, html)}`;
  if (volume) {
    ref += `, ${italic(volume, html)}`;
    if (issue) {
      ref += `(${issue})`;
    }
  }
  if (pages) {
    ref += `, ${pages}`;
  }
  return `${ref}.${doiTail(c)}`;
}

function newspaper(c, html) {
  const paper = safe(c.siteName) || 'Newspaper name unknown';
  // A print edition carries a page number; APA sets it after the newspaper's own title.
  const pages = formatLocator(pageRange(c.extra && c.extra.pages, 'full'), { pageLabels: true });
  const pageSuffix = pages ? `, ${pages}` : '';
  return `${lead(c, safe(c.title), fullDated(c))} ${italic(paper, html)}${pageSuffix}.${linkTail(c)}`;
}

/** " YouTube." — the platform or site a video or post is on, or ''. */
function platform(c) {
  const site = safe(c.siteName).trim();
  return site ? ` ${closed(site)}` : '';
}

function video(c, html) {
  return `${lead(c, `${italic(c.title, html)} [Video]`, fullDated(c))}${platform(c)}${linkTail(c)}`;
}

/** A post's title: its first 20 words, as written. */
function postTitle(text) {
  return safe(text).trim().split(/\s+/).slice(0, POST_TITLE_WORDS).join(' ');
}

function social(c, html) {
  const title = `${italic(postTitle(c.title), html)} [Post]`;
  return `${lead(c, title, fullDated(c), postHandle(c))}${platform(c)}${linkTail(c)}`;
}

export default { formatInText, formatReference };
