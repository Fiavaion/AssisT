/**
 * Citation Formatter - Harvard (Cite Them Right) Style
 *
 * Implements Cite Them Right Harvard citation format (13th edition)
 * Supports:
 * - In-text citations
 * - Reference list entries
 * - Multiple citation types (website, book, journal, etc.)
 *
 * Format Examples:
 * - In-text: (Smith, 2023)
 * - Reference: Smith, J. (2023) Title of work. Available at: https://... (Accessed: 24 November 2025).
 */

import { extractYear, formatAuthorHarvard } from './citation-model.js';

/**
 * Generate in-text citation (Harvard style)
 * Format: (Author, Year) or (Author1 and Author2, Year) or (Author1 et al., Year)
 * @param {CitationMetadata} citation
 * @returns {string}
 */
export function formatInText(citation) {
  const year = extractYear(citation.publicationDate) || extractYear(citation.accessDate);

  if (citation.authors.length === 0) {
    return `(Anon., ${year})`;
  }

  if (citation.authors.length === 1) {
    const lastName = citation.authors[0].split(',')[0].trim();
    return `(${lastName}, ${year})`;
  }

  if (citation.authors.length === 2) {
    const lastName1 = citation.authors[0].split(',')[0].trim();
    const lastName2 = citation.authors[1].split(',')[0].trim();
    return `(${lastName1} and ${lastName2}, ${year})`;
  }

  // 3+ authors: use et al.
  const lastName = citation.authors[0].split(',')[0].trim();
  return `(${lastName} et al., ${year})`;
}

/**
 * Generate full reference list entry (Harvard style)
 * Format varies by citation type
 * @param {CitationMetadata} citation
 * @returns {string}
 */
export function formatReference(citation) {
  switch (citation.type) {
    case 'website':
      return formatWebsite(citation);
    case 'book':
      return formatBook(citation);
    case 'journal':
      return formatJournal(citation);
    case 'newspaper':
      return formatNewspaper(citation);
    case 'video':
      return formatVideo(citation);
    case 'social_media':
      return formatSocialMedia(citation);
    case 'pdf':
      return formatPDF(citation);
    default:
      return formatWebsite(citation);
  }
}

/**
 * Format website citation
 * Format: Author (Year) Title. Available at: URL (Accessed: Date).
 * @param {CitationMetadata} citation
 * @returns {string}
 */
function formatWebsite(citation) {
  const authors = formatAuthors(citation.authors);
  const year = extractYear(citation.publicationDate) || extractYear(citation.accessDate);
  const title = citation.title;
  const url = citation.url;
  const accessDate = formatAccessDate(citation.accessDate);

  return `${authors} (${year}) ${italicize(title)}. Available at: ${url} (Accessed: ${accessDate}).`;
}

/**
 * Format book citation
 * Format: Author (Year) Title. Edition. Place: Publisher.
 * @param {CitationMetadata} citation
 * @returns {string}
 */
function formatBook(citation) {
  const authors = formatAuthors(citation.authors);
  const year = extractYear(citation.publicationDate);
  const title = citation.title;
  const publisher = citation.publisher || 'Publisher unknown';

  let reference = `${authors} (${year}) ${italicize(title)}.`;

  if (citation.extra?.edition) {
    reference += ` ${citation.extra.edition} edn.`;
  }

  reference += ` ${publisher}.`;

  return reference;
}

/**
 * Format journal article citation
 * Format: Author (Year) 'Article title', Journal Title, Volume(Issue), pp. pages.
 * @param {CitationMetadata} citation
 * @returns {string}
 */
function formatJournal(citation) {
  const authors = formatAuthors(citation.authors);
  const year = extractYear(citation.publicationDate);
  const title = citation.title;
  const journal = citation.siteName || 'Journal name unknown';
  const volume = citation.extra?.volume || '';
  const issue = citation.extra?.issue || '';
  const pages = citation.extra?.pages || '';

  let reference = `${authors} (${year}) '${title}', ${italicize(journal)}`;

  if (volume) {
    reference += `, ${volume}`;
    if (issue) {
      reference += `(${issue})`;
    }
  }

  if (pages) {
    reference += `, pp. ${pages}`;
  }

  reference += '.';

  // Add DOI if available
  if (citation.doi) {
    reference += ` doi: ${citation.doi}.`;
  }

  return reference;
}

/**
 * Format newspaper article citation
 * Format: Author (Year) 'Article title', Newspaper Title, Day Month, p. page.
 * @param {CitationMetadata} citation
 * @returns {string}
 */
function formatNewspaper(citation) {
  const authors = formatAuthors(citation.authors);
  const year = extractYear(citation.publicationDate);
  const title = citation.title;
  const newspaper = citation.siteName || 'Newspaper name unknown';
  const date = formatFullDate(citation.publicationDate);

  return `${authors} (${year}) '${title}', ${italicize(newspaper)}, ${date}. Available at: ${citation.url} (Accessed: ${formatAccessDate(citation.accessDate)}).`;
}

/**
 * Format video citation (e.g., YouTube)
 * Format: Author (Year) Title. Available at: URL (Accessed: Date).
 * @param {CitationMetadata} citation
 * @returns {string}
 */
function formatVideo(citation) {
  const authors = formatAuthors(citation.authors);
  const year = extractYear(citation.publicationDate);
  const title = citation.title;
  const url = citation.url;
  const accessDate = formatAccessDate(citation.accessDate);

  return `${authors} (${year}) ${italicize(title)} [Video]. Available at: ${url} (Accessed: ${accessDate}).`;
}

/**
 * Format social media post citation
 * Format: Author (Year) Post content (truncated). [Social Media]. Available at: URL (Accessed: Date).
 * @param {CitationMetadata} citation
 * @returns {string}
 */
function formatSocialMedia(citation) {
  const authors = formatAuthors(citation.authors);
  const year = extractYear(citation.publicationDate);
  const title = citation.title.substring(0, 40) + (citation.title.length > 40 ? '...' : '');
  const platform = getSocialMediaPlatform(citation.url);
  const url = citation.url;
  const accessDate = formatAccessDate(citation.accessDate);

  return `${authors} (${year}) ${title} [${platform}]. Available at: ${url} (Accessed: ${accessDate}).`;
}

/**
 * Format PDF document citation
 * Format: Author (Year) Title. Available at: URL (Accessed: Date).
 * @param {CitationMetadata} citation
 * @returns {string}
 */
function formatPDF(citation) {
  return formatWebsite(citation); // Same format as website
}

/**
 * Format author list (Harvard style)
 * 1 author: Smith, J.
 * 2 authors: Smith, J. and Doe, M.
 * 3+ authors: Smith, J., Doe, M. and Jones, L.
 * @param {Array<string>} authors
 * @returns {string}
 */
function formatAuthors(authors) {
  if (authors.length === 0) {
    return 'Anon.';
  }

  const formatted = authors.map(author => formatAuthorHarvard(author));

  if (formatted.length === 1) {
    return formatted[0];
  }

  if (formatted.length === 2) {
    return `${formatted[0]} and ${formatted[1]}`;
  }

  // 3+ authors: all names with 'and' before last
  const allButLast = formatted.slice(0, -1).join(', ');
  const last = formatted[formatted.length - 1];
  return `${allButLast} and ${last}`;
}

/**
 * Format access date (Harvard style)
 * Format: 24 November 2025
 * @param {string} dateString - ISO date string
 * @returns {string}
 */
function formatAccessDate(dateString) {
  if (!dateString) {
    return 'Date unknown';
  }

  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'long' });
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

/**
 * Format full date for newspapers (Harvard style)
 * Format: 24 November
 * @param {string} dateString - ISO date string
 * @returns {string}
 */
function formatFullDate(dateString) {
  if (!dateString) {
    return 'Date unknown';
  }

  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'long' });

  return `${day} ${month}`;
}

/**
 * Detect social media platform from URL
 * @param {string} url
 * @returns {string}
 */
function getSocialMediaPlatform(url) {
  if (url.includes('twitter.com') || url.includes('x.com')) {
    return 'Twitter/X';
  }
  if (url.includes('facebook.com')) {
    return 'Facebook';
  }
  if (url.includes('instagram.com')) {
    return 'Instagram';
  }
  if (url.includes('linkedin.com')) {
    return 'LinkedIn';
  }
  if (url.includes('tiktok.com')) {
    return 'TikTok';
  }
  return 'Social Media';
}

/**
 * Italicize text (for markdown or HTML output)
 * @param {string} text
 * @returns {string}
 */
function italicize(text) {
  // Return plain text for now - UI will handle formatting
  return text;
}

/**
 * Generate bibliography from multiple citations
 * Sorted alphabetically by author last name
 * @param {Array<CitationMetadata>} citations
 * @returns {string}
 */
export function formatBibliography(citations) {
  // Sort citations alphabetically by first author's last name
  const sorted = [...citations].sort((a, b) => {
    const aAuthor = a.authors[0]?.split(',')[0].trim().toLowerCase() || 'anon';
    const bAuthor = b.authors[0]?.split(',')[0].trim().toLowerCase() || 'anon';
    return aAuthor.localeCompare(bAuthor);
  });

  // Format each citation
  const references = sorted.map(citation => formatReference(citation));

  return references.join('\n\n');
}

/**
 * Generate APA-style hanging indent HTML
 * @param {string} reference
 * @returns {string}
 */
export function formatReferenceHTML(reference) {
  return `<p style="margin-left: 2em; text-indent: -2em;">${reference}</p>`;
}

export default {
  formatInText,
  formatReference,
  formatBibliography,
  formatReferenceHTML,
};
