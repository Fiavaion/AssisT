/**
 * Metadata Extractor for Citations
 *
 * Extracts citation metadata from HTML pages using multiple standards:
 * - OpenGraph (og:title, og:author, etc.)
 * - Dublin Core (DC.title, DC.creator, etc.)
 * - JSON-LD (Schema.org structured data)
 * - COinS (ContextObjects in Spans)
 * - Standard HTML meta tags
 * - DOI detection
 *
 * Designed to run in Chrome extension content script context.
 */

/**
 * Extract all available metadata from current page
 * @param {Document} doc - DOM document object (defaults to window.document)
 * @returns {ExtractedMetadata}
 */
export function extractMetadata(doc = document) {
  return {
    highwire: extractHighwire(doc),
    openGraph: extractOpenGraph(doc),
    dublinCore: extractDublinCore(doc),
    jsonLD: extractJSONLD(doc),
    coins: extractCOinS(doc),
    html: extractHTMLMeta(doc),
    doi: extractDOI(doc),
  };
}

/**
 * Extract Highwire Press / Google Scholar citation_* meta tags.
 * This is the dominant metadata standard for academic sources (journals, arXiv, PubMed,
 * institutional repositories) — and the one the old extractor ignored. citation_author
 * repeats once per author.
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractHighwire(doc) {
  const get = name =>
    doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || '';
  const getAll = name =>
    Array.from(doc.querySelectorAll(`meta[name="${name}"]`))
      .map(m => m.getAttribute('content')?.trim())
      .filter(Boolean);

  const title = get('citation_title');
  const authors = getAll('citation_author');
  const journal = get('citation_journal_title') || get('citation_conference_title');
  const date =
    get('citation_publication_date') || get('citation_date') || get('citation_online_date');
  const doi = get('citation_doi');
  const publisher = get('citation_publisher');
  const volume = get('citation_volume');
  const issue = get('citation_issue');
  const firstpage = get('citation_firstpage');
  const lastpage = get('citation_lastpage');
  const isbn = get('citation_isbn');
  const issn = get('citation_issn');

  // Only return an object if at least one meaningful field was found.
  if (!title && authors.length === 0 && !journal && !doi && !date) {
    return null;
  }

  let pages = '';
  if (firstpage) {
    pages = lastpage ? `${firstpage}-${lastpage}` : firstpage;
  }

  return {
    title,
    authors,
    journal,
    // Highwire dates are often YYYY/MM/DD; normalise the separator for ISO-ish parsing.
    date: date.replace(/\//g, '-'),
    doi: doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, ''),
    publisher,
    volume,
    issue,
    pages,
    isbn,
    issn,
  };
}

/**
 * Extract OpenGraph metadata
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractOpenGraph(doc) {
  const ogTags = doc.querySelectorAll('meta[property^="og:"], meta[property^="article:"]');
  if (ogTags.length === 0) {
    return null;
  }

  const og = {};
  ogTags.forEach(tag => {
    const property = tag.getAttribute('property');
    const content = tag.getAttribute('content');
    if (property && content) {
      // Convert property to camelCase: og:title -> ogTitle
      const key = property
        .replace(/:/g, '_')
        .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      og[key] = content;
    }
  });

  return Object.keys(og).length > 0 ? og : null;
}

/**
 * Extract Dublin Core metadata
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractDublinCore(doc) {
  const dcTags = doc.querySelectorAll('meta[name^="DC."], meta[name^="dc."]');
  if (dcTags.length === 0) {
    return null;
  }

  const dc = {};
  dcTags.forEach(tag => {
    const name = tag.getAttribute('name');
    const content = tag.getAttribute('content');
    if (name && content) {
      // Convert name to camelCase: DC.title -> dcTitle
      const key = name
        .replace(/^DC\./i, 'dc')
        .replace(/\.([a-z])/g, (_, letter) => letter.toUpperCase());
      dc[key] = content;
    }
  });

  return Object.keys(dc).length > 0 ? dc : null;
}

/**
 * Extract JSON-LD structured data
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractJSONLD(doc) {
  const jsonLDScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  if (jsonLDScripts.length === 0) {
    return null;
  }

  try {
    // Try to find Schema.org Article or WebPage
    for (const script of jsonLDScripts) {
      const data = JSON.parse(script.textContent);

      // Handle @graph arrays
      if (data['@graph']) {
        const article = data['@graph'].find(
          item =>
            item['@type'] === 'Article' ||
            item['@type'] === 'WebPage' ||
            item['@type'] === 'NewsArticle'
        );
        if (article) {
          return article;
        }
      }

      // Handle direct objects
      if (data['@type']) {
        return data;
      }
    }
  } catch (error) {
    console.warn('[Citation] JSON-LD parsing error:', error);
  }

  return null;
}

/**
 * Extract COinS (ContextObjects in Spans) metadata
 * COinS is used by academic sites to embed citation data
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractCOinS(doc) {
  const coinsSpan = doc.querySelector('span.Z3988');
  if (!coinsSpan) {
    return null;
  }

  const title = coinsSpan.getAttribute('title');
  if (!title) {
    return null;
  }

  const coins = {};
  const params = new URLSearchParams(title);

  // Map COinS fields to our format
  coins.title = params.get('rft.title') || params.get('rft.atitle');
  coins.author = params.get('rft.au') || params.get('rft.aulast');
  coins.date = params.get('rft.date');
  coins.publisher = params.get('rft.pub');
  coins.isbn = params.get('rft.isbn');
  coins.issn = params.get('rft.issn');
  coins.doi = params.get('rft_id')?.replace('info:doi/', '');

  return Object.values(coins).some(v => v) ? coins : null;
}

/**
 * Extract standard HTML meta tags
 * @param {Document} doc
 * @returns {Object}
 */
function extractHTMLMeta(doc) {
  const html = {
    title:
      doc.title ||
      doc.querySelector('title')?.textContent?.trim() ||
      doc.querySelector('h1')?.textContent?.trim() ||
      '',
    description: doc.querySelector('meta[name="description"]')?.content || '',
    author: doc.querySelector('meta[name="author"]')?.content || '',
    keywords: doc.querySelector('meta[name="keywords"]')?.content || '',
    canonical: doc.querySelector('link[rel="canonical"]')?.href || window.location.href,
  };

  return html;
}

/**
 * Extract DOI (Digital Object Identifier) from page
 * Checks multiple sources: meta tags, text content, URL
 * @param {Document} doc
 * @returns {string|null}
 */
function extractDOI(doc) {
  // Check meta tags
  const doiMeta = doc.querySelector(
    'meta[name="citation_doi"], meta[name="DC.identifier"], meta[property="citation_doi"]'
  );
  if (doiMeta) {
    const content = doiMeta.getAttribute('content');
    if (content) {
      return content.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');
    }
  }

  // Check for DOI in page text (common patterns)
  const doiRegex = /10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/gi;
  const bodyText = doc.body?.textContent || '';
  const doiMatch = bodyText.match(doiRegex);
  if (doiMatch) {
    return doiMatch[0];
  }

  // Check URL
  const urlMatch = window.location.href.match(doiRegex);
  if (urlMatch) {
    return urlMatch[0];
  }

  return null;
}

/**
 * Merge all extracted metadata into a unified citation object
 * Priority: JSON-LD > OpenGraph > Dublin Core > COinS > HTML
 * @param {ExtractedMetadata} metadata
 * @param {string} url - Current page URL
 * @returns {Partial<CitationMetadata>}
 */
export function mergeMetadata(metadata, url = window.location.href) {
  const hw = metadata.highwire || {};

  const citation = {
    url,
    title: '',
    authors: [],
    publicationDate: '',
    publisher: '',
    siteName: '',
    doi: hw.doi || metadata.doi || '',
  };

  // Extract title (priority order — Highwire citation_title wins for academic pages)
  citation.title =
    hw.title ||
    metadata.jsonLD?.headline ||
    metadata.jsonLD?.name ||
    metadata.openGraph?.ogTitle ||
    metadata.dublinCore?.dcTitle ||
    metadata.coins?.title ||
    metadata.html?.title ||
    '';

  // Guarantee a non-empty title so a save never fails validation. Fall back to the page
  // hostname, then a generic placeholder the user can edit.
  if (!citation.title) {
    try {
      citation.title = new URL(url).hostname || 'Untitled page';
    } catch {
      citation.title = 'Untitled page';
    }
  }

  // Extract authors
  const authorSources = [
    hw.authors && hw.authors.length > 0 ? hw.authors : null,
    metadata.jsonLD?.author?.name,
    metadata.jsonLD?.author,
    metadata.openGraph?.articleAuthor || metadata.openGraph?.ogArticleAuthor,
    metadata.dublinCore?.dcCreator,
    metadata.coins?.author,
    metadata.html?.author,
  ];

  for (const source of authorSources) {
    if (source) {
      if (Array.isArray(source)) {
        citation.authors = source.map(a => (typeof a === 'object' ? a.name : a));
      } else if (typeof source === 'string') {
        citation.authors = parseAuthorString(source);
      }
      break;
    }
  }

  // If no authors found, use "Anon."
  if (citation.authors.length === 0) {
    citation.authors = ['Anon.'];
  }

  // Extract publication date
  citation.publicationDate =
    hw.date ||
    metadata.jsonLD?.datePublished ||
    metadata.openGraph?.articlePublishedTime ||
    metadata.openGraph?.ogArticlePublishedTime ||
    metadata.dublinCore?.dcDate ||
    metadata.coins?.date ||
    '';

  // Extract publisher
  citation.publisher =
    hw.publisher ||
    metadata.jsonLD?.publisher?.name ||
    metadata.dublinCore?.dcPublisher ||
    metadata.coins?.publisher ||
    '';

  // Site/container name — Highwire journal title is the container for academic articles.
  citation.siteName =
    hw.journal ||
    metadata.openGraph?.ogSiteName ||
    metadata.jsonLD?.publisher?.name ||
    safeHostname(url);

  // Carry journal article fields through (normalizeCitation moves these into extra.*).
  if (hw.volume) {
    citation.volume = hw.volume;
  }
  if (hw.issue) {
    citation.issue = hw.issue;
  }
  if (hw.pages) {
    citation.pages = hw.pages;
  }
  if (hw.isbn) {
    citation.isbn = hw.isbn;
  }
  if (hw.issn) {
    citation.issn = hw.issn;
  }

  // Infer an academic type when Highwire identifies a journal/conference container.
  if (hw.journal) {
    citation.type = 'journal';
  }

  return citation;
}

/**
 * Hostname for a URL, or '' if it cannot be parsed.
 * @param {string} url
 * @returns {string}
 */
function safeHostname(url) {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

/**
 * Parse author string into array
 * Handles multiple formats: "Smith, John", "John Smith", "Smith, J. and Doe, M."
 * @param {string} authorString
 * @returns {Array<string>}
 */
function parseAuthorString(authorString) {
  if (!authorString) {
    return [];
  }

  return authorString
    .split(/\s+and\s+|\s*;\s*|\s*,\s*(?=[A-Z])/)
    .map(a => a.trim())
    .filter(a => a.length > 0);
}

/**
 * Check if current page is a PDF
 * @returns {boolean}
 */
export function isPDF() {
  return (
    window.location.href.endsWith('.pdf') ||
    document.contentType === 'application/pdf' ||
    document.querySelector('embed[type="application/pdf"]') !== null
  );
}

/**
 * Extract metadata from PDF page
 * For PDF.js viewer or Chrome's built-in PDF viewer
 * @returns {Partial<CitationMetadata>}
 */
export function extractPDFMetadata() {
  const url = window.location.href;
  const filename = url.split('/').pop().split('#')[0];
  const title = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');

  return {
    url,
    title,
    authors: ['Anon.'],
    publicationDate: '',
    publisher: '',
    siteName: 'PDF Document',
  };
}

export default {
  extractMetadata,
  mergeMetadata,
  isPDF,
  extractPDFMetadata,
};
