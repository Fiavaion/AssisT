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
 *   - Up to 10 authors listed in full; "and" before last; first inverted rest natural.
 *   - Year follows author block: "Author. Year. …"
 *   - In-text: (Family Year) — NO comma between name and year.
 *   - 2 authors: "(Smith and Doe 2023)"; 3+: "(Smith et al. 2023)"; none: "(Anon. n.d.)"
 */

import { getYear, italic, dateParts, parseAuthor, safe, isHttpUrl } from './shared.js';

// ─── Author formatting ────────────────────────────────────────────────────────

/**
 * Full name, first author inverted: "Smith, John Michael"
 * Single-token author (organisation) returned verbatim.
 */
function firstAuthorName(raw) {
  const { family, given } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return given ? `${family}, ${given}` : family;
}

/**
 * Full name in natural order for subsequent authors: "Jane Doe"
 * Single-token author returned verbatim.
 */
function naturalName(raw) {
  const { family, given } = parseAuthor(raw);
  if (!family) {
    return '';
  }
  return given ? `${given} ${family}` : family;
}

/**
 * Reference-list author block (Chicago 17 §15.10):
 *   1  → "Family, Given."
 *   2  → "Family, Given, and Given Family."
 *   3+ → "Family, Given, Given Family, and Given Family." (up to 10 total; all named)
 */
function formatAuthors(authors) {
  const list = authors || [];
  if (list.length === 0) {
    return 'Anon.';
  }
  if (list.length === 1) {
    const name = firstAuthorName(list[0]);
    return name ? `${name}.` : 'Anon.';
  }

  const first = firstAuthorName(list[0]);
  const rest = list
    .slice(1)
    .map(a => naturalName(a))
    .filter(Boolean);
  const last = rest.pop();
  const middle = rest.join(', ');

  if (middle) {
    return `${first}, ${middle}, and ${last}.`;
  }
  return `${first}, and ${last}.`;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** "March 4, 2021" or '' when unparseable. */
function fullDate(dateString) {
  const p = dateParts(dateString);
  return p ? `${p.monthLong} ${p.day}, ${p.year}` : '';
}

/** "Accessed Month Day, Year." or '' when no access date. */
function accessedClause(citation) {
  const d = fullDate(citation.accessDate);
  return d ? `Accessed ${d}. ` : '';
}

// ─── Type-specific formatters ─────────────────────────────────────────────────

function website(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const title = `"${safe(c.title)}."`;
  const site = safe(c.siteName);
  const accessed = accessedClause(c);
  const url = safe(c.url);

  let ref = `${authors} ${year}. ${title}`;
  if (site) {
    ref += ` ${italic(site, html)}.`;
  }
  if (accessed) {
    ref += ` ${accessed}`;
  }
  if (isHttpUrl(url)) {
    ref += `${url}.`;
  }
  return ref.trimEnd().replace(/\.$/, '') + '.';
}

function journal(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const journalName = safe(c.siteName) || 'Journal name unknown';
  const volume = safe(c.extra && c.extra.volume);
  const issue = safe(c.extra && c.extra.issue);
  const pages = safe(c.extra && c.extra.pages);
  const doi = safe(c.doi);

  let ref = `${authors} ${year}. "${safe(c.title)}." ${italic(journalName, html)}`;
  if (volume) {
    ref += ` ${volume}`;
    if (issue) {
      ref += ` (${issue})`;
    }
  }
  if (pages) {
    ref += `: ${pages}`;
  }
  ref += '.';
  if (doi) {
    ref += ` https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//i, '')}`;
  }
  return ref.trimEnd().replace(/\.$/, '') + '.';
}

function book(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const place = c.extra && c.extra.place ? `${c.extra.place}: ` : '';
  const publisher = safe(c.publisher) || 'Publisher unknown';
  return `${authors} ${year}. ${italic(c.title, html)}. ${place}${publisher}.`;
}

function newspaper(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const paper = safe(c.siteName) || 'Newspaper name unknown';
  const date = fullDate(c.publicationDate);
  const url = safe(c.url);

  let ref = `${authors} ${year}. "${safe(c.title)}." ${italic(paper, html)}`;
  if (date) {
    ref += `, ${date}`;
  }
  ref += '.';
  if (isHttpUrl(url)) {
    ref += ` ${url}.`;
  }
  return ref;
}

function video(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const site = safe(c.siteName);
  const url = safe(c.url);

  let ref = `${authors} ${year}. "${safe(c.title)}."`;
  if (site) {
    ref += ` ${italic(site, html)}.`;
  }
  if (isHttpUrl(url)) {
    ref += ` ${url}.`;
  }
  return ref;
}

function social(c, html) {
  const authors = formatAuthors(c.authors);
  const year = getYear(c);
  const text = safe(c.title);
  const snippet = text.length > 40 ? `${text.substring(0, 40)}…` : text;
  const platform = safe(c.siteName) || 'Social Media';
  const url = safe(c.url);

  let ref = `${authors} ${year}. "${snippet}." ${italic(platform, html)}.`;
  if (isHttpUrl(url)) {
    ref += ` ${url}.`;
  }
  return ref;
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
 * Format: (Family Year) — no comma.
 * @param {Object} citation - normalised citation
 * @returns {string}
 */
export function formatInText(citation) {
  const year = getYear(citation);
  const authors = citation.authors || [];
  const fam = i => parseAuthor(authors[i]).family || safe(authors[i]);

  if (authors.length === 0) {
    return `(Anon. ${year})`;
  }
  if (authors.length === 1) {
    return `(${fam(0)} ${year})`;
  }
  if (authors.length === 2) {
    return `(${fam(0)} and ${fam(1)} ${year})`;
  }
  return `(${fam(0)} et al. ${year})`;
}

/**
 * Chicago 17 author–date full reference-list entry.
 * @param {Object} citation - normalised citation
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatReference(citation, options = {}) {
  const html = options.html === true;
  let result;
  switch (citation.type) {
    case 'book':
      result = book(citation, html);
      break;
    case 'journal':
      result = journal(citation, html);
      break;
    case 'newspaper':
      result = newspaper(citation, html);
      break;
    case 'video':
      result = video(citation, html);
      break;
    case 'social_media':
      result = social(citation, html);
      break;
    case 'website':
    case 'pdf':
    case 'other':
    default:
      result = website(citation, html);
      break;
  }
  return tidy(result);
}

export default { formatInText, formatReference };
