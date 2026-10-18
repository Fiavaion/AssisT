/**
 * CrossRef metadata for a DOI.
 *
 * CrossRef is a free service that holds the publisher's own record for academic publications.
 * The lookup is made by the service worker once the student has allowed CrossRef (ADR 0006); this
 * module asks for it and turns the record into citation metadata.
 */

import { normalizeType } from './citation-types.js';
import { todayLocal } from './citation-model.js';
import { requestThirdParty } from '../../utils/third-party-client.js';
import { cleanDOI, isValidDOI } from '../../utils/doi.js';

export { isValidDOI };

/**
 * Look up a DOI and say what happened.
 *
 * @param {string} doi - a DOI, with or without a doi.org link prefix
 * @param {Object} [options]
 * @param {boolean} [options.ask=true] - false for a lookup the student did not start, which must
 *   never open the consent panel
 * @returns {Promise<{status: 'found'|'not-found'|'declined'|'invalid'|'failed', metadata: Object|null}>}
 */
export async function lookUpDOI(doi, { ask = true } = {}) {
  if (!isValidDOI(doi)) {
    return { status: 'invalid', metadata: null };
  }
  const clean = cleanDOI(doi);
  const reply = await requestThirdParty('citations', { doi: clean }, { ask, detail: clean });

  if (reply.success) {
    return { status: 'found', metadata: parseCrossRefResponse({ message: reply.data.work }) };
  }
  // A host Chrome does not hold is no consent (ADR 0009); it only arrives here with ask: false.
  if (['consent-declined', 'consent-unasked', 'permission-missing'].includes(reply.code)) {
    return { status: 'declined', metadata: null };
  }
  if (reply.code === 'not-found') {
    return { status: 'not-found', metadata: null };
  }
  console.error('[CrossRef] Lookup failed:', reply.code, reply.error);
  return { status: 'failed', metadata: null };
}

/**
 * Metadata from CrossRef for a DOI, or null when there is none to be had (not found, not allowed,
 * or the lookup failed).
 * @param {string} doi - Digital Object Identifier (e.g., "10.1000/xyz123")
 * @param {{ask?: boolean}} [options] - see lookUpDOI
 * @returns {Promise<Object|null>}
 */
export async function fetchDOIMetadata(doi, options) {
  return (await lookUpDOI(doi, options)).metadata;
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

  // Preserve the fine-grained CrossRef type as a sub-type; the canonical type is derived
  // from it. Journal/book metadata is stored on siteName + extra.* so it survives
  // createCitation (the data model only persists siteName + extra, not flat journal fields).
  const subtype = mapCrossRefType(message.type);
  const containerTitle = message['container-title']?.[0] || '';
  const metadata = {
    title: message.title?.[0] || '',
    authors: [],
    publicationDate: '',
    publisher: message.publisher || '',
    doi: message.DOI || '',
    type: normalizeType(subtype),
    siteName: containerTitle, // journal/book/container title
    extra: {
      subtype,
      volume: message.volume || '',
      issue: message.issue || '',
      pages: message.page || '',
      // Provenance the UI can trust: these details are the publisher's own record, not a guess
      // scraped off a page. The wizard's verification lock reads this and nothing else.
      verified: { source: 'crossref', at: new Date().toISOString() },
    },
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
    // CrossRef gives an organisation as `name` alone, where a person has family and given names.
    const organisations = message.author
      .filter(author => author.name && !author.family)
      .map(author => author.name);
    if (organisations.length) {
      metadata.extra.organisationAuthors = organisations;
    }
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
    metadata.accessDate = todayLocal();
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
 * The metadata fields CrossRef itself can vouch for. A record's `extra.verified.fields` lists the
 * subset CrossRef actually supplied on a given lookup, and the wizard locks exactly those — never a
 * page guess wearing CrossRef's name. `type` is absent on purpose: the canonical type is the
 * student's own categorisation (CrossRef's own is kept on `extra.subtype`).
 */
export const VERIFIED_FIELD_KEYS = Object.freeze([
  'title',
  'authors',
  'publicationDate',
  'url',
  'doi',
  'siteName',
  'publisher',
]);

/**
 * True when CrossRef actually returned something for a field, rather than an empty placeholder.
 * @param {string|string[]|undefined} value
 * @returns {boolean}
 */
function hasValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return String(value === undefined || value === null ? '' : value).trim().length > 0;
}

/**
 * Enrich existing citation metadata with CrossRef data.
 *
 * For the fields CrossRef vouches for, CrossRef's own record wins wherever it supplied a value —
 * a page-scraped title like "Attention Is All You Need | ExampleBlog" is a guess, and stamping it
 * "verified" would be a lie. Page values fill only the gaps CrossRef left. Everything else (the
 * student's type choice, notes, tags) is untouched, and `extra.verified.fields` records exactly
 * which keys came from CrossRef so the UI can claim those and no others.
 *
 * @param {Object} existingMetadata - Current citation metadata
 * @param {string} doi - DOI to lookup
 * @returns {Promise<Object>} - Enriched metadata
 */
export async function enrichMetadataWithDOI(existingMetadata, doi) {
  const crossrefData = await fetchDOIMetadata(doi);
  if (!crossrefData) {
    return existingMetadata;
  }

  const merged = { ...crossrefData, ...existingMetadata };

  // CrossRef wins per verified key when it has one; the page fills the rest.
  const fields = [];
  for (const key of VERIFIED_FIELD_KEYS) {
    if (hasValue(crossrefData[key])) {
      merged[key] = crossrefData[key];
      fields.push(key);
    }
  }

  // Prefer CrossRef's specific type when the page only had a generic guess.
  const existingType = String(existingMetadata.type || '').toLowerCase();
  const existingTypeIsGeneric = ['', 'website', 'webpage', 'other', 'pdf'].includes(existingType);
  merged.type = existingTypeIsGeneric ? crossrefData.type : existingMetadata.type;

  // Journal metadata (volume/issue/pages/subtype) merges per key with existing values winning,
  // except the provenance mark: this lookup just happened, so a stale mark on the incoming record
  // must not outlive it.
  merged.extra = {
    ...(crossrefData.extra || {}),
    ...(existingMetadata.extra || {}),
    verified: { ...(crossrefData.extra?.verified || {}), fields },
  };
  // Which authors are organisations goes with the authors: when CrossRef's list replaced the
  // page's, the page's say on it describes names that are no longer there.
  if (fields.includes('authors')) {
    if (crossrefData.extra?.organisationAuthors) {
      merged.extra.organisationAuthors = crossrefData.extra.organisationAuthors;
    } else {
      delete merged.extra.organisationAuthors;
    }
  }

  // Always keep the DOI that was looked up, even if the record itself omitted one.
  merged.doi = merged.doi || doi;

  return merged;
}

export default {
  lookUpDOI,
  fetchDOIMetadata,
  enrichMetadataWithDOI,
  isValidDOI,
};
