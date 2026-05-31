/**
 * MLA 9th Edition formatter.
 *
 * Receives an already-normalised citation (authors:string[], canonical type, extra.* journal
 * fields, siteName = container). Each exported function takes `(citation, { html })`; when
 * `html` is true, italicised parts are wrapped in <em> (for the in-popup preview), otherwise
 * plain text (for clipboard / .txt export).
 *
 * Key MLA 9 conventions:
 *  - Author order: "Family, Given." for first; "Given Family" (natural order) for second.
 *  - Three or more authors: first author + "et al."
 *  - No year in the author slot; publication date appears later in the entry.
 *  - Titles of short works (articles, posts) in quotation marks; containers (journals,
 *    sites, platforms) in italics.
 *  - Abbreviated months follow MLA style (Jan., Feb., Mar., Apr., May, June, July,
 *    Aug., Sept., Oct., Nov., Dec.).
 */

import { italic, dateParts, parseAuthor, safe, isHttpUrl } from './shared.js';

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

/**
 * Format a date as "Day Mon. Year" (MLA style), e.g. "4 Mar. 2021".
 * Returns '' when dateString is unparseable.
 * @param {string} dateString
 * @returns {string}
 */
function mlaDate(dateString) {
  const p = dateParts(dateString);
  if (!p) {
    return '';
  }
  const mon =
    MLA_MONTHS[p.day !== undefined ? new Date(dateString).getMonth() : -1] ||
    MLA_MONTHS[new Date(dateString).getMonth()];
  return `${p.day} ${mon} ${p.year}`;
}

/**
 * First author in inverted form: "Family, Given" (full given name, not initials).
 * A single-token name (organisation) is returned verbatim.
 * @param {string} raw
 * @returns {string}
 */
function firstAuthor(raw) {
  const { family, given } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return given ? `${family}, ${given}` : family;
}

/**
 * Second (and subsequent in 2-author case) author in natural order: "Given Family".
 * A single-token name is returned verbatim.
 * @param {string} raw
 * @returns {string}
 */
function naturalAuthor(raw) {
  const { family, given } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return given ? `${given} ${family}` : family;
}

/**
 * Build MLA reference-list author block.
 *   1 author : "Family, Given."
 *   2 authors: "Family, Given, and Given Family."
 *   3+       : "Family, Given, et al."
 * @param {string[]} authors
 * @returns {string}
 */
function formatAuthors(authors) {
  const list = (authors || []).filter(a => safe(a).trim());
  if (list.length === 0) {
    return 'Anonymous.';
  }
  const first = firstAuthor(list[0]);
  if (list.length === 1) {
    return `${first}.`;
  }
  if (list.length === 2) {
    return `${first}, and ${naturalAuthor(list[1])}.`;
  }
  return `${first}, et al.`;
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
 * MLA in-text citation: (Family) / (Family and Family) / (Family et al.).
 * Appends page numbers when extra.pages is present.
 * @param {Object} citation - normalised citation
 * @param {Object} [options]
 * @returns {string}
 */
export function formatInText(citation, options = {}) {
  void options; // html flag has no effect on in-text
  const authors = citation.authors || [];
  const fam = i => parseAuthor(authors[i]).family || safe(authors[i]);
  const pages = safe(citation.extra && citation.extra.pages);
  const suffix = pages ? ` ${pages}` : '';

  if (authors.length === 0) {
    return `(Anon.${suffix})`;
  }
  if (authors.length === 1) {
    return `(${fam(0)}${suffix})`;
  }
  if (authors.length === 2) {
    return `(${fam(0)} and ${fam(1)}${suffix})`;
  }
  return `(${fam(0)} et al.${suffix})`;
}

function website(c, html) {
  const authors = formatAuthors(c.authors);
  const title = `"${safe(c.title)}."`;
  const site = safe(c.siteName);
  const siteSegment = site ? ` ${italic(site, html)},` : '';
  const pubDate = mlaDate(c.publicationDate);
  const dateSegment = pubDate ? ` ${pubDate},` : '';
  const url = isHttpUrl(c.url) ? ` ${safe(c.url)}.` : '';
  const accessed = accessedClause(c);
  return `${authors} ${title}${siteSegment}${dateSegment}${url}${accessed}`;
}

function book(c, html) {
  const authors = formatAuthors(c.authors);
  const title = italic(c.title, html);
  const publisher = safe(c.publisher);
  const year = mlaDate(c.publicationDate) ? String(dateParts(c.publicationDate).year) : 'n.d.';
  const pubSegment = publisher ? `${publisher}, ` : '';
  return `${authors} ${title}. ${pubSegment}${year}.`;
}

function journal(c, html) {
  const authors = formatAuthors(c.authors);
  const title = `"${safe(c.title)}."`;
  const journal = italic(safe(c.siteName) || 'Journal name unknown', html);
  const ex = c.extra || {};
  const volume = safe(ex.volume);
  const issue = safe(ex.issue);
  const pages = safe(ex.pages);
  const year = dateParts(c.publicationDate) ? String(dateParts(c.publicationDate).year) : 'n.d.';

  let ref = `${authors} ${title} ${journal}`;
  if (volume) {
    ref += `, vol. ${volume}`;
  }
  if (issue) {
    ref += `, no. ${issue}`;
  }
  ref += `, ${year}`;
  if (pages) {
    ref += `, pp. ${pages}`;
  }
  ref += '.';
  if (c.doi) {
    ref += ` ${safe(c.doi)}.`;
  } else if (isHttpUrl(c.url)) {
    ref += ` ${safe(c.url)}.`;
  }
  return ref;
}

function newspaper(c, html) {
  const authors = formatAuthors(c.authors);
  const title = `"${safe(c.title)}."`;
  const paper = italic(safe(c.siteName) || 'Newspaper name unknown', html);
  const pubDate = mlaDate(c.publicationDate);
  const dateSegment = pubDate ? ` ${pubDate},` : '';
  const url = isHttpUrl(c.url) ? ` ${safe(c.url)}.` : '';
  return `${authors} ${title} ${paper},${dateSegment}${url}`;
}

function video(c, html) {
  const authors = formatAuthors(c.authors);
  const title = `"${safe(c.title)}."`;
  const site = safe(c.siteName);
  const siteSegment = site ? ` ${italic(site, html)},` : '';
  const pubDate = mlaDate(c.publicationDate);
  const dateSegment = pubDate ? ` ${pubDate},` : '';
  const url = isHttpUrl(c.url) ? ` ${safe(c.url)}.` : '';
  return `${authors} ${title}${siteSegment}${dateSegment}${url}`;
}

function social(c, html) {
  const authors = formatAuthors(c.authors);
  const text = safe(c.title);
  const snippet = text.length > 40 ? `${text.substring(0, 40)}…` : text;
  const title = `"${snippet}."`;
  const platform = safe(c.siteName);
  const platformSegment = platform ? ` ${italic(platform, html)},` : '';
  const pubDate = mlaDate(c.publicationDate);
  const dateSegment = pubDate ? ` ${pubDate},` : '';
  const url = isHttpUrl(c.url) ? ` ${safe(c.url)}.` : '';
  return `${authors} ${title}${platformSegment}${dateSegment}${url}`;
}

/**
 * Full MLA 9 reference-list entry.
 * @param {Object} citation - normalised citation
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatReference(citation, options = {}) {
  const html = options.html === true;
  switch (citation.type) {
    case 'book':
      return book(citation, html);
    case 'journal':
      return journal(citation, html);
    case 'newspaper':
      return newspaper(citation, html);
    case 'video':
      return video(citation, html);
    case 'social_media':
      return social(citation, html);
    case 'website':
    case 'pdf':
    case 'other':
    default:
      return website(citation, html);
  }
}

export default { formatInText, formatReference };
