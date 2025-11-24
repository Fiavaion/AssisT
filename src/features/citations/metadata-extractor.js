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
    openGraph: extractOpenGraph(doc),
    dublinCore: extractDublinCore(doc),
    jsonLD: extractJSONLD(doc),
    coins: extractCOinS(doc),
    html: extractHTMLMeta(doc),
    doi: extractDOI(doc),
  };
}

/**
 * Extract OpenGraph metadata
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractOpenGraph(doc) {
  const ogTags = doc.querySelectorAll('meta[property^="og:"], meta[property^="article:"]');
  if (ogTags.length === 0) return null;

  const og = {};
  ogTags.forEach((tag) => {
    const property = tag.getAttribute('property');
    const content = tag.getAttribute('content');
    if (property && content) {
      // Convert property to camelCase: og:title -> ogTitle
      const key = property.replace(/:/g, '_').replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
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
  if (dcTags.length === 0) return null;

  const dc = {};
  dcTags.forEach((tag) => {
    const name = tag.getAttribute('name');
    const content = tag.getAttribute('content');
    if (name && content) {
      // Convert name to camelCase: DC.title -> dcTitle
      const key = name.replace(/^DC\./i, 'dc').replace(/\.([a-z])/g, (_, letter) => letter.toUpperCase());
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
  if (jsonLDScripts.length === 0) return null;

  try {
    // Try to find Schema.org Article or WebPage
    for (const script of jsonLDScripts) {
      const data = JSON.parse(script.textContent);

      // Handle @graph arrays
      if (data['@graph']) {
        const article = data['@graph'].find(
          (item) => item['@type'] === 'Article' || item['@type'] === 'WebPage' || item['@type'] === 'NewsArticle'
        );
        if (article) return article;
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
  if (!coinsSpan) return null;

  const title = coinsSpan.getAttribute('title');
  if (!title) return null;

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
    title: doc.title || doc.querySelector('title')?.textContent || '',
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
    if (content) return content.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');
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
  const citation = {
    url,
    title: '',
    authors: [],
    publicationDate: '',
    publisher: '',
    siteName: '',
    doi: metadata.doi || '',
  };

  // Extract title (priority order)
  citation.title =
    metadata.jsonLD?.headline ||
    metadata.jsonLD?.name ||
    metadata.openGraph?.ogTitle ||
    metadata.dublinCore?.dcTitle ||
    metadata.coins?.title ||
    metadata.html?.title ||
    '';

  // Extract authors
  const authorSources = [
    metadata.jsonLD?.author?.name,
    metadata.jsonLD?.author,
    metadata.openGraph?.articleAuthor ||
      metadata.openGraph?.ogArticleAuthor,
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
    metadata.jsonLD?.datePublished ||
    metadata.openGraph?.articlePublishedTime ||
    metadata.openGraph?.ogArticlePublishedTime ||
    metadata.dublinCore?.dcDate ||
    metadata.coins?.date ||
    '';

  // Extract publisher/site name
  citation.publisher =
    metadata.jsonLD?.publisher?.name ||
    metadata.dublinCore?.dcPublisher ||
    metadata.coins?.publisher ||
    '';

  citation.siteName =
    metadata.openGraph?.ogSiteName ||
    metadata.jsonLD?.publisher?.name ||
    new URL(url).hostname ||
    '';

  return citation;
}

/**
 * Parse author string into array
 * Handles multiple formats: "Smith, John", "John Smith", "Smith, J. and Doe, M."
 * @param {string} authorString
 * @returns {Array<string>}
 */
function parseAuthorString(authorString) {
  if (!authorString) return [];

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
