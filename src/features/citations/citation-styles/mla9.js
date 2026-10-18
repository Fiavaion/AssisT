/**
 * MLA 9th Edition formatter.
 *
 * Receives an already-normalised citation (authors:string[], canonical type, extra.* journal
 * fields, siteName = container) carrying the registry's `listMarks`. Each exported function takes
 * `(citation, { html })`; when `html` is true, italicised parts are marked for <em> (for the
 * previews), otherwise plain text (for clipboard / .txt export).
 *
 * Key MLA 9 conventions (STYLE-RULES.md, verified 2026-09-26):
 *  - Author order: "Family, Given." for first; "Given Family" (natural order) for second.
 *  - Three or more authors: first author + "et al."
 *  - No year letters. Two works by one author in the list: the in-text citation names the work
 *    with a short title — (Morrison, Beloved 27) — and in the works-cited list the second and
 *    later entries open with "---." (the registry sets `repeatsAuthor`).
 *  - No author: the entry starts with the title; the in-text citation uses the short title.
 *  - An organisation that is both author and publisher: no author; the entry starts with the title
 *    and the organisation is named only as publisher (MLA Handbook, 9th ed., p. 25).
 *  - No date: no placeholder at all; a web source keeps its access date.
 *  - Titles of short works (articles, posts, pages) in quotation marks; books, theses and
 *    containers (journals, sites, platforms) in italics.
 *  - A DOI is https://doi.org/…, the final element, with a full stop. The location (DOI or URL) is
 *    the last element of its container, so it follows the page range after a comma: "pp. 101–20,
 *    https://doi.org/…." (MLA 9 core-elements template).
 *  - An edition stored as a number prints as an ordinal, "2nd ed.". A page range takes an en dash
 *    and the second number in full through 99, else its last two digits unless more are needed:
 *    21–48, 101–20, 1608–774 (MLA 9 number ranges).
 *  - Abbreviated months follow MLA style (Jan., Feb., Mar., Apr., May, June, July,
 *    Aug., Sept., Oct., Nov., Dec.).
 */

import {
  degreeKind,
  editionLabel,
  italic,
  dateParts,
  parseAuthor,
  withSuffix,
  safe,
  formatLocator,
  linkFor,
  doiUrl,
  pageRange,
  shortTitle,
  namesakes,
  withoutPublishingOrganisation,
  soleOrganisationIs,
  postPlatform,
  postHandle,
} from './shared.js';
import { extractYear } from '../citation-model.js';

// MLA abbreviated months
// Index 0 = January … 11 = December
const MLA_MONTHS = [
  'Jan.',
  'Feb.',
  'Mar.',
  'Apr.',
  'May',
  'June',
  'July',
  'Aug.',
  'Sept.',
  'Oct.',
  'Nov.',
  'Dec.',
];

/** Types whose title MLA sets in italics (a work that stands on its own); the rest are quoted. */
const ITALIC_TITLE_TYPES = new Set(['book', 'thesis']);

/**
 * Format a date as "Day Mon. Year" (MLA style), e.g. "4 Mar. 2021", "Mar. 2021" or "2021" —
 * as much as was recorded. Returns '' when dateString is unparseable.
 * @param {string} dateString
 * @returns {string}
 */
function mlaDate(dateString) {
  const p = dateParts(dateString);
  if (!p) {
    return '';
  }
  return [p.day, p.month ? MLA_MONTHS[p.month - 1] : '', p.year].filter(Boolean).join(' ');
}

/** @returns {string} the publication year, or '' — MLA prints no placeholder for an undated work */
function mlaYear(citation) {
  return extractYear(citation.publicationDate);
}

/**
 * The authors MLA prints: none when the only author is the organisation that also published the
 * work (see `withoutPublishingOrganisation`).
 * @param {Object} c
 * @returns {string[]}
 */
function authorsOf(c) {
  return withoutPublishingOrganisation(c);
}

/**
 * The publisher element of a web source, " Publisher,", given only when the organisation left out
 * of the author position is named nowhere else: a page on the WHO's own site already names it as
 * the site. MLA omits a web page's publisher otherwise, as this formatter always has.
 * @param {Object} c
 * @returns {string}
 */
function publishingOrganisation(c) {
  const dropped = c.authors.length > 0 && authorsOf(c).length === 0;
  if (!dropped || soleOrganisationIs(c, c.siteName)) {
    return '';
  }
  return ` ${safe(c.publisher)},`;
}

/**
 * First author in inverted form: "Family, Given" (full given name, not initials).
 * A single-token name (organisation) is returned verbatim.
 * @param {string} raw
 * @returns {string}
 */
function firstAuthor(raw) {
  const { family, given, suffix } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return withSuffix(given ? `${family}, ${given}` : family, suffix);
}

/**
 * Second (and subsequent in 2-author case) author in natural order: "Given Family".
 * A single-token name is returned verbatim.
 * @param {string} raw
 * @returns {string}
 */
function naturalAuthor(raw) {
  const { family, given, suffix } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return withSuffix(given ? `${given} ${family}` : family, suffix, { natural: true });
}

/**
 * The entry's opening author block, with the space that follows it:
 *   1 author : "Family, Given. "
 *   2 authors: "Family, Given, and Given Family. "
 *   3+       : "Family, Given, et al. "
 *   repeated : "---. " (the same author as the entry above, in a works-cited list)
 *   none     : '' — the entry starts with the title
 * @param {Object} c - normalised citation
 * @param {string} [handle] - a post's handle as it follows the first name, " [@handle]"
 * @returns {string}
 */
function authorBlock(c, handle = '') {
  const list = authorsOf(c);
  if (list.length === 0) {
    return '';
  }
  if (c.listMarks && c.listMarks.repeatsAuthor) {
    return '---. ';
  }
  const first = `${firstAuthor(list[0])}${handle}`;
  if (list.length === 1) {
    return `${endEntry(first)} `;
  }
  if (list.length === 2) {
    return `${endEntry(`${first}, and ${naturalAuthor(list[1])}`)} `;
  }
  return `${first}, et al. `;
}

/**
 * Close an entry with a period unless it already ends in one — MLA never prints "..".
 * @param {string} text
 * @returns {string}
 */
function endEntry(text) {
  return text.endsWith('.') ? text : `${text}.`;
}

/**
 * "Accessed Day Mon. Year." clause, or '' when no accessDate.
 * @param {Object} citation
 * @returns {string}
 */
function accessedClause(citation) {
  const d = mlaDate(citation.accessDate);
  return d ? ` Accessed ${d}.` : '';
}

/**
 * The short title as MLA names a work in text: in the work's own styling, beginning with the
 * word it is alphabetised by — Beloved (italic), "Education Reform".
 * @param {Object} c
 * @param {boolean} html
 * @returns {string}
 */
function titleInText(c, html) {
  const short = shortTitle(c.title, { dropArticle: true });
  if (!short) {
    return '';
  }
  return ITALIC_TITLE_TYPES.has(c.type) ? italic(short, html) : `"${short}"`;
}

/**
 * The first author as the text names them. Beside someone else with the same last name in the
 * works-cited list, MLA adds the first initial, or the full first name when the initials also
 * match (MLA Handbook, 9th ed., p. 55): (J. Smith 45), (Jane Smith 45).
 * @param {Object} c - normalised citation with at least one author
 * @returns {string}
 */
function firstInText(c) {
  const [lead] = authorsOf(c);
  const { family, given } = parseAuthor(lead);
  const others = namesakes(c);
  if (!family || !given || others.length === 0) {
    return family || safe(lead);
  }
  if (others.some(n => n.sameFirstInitial)) {
    return `${given.trim()} ${family}`;
  }
  return `${given.trim().charAt(0).toUpperCase()}. ${family}`;
}

/**
 * MLA in-text citation: (Family) / (Family and Family) / (Family et al.), with a short title when
 * the list holds more than one work by the author — (Morrison, Beloved 27) — and the short title
 * alone when there is no author: ("Mystery Page" 4).
 * The page is the quote's own locator, rendered MLA-style: bare number(s), no "p.", no year —
 * (Smith 24). Without one there is no page: an article's page range says where the article is,
 * not where the words cited are.
 * @param {Object} citation - normalised citation
 * @param {{locator?: string, html?: boolean}} [options] - locator = page/paragraph/timestamp of
 *   the quote; html marks an italic title for <em>
 * @returns {string}
 */
export function formatInText(citation, options = {}) {
  const html = options.html === true;
  const authors = authorsOf(citation);
  const fam = i => parseAuthor(authors[i]).family || safe(authors[i]);
  const pages = formatLocator(pageRange(options.locator, 'mla'));
  const suffix = pages ? ` ${pages}` : '';

  if (authors.length === 0) {
    return `(${[titleInText(citation, html), pages].filter(Boolean).join(' ')})`;
  }
  let who;
  const first = firstInText(citation);
  if (authors.length === 1) {
    who = first;
  } else if (authors.length === 2) {
    who = `${first} and ${fam(1)}`;
  } else {
    who = `${first} et al.`;
  }
  const namesWork = citation.listMarks && citation.listMarks.namesWork;
  return namesWork ? `(${who}, ${titleInText(citation, html)}${suffix})` : `(${who}${suffix})`;
}

/** " https://doi.org/…." / " https://….", the entry's closing location, or ''. */
function linkTail(c) {
  const link = linkFor(c);
  return link ? ` ${link}.` : '';
}

function website(c, html) {
  const title = `"${safe(c.title)}."`;
  const site = safe(c.siteName);
  const siteSegment = site ? ` ${italic(site, html)},` : '';
  const pubDate = mlaDate(c.publicationDate);
  const dateSegment = pubDate ? ` ${pubDate},` : '';
  const ref = `${authorBlock(c)}${title}${siteSegment}${publishingOrganisation(c)}${dateSegment}${linkTail(c)}`;
  return `${ref.replace(/,$/, '.')}${accessedClause(c)}`;
}

/**
 * Book (MLA 9 §5.30): Author. Title. Edition, Publisher, Year, DOI.
 * The edition is part of the entry — dropping it cited the wrong text, since a 2nd edition is
 * paginated differently from the 1st.
 */
function book(c, html) {
  const ex = c.extra || {};
  const parts = [];
  const edition = editionLabel(ex.edition, 'ed.');
  if (edition) {
    parts.push(edition);
  }
  if (safe(c.publisher)) {
    parts.push(safe(c.publisher));
  }
  if (mlaYear(c)) {
    parts.push(mlaYear(c));
  }
  // A DOI (and only a DOI) closes a print type found by it, as the container's location.
  if (doiUrl(c.doi)) {
    parts.push(doiUrl(c.doi));
  }
  const title = endEntry(italic(c.title, html) || '');
  const ref = parts.length ? `${title} ${endEntry(parts.join(', '))}` : title;
  return `${authorBlock(c)}${ref}`;
}

/**
 * Editors of a containing book, in MLA's natural order:
 * "Ann Smith" / "Ann Smith and Bob Jones" / "Ann Smith et al." (three or more).
 * Empty when no editors are recorded, so the caller drops the "edited by" clause.
 * @param {string[]} editors
 * @returns {string}
 */
function editorNames(editors) {
  const list = (editors || []).map(naturalAuthor).filter(Boolean);
  if (list.length === 0) {
    return '';
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]} and ${list[1]}`;
  }
  // No comma: these names are in natural order, so nothing is inverted for "et al." to close.
  return `${list[0]} et al.`;
}

/**
 * Chapter in an edited book (MLA 9 container model — the book is container 1):
 * Author. "Chapter Title." Book Title, edited by Editor Name, 2nd ed., Publisher, Year,
 * pp. x–y, DOI.
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
  if (safe(c.publisher)) {
    parts.push(safe(c.publisher));
  }
  if (mlaYear(c)) {
    parts.push(mlaYear(c));
  }
  if (ex.pages) {
    parts.push(`pp. ${pageRange(ex.pages, 'mla')}`);
  }
  if (doiUrl(c.doi)) {
    parts.push(doiUrl(c.doi));
  }
  const container = parts.length ? `${bookTitle}, ${parts.join(', ')}` : bookTitle;
  return `${authorBlock(c)}"${safe(c.title)}." ${endEntry(container)}`;
}

/**
 * Thesis or dissertation (MLA 9 §5.104):
 * Author. Title. Year. Institution, PhD dissertation. URL
 */
function thesis(c, html) {
  const ex = c.extra || {};
  const kind = degreeKind(ex.thesisType);
  let descriptor;
  if (kind === 'doctoral') {
    descriptor = 'PhD dissertation';
  } else if (kind === 'masters') {
    descriptor = 'MA thesis';
  } else {
    descriptor = safe(ex.thesisType) || 'Thesis';
  }
  const institution = safe(ex.institution) || safe(c.publisher);
  const tail = institution ? `${institution}, ${descriptor}` : descriptor;
  const year = mlaYear(c) ? ` ${mlaYear(c)}.` : '';
  // A thesis read online carries its location, exactly as an online journal article does.
  return `${authorBlock(c)}${endEntry(italic(c.title, html))}${year} ${tail}.${linkTail(c)}`;
}

function journal(c, html) {
  const title = `"${safe(c.title)}."`;
  const journalName = italic(safe(c.siteName) || 'Journal name unknown', html);
  const ex = c.extra || {};
  const volume = safe(ex.volume);
  const issue = safe(ex.issue);
  const pages = pageRange(ex.pages, 'mla');

  let ref = `${authorBlock(c)}${title} ${journalName}`;
  if (volume) {
    ref += `, vol. ${volume}`;
  }
  if (issue) {
    ref += `, no. ${issue}`;
  }
  // The issue's date as recorded: "June 2020", "5 June 2020" or "2020".
  const published = mlaDate(c.publicationDate);
  if (published) {
    ref += `, ${published}`;
  }
  if (pages) {
    ref += `, pp. ${pages}`;
  }
  // MLA 9 §5.93: a DOI is given as a link the reader can follow, not as a bare identifier. It is
  // the container's location, so a comma, not a full stop, comes before it.
  const link = linkFor(c);
  return endEntry(link ? `${ref}, ${link}` : ref);
}

function newspaper(c, html) {
  const title = `"${safe(c.title)}."`;
  const paper = italic(safe(c.siteName) || 'Newspaper name unknown', html);
  // Date, then page, then URL — MLA's container order, each part present only if recorded, so a
  // print-only article never trails a separator with nothing behind it.
  const pages = formatLocator(pageRange(c.extra && c.extra.pages, 'mla'), { pageLabels: true });
  const parts = [mlaDate(c.publicationDate), pages, linkFor(c)];
  const tail = parts.filter(Boolean).join(', ');
  return endEntry(`${authorBlock(c)}${title} ${paper}${tail ? `, ${tail}` : ''}`);
}

function video(c, html) {
  const title = `"${safe(c.title)}."`;
  const site = safe(c.siteName);
  const siteSegment = site ? ` ${italic(site, html)},` : '';
  const pubDate = mlaDate(c.publicationDate);
  const dateSegment = pubDate ? ` ${pubDate},` : '';
  const ref = `${authorBlock(c)}${title}${siteSegment}${publishingOrganisation(c)}${dateSegment}${linkTail(c)}`;
  return ref.replace(/,$/, '.');
}

/**
 * The handle as MLA gives it after the account name, " [@pronounced_ing]", or ''. MLA uses the
 * name on the account and adds the handle only when it differs from that name; one that resembles
 * the name (@BillGates for Bill Gates) is left out when the entry gives a URL to find the post by.
 * @param {Object} c - normalised citation with at least one author
 * @returns {string}
 */
function handleAfterName(c) {
  const handle = postHandle(c);
  const [name] = authorsOf(c);
  if (!handle || !name) {
    return '';
  }
  const squash = text =>
    safe(text)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const { family, given } = parseAuthor(name);
  const forms = [squash(`${given} ${family}`), squash(`${family} ${given}`), squash(name)];
  const resembles = forms.some(form => form && squash(handle).includes(form));
  return resembles && linkFor(c) ? '' : ` [${handle}]`;
}

/**
 * A post (MLA Style Center, "Citing Material Posted on Social Media Platforms"): Author. "Text
 * of the post." Platform, Day Mon. Year, URL. The text is the title, printed whole; the platform
 * is the container.
 */
function social(c, html) {
  const text = safe(c.title).trim();
  const title = text ? `"${/[.?!]$/.test(text) ? text : `${text}.`}"` : '';
  const platform = postPlatform(c);
  const platformSegment = platform ? ` ${italic(platform, html)},` : '';
  const pubDate = mlaDate(c.publicationDate);
  const dateSegment = pubDate ? ` ${pubDate},` : '';
  const ref = `${authorBlock(c, handleAfterName(c))}${title}${platformSegment}${publishingOrganisation(c)}${dateSegment}${linkTail(c)}`;
  return ref.replace(/,$/, '.');
}

/**
 * Per-type renderer map. Canonical types not listed (website/pdf/other) fall back to `website`,
 * so adding a citation type needs an entry here only when it formats differently.
 */
const RENDERERS = { book, chapter, journal, newspaper, thesis, video, social_media: social };

/**
 * Full MLA 9 reference-list entry.
 * @param {Object} citation - normalised citation
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatReference(citation, options = {}) {
  const html = options.html === true;
  const render = RENDERERS[citation.type] || website;
  return render(citation, html);
}

export default { formatInText, formatReference };
