/**
 * APA 7th edition formatter.
 *
 * Receives an already-normalised citation (authors:string[], canonical type, extra.* journal
 * fields, siteName = container). Each exported function takes `(citation, { html })`; when
 * `html` is true, italicised parts are wrapped in <em> (for the in-popup preview), otherwise
 * plain text (for clipboard / .txt export).
 *
 * Author format: "Family, I. I." (spaced initials). Lists use Oxford comma + "&".
 * DOI rendered as https://doi.org/… link when present.
 */

import { getYear, italic, dateParts, parseAuthor, initials, safe, isHttpUrl } from './shared.js';

/**
 * Family + spaced initials, APA 7 style: "Smith, J. M." (single token kept verbatim).
 * @param {string} raw
 * @returns {string}
 */
function authorName(raw) {
  const { family, given } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return given ? `${family}, ${initials(given, { spaced: true })}` : family;
}

/**
 * Reference-list author list with Oxford comma and "&":
 *   1  → "Smith, J. M."
 *   2  → "Smith, J. M., & Doe, A. B."
 *   3+ → "Smith, J. M., Doe, A. B., & Lee, C."
 * @param {string[]} authors
 * @returns {string}
 */
function formatAuthors(authors) {
  const list = (authors || []).map(authorName).filter(Boolean);
  if (list.length === 0) {
    return 'Anon.';
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]}, & ${list[1]}`;
  }
  return `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
}

/**
 * "Month Day" for newspaper dates, e.g. "March 4". Returns '' when unparseable.
 * @param {string} dateString
 * @returns {string}
 */
function monthDay(dateString) {
  const p = dateParts(dateString);
  return p ? `${p.monthLong} ${p.day}` : '';
}

/**
 * DOI clause: "https://doi.org/10.x/y" — normalises bare DOIs and full URLs.
 * @param {string} doi
 * @returns {string}
 */
function doiUrl(doi) {
  const d = safe(doi).trim();
  if (!d) {
    return '';
  }
  if (/^https?:\/\//i.test(d)) {
    return d;
  }
  return `https://doi.org/${d}`;
}

/**
 * In-text citation: (Smith, 2023) / (Smith & Doe, 2023) / (Smith et al., 2023) / (Anon., n.d.)
 * @param {Object} citation
 * @param {Object} [options]
 * @returns {string}
 */
export function formatInText(citation, options = {}) {
  // options accepted for interface symmetry; in-text is always plain text
  void options;
  const year = getYear(citation);
  const authors = citation.authors || [];
  const fam = i => parseAuthor(authors[i]).family || safe(authors[i]);

  if (authors.length === 0) {
    return `(Anon., ${year})`;
  }
  if (authors.length === 1) {
    return `(${fam(0)}, ${year})`;
  }
  if (authors.length === 2) {
    return `(${fam(0)} & ${fam(1)}, ${year})`;
  }
  return `(${fam(0)} et al., ${year})`;
}

/**
 * Full reference-list entry.
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

function website(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const title = italic(c.title, html);
  const site = safe(c.siteName);
  let ref = `${authors} (${year}). ${title}.`;
  if (site) {
    ref += ` ${site}.`;
  }
  if (isHttpUrl(c.url)) {
    ref += ` ${safe(c.url)}`;
  }
  return ref;
}

function book(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const edition = c.extra && c.extra.edition ? ` (${c.extra.edition} ed.)` : '';
  const publisher = safe(c.publisher) || 'Publisher unknown';
  return `${authors} (${year}). ${italic(c.title, html)}${edition}. ${publisher}.`;
}

function journal(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const journalName = safe(c.siteName) || 'Journal name unknown';
  const volume = safe(c.extra && c.extra.volume);
  const issue = safe(c.extra && c.extra.issue);
  const pages = safe(c.extra && c.extra.pages);

  let ref = `${authors} (${year}). ${safe(c.title)}. ${italic(journalName, html)}`;
  if (volume) {
    ref += `, ${italic(volume, html)}`;
    if (issue) {
      ref += `(${issue})`;
    }
  }
  if (pages) {
    ref += `, ${pages}`;
  }
  ref += '.';
  if (c.doi) {
    ref += ` ${doiUrl(c.doi)}`;
  }
  return ref;
}

function newspaper(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const paper = safe(c.siteName) || 'Newspaper name unknown';
  const md = monthDay(c.publicationDate);
  const dateSuffix = md ? `, ${md}` : '';
  let ref = `${authors} (${year}${dateSuffix}). ${safe(c.title)}. ${italic(paper, html)}.`;
  if (isHttpUrl(c.url)) {
    ref += ` ${safe(c.url)}`;
  }
  return ref;
}

function video(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  return `${authors} (${year}). ${italic(c.title, html)} [Video]. ${safe(c.url)}`;
}

function social(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const text = safe(c.title);
  const snippet = text.length > 40 ? `${text.substring(0, 40)}…` : text;
  return `${authors} (${year}). ${italic(snippet, html)} [Post]. ${safe(c.url)}`;
}

export default { formatInText, formatReference };
