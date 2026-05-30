/**
 * Harvard — Cite Them Right (13th edition) formatter.
 *
 * Receives an already-normalised citation (authors:string[], canonical type, extra.* journal
 * fields, siteName = container). Each exported function takes `(citation, { html })`; when
 * `html` is true, italicised parts are wrapped in <em> (for the in-popup preview), otherwise
 * plain text (for clipboard / .txt export).
 */

import { getYear, italic, dateParts, parseAuthor, initials, safe, isHttpUrl } from './shared.js';

/**
 * Family + closed-up initials, Harvard style: "Smith, J.M." (single token kept verbatim).
 */
function authorName(raw) {
  const { family, given } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return given ? `${family}, ${initials(given)}` : family;
}

/** Reference-list author list: "A, B. and C, D." / "A, B., C, D. and E, F." */
function formatAuthors(authors) {
  const list = (authors || []).map(authorName).filter(Boolean);
  if (list.length === 0) {
    return 'Anon.';
  }
  if (list.length === 1) {
    return list[0];
  }
  if (list.length === 2) {
    return `${list[0]} and ${list[1]}`;
  }
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** "24 November 2025" or '' when unparseable. */
function longDate(dateString) {
  const p = dateParts(dateString);
  return p ? `${p.day} ${p.monthLong} ${p.year}` : '';
}

/** "24 November" (newspapers) or '' when unparseable. */
function dayMonth(dateString) {
  const p = dateParts(dateString);
  return p ? `${p.day} ${p.monthLong}` : '';
}

/** " (Accessed: 24 November 2025)." or "" when no access date. */
function accessedClause(citation) {
  const accessed = longDate(citation.accessDate);
  return accessed ? ` (Accessed: ${accessed})` : '';
}

function socialPlatform(url) {
  const u = safe(url).toLowerCase();
  if (u.includes('twitter.com') || u.includes('x.com')) {
    return 'Twitter/X';
  }
  if (u.includes('facebook.com')) {
    return 'Facebook';
  }
  if (u.includes('instagram.com')) {
    return 'Instagram';
  }
  if (u.includes('linkedin.com')) {
    return 'LinkedIn';
  }
  if (u.includes('tiktok.com')) {
    return 'TikTok';
  }
  return 'Social media';
}

/**
 * In-text citation: (Smith, 2023) / (Smith and Doe, 2023) / (Smith et al., 2023) / (Anon., n.d.)
 * @param {Object} citation
 * @returns {string}
 */
export function formatInText(citation) {
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
    return `(${fam(0)} and ${fam(1)}, ${year})`;
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
  const accessed = accessedClause(c);
  const url = safe(c.url);
  return `${authors} (${year}) ${title}. Available at: ${url}${accessed}.`;
}

function book(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  let ref = `${authors} (${year}) ${italic(c.title, html)}.`;
  if (c.extra && c.extra.edition) {
    ref += ` ${c.extra.edition} edn.`;
  }
  const place = c.extra && c.extra.place ? `${c.extra.place}: ` : '';
  const publisher = safe(c.publisher) || 'Publisher unknown';
  ref += ` ${place}${publisher}.`;
  return ref;
}

function journal(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const journalName = safe(c.siteName) || 'Journal name unknown';
  const volume = safe(c.extra && c.extra.volume);
  const issue = safe(c.extra && c.extra.issue);
  const pages = safe(c.extra && c.extra.pages);

  let ref = `${authors} (${year}) '${safe(c.title)}', ${italic(journalName, html)}`;
  if (volume) {
    ref += `, ${volume}`;
    if (issue) {
      ref += `(${issue})`;
    }
  }
  if (pages) {
    ref += `, pp. ${pages}`;
  }
  ref += '.';
  if (c.doi) {
    ref += ` doi: ${safe(c.doi)}.`;
  }
  return ref;
}

function newspaper(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const paper = safe(c.siteName) || 'Newspaper name unknown';
  const date = dayMonth(c.publicationDate);
  let ref = `${authors} (${year}) '${safe(c.title)}', ${italic(paper, html)}`;
  if (date) {
    ref += `, ${date}`;
  }
  ref += '.';
  if (isHttpUrl(c.url)) {
    ref += ` Available at: ${safe(c.url)}${accessedClause(c)}.`;
  }
  return ref;
}

function video(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  return `${authors} (${year}) ${italic(c.title, html)} [Video]. Available at: ${safe(c.url)}${accessedClause(c)}.`;
}

function social(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const text = safe(c.title);
  const snippet = text.length > 40 ? `${text.substring(0, 40)}…` : text;
  const platform = socialPlatform(c.url);
  return `${authors} (${year}) ${italic(snippet, html)} [${platform}]. Available at: ${safe(c.url)}${accessedClause(c)}.`;
}

export default { formatInText, formatReference };
