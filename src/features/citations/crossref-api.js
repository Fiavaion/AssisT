/**
 * CrossRef API Integration for DOI Metadata Enrichment
 *
 * CrossRef is a free API that provides metadata for academic publications via DOI lookup.
 * No API key required for basic usage (50 requests/second limit).
 *
 * API Documentation: https://api.crossref.org
 * Best Practice: Include mailto in User-Agent for higher rate limits
 *
 * Zero-Barrier Accessibility: Completely free, no signup required
 */

const CROSSREF_API_BASE = 'https://api.crossref.org/works/';
const USER_AGENT = 'AssisT-Extension/0.1.0 (mailto:noreply@example.com)';

/**
 * Fetch metadata from CrossRef API using DOI
 * @param {string} doi - Digital Object Identifier (e.g., "10.1000/xyz123")
 * @returns {Promise<Object|null>} - Enriched metadata or null if not found
 */
export async function fetchDOIMetadata(doi) {
  if (!doi) {
    return null;
  }

  // Clean DOI (remove URL prefix if present)
  const cleanDOI = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');

  try {
    const response = await fetch(`${CROSSREF_API_BASE}${encodeURIComponent(cleanDOI)}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[CrossRef] DOI not found: ${cleanDOI}`);
        return null;
      }
      throw new Error(`CrossRef API error: ${response.status}`);
    }

    const data = await response.json();
    return parseCrossRefResponse(data);
  } catch (error) {
    console.error('[CrossRef] API request failed:', error);
    return null;
  }
}

/**
 * Parse CrossRef API response into citation metadata format
 * @param {Object} data - CrossRef API response
 * @returns {Object} - Parsed metadata
 */
function parseCrossRefResponse(data) {
  const message = data.message;
  if (!message) {
    return null;
  }

  const metadata = {
    title: message.title?.[0] || '',
    authors: [],
    publicationDate: '',
    publisher: message.publisher || '',
    doi: message.DOI || '',
    type: mapCrossRefType(message.type),
    containerTitle: message['container-title']?.[0] || '', // Journal/book title
    volume: message.volume || '',
    issue: message.issue || '',
    page: message.page || '',
    issn: message.ISSN?.[0] || '',
    isbn: message.ISBN?.[0] || '',
    url: message.URL || `https://doi.org/${message.DOI}`,
  };

  // Parse authors
  if (message.author && Array.isArray(message.author)) {
    metadata.authors = message.author
      .map(author => {
        if (author.family && author.given) {
          return `${author.family}, ${author.given}`;
        } else if (author.family) {
          return author.family;
        } else if (author.name) {
          return author.name;
        }
        return '';
      })
      .filter(name => name.length > 0);
  }

  // Parse publication date (CrossRef uses date-parts array)
  if (message.published && message.published['date-parts']) {
    const dateParts = message.published['date-parts'][0];
    if (dateParts) {
      const [year, month, day] = dateParts;
      metadata.publicationDate = formatDate(year, month, day);
    }
  } else if (message['published-online'] && message['published-online']['date-parts']) {
    const dateParts = message['published-online']['date-parts'][0];
    if (dateParts) {
      const [year, month, day] = dateParts;
      metadata.publicationDate = formatDate(year, month, day);
    }
  }

  // Fallback to access date if no publication date
  if (!metadata.publicationDate) {
    metadata.accessDate = new Date().toISOString().split('T')[0];
  }

  return metadata;
}

/**
 * Map CrossRef type to citation type
 * @param {string} crossrefType - CrossRef resource type
 * @returns {string} - Citation type
 */
function mapCrossRefType(crossrefType) {
  const typeMap = {
    'journal-article': 'journal',
    book: 'book',
    'book-chapter': 'bookSection',
    'proceedings-article': 'conferencePaper',
    report: 'report',
    dataset: 'dataset',
    'posted-content': 'preprint',
  };

  return typeMap[crossrefType] || 'webpage';
}

/**
 * Format date from date-parts array
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {string} - ISO date string (YYYY-MM-DD)
 */
function formatDate(year, month, day) {
  if (!year) {
    return '';
  }

  const parts = [year];
  if (month) {
    parts.push(String(month).padStart(2, '0'));
  }
  if (day) {
    parts.push(String(day).padStart(2, '0'));
  }

  return parts.join('-');
}

/**
 * Enrich existing citation metadata with CrossRef data
 * Merges CrossRef data with priority given to existing data
 * @param {Object} existingMetadata - Current citation metadata
 * @param {string} doi - DOI to lookup
 * @returns {Promise<Object>} - Enriched metadata
 */
export async function enrichMetadataWithDOI(existingMetadata, doi) {
  const crossrefData = await fetchDOIMetadata(doi);
  if (!crossrefData) {
    return existingMetadata;
  }

  // Merge with priority: existing > CrossRef
  return {
    ...crossrefData,
    ...existingMetadata,
    // Special handling: merge authors if existing is generic
    authors:
      existingMetadata.authors?.[0] === 'Anon.' ? crossrefData.authors : existingMetadata.authors,
    // Always keep the DOI
    doi: doi,
  };
}

/**
 * Validate DOI format
 * @param {string} doi - DOI string
 * @returns {boolean} - True if valid DOI format
 */
export function isValidDOI(doi) {
  if (!doi) {
    return false;
  }

  // DOI format: 10.{4+ digits}/{suffix}
  const doiRegex = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;
  const cleanDOI = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');

  return doiRegex.test(cleanDOI);
}

export default {
  fetchDOIMetadata,
  enrichMetadataWithDOI,
  isValidDOI,
};
