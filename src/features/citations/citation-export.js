/**
 * Citation Export Module
 *
 * Provides export functionality for citations in multiple formats:
 * - JSON (full data backup)
 * - CSV (spreadsheet compatible)
 * - BibTeX (LaTeX/academic)
 * - RIS (Zotero/EndNote)
 *
 * @module features/citations/citation-export
 * @version 1.1.0
 */

import { CitationStorageRPC as CitationStorage } from './citation-rpc.js';
import { exportAsCSL, importFromCSL } from './citation-csl-io.js';
import { parseBibTeX, parseRIS } from './citation-interchange.js';
import { formatBibliography } from './citation-styles/index.js';
import { showSuccessToast, showErrorToast } from './citation-toast.js';
import { normalizeCitation, getBibTeXType, getRISType } from './citation-types.js';
import { notesWithQuote, quoteNote } from './citation-quote-note.js';
import { doiUrl } from './citation-styles/shared.js';
import { extractYear } from './citation-model.js';

/**
 * The export menu, in the order it is offered: the placeholder first, then one entry per format
 * `exportCitations()` accepts. Every surface that offers an export builds its menu from this —
 * the library header and the selection bar both did it from their own literal list, and a format
 * added to one would silently be missing from the other.
 * @type {Array<[string, string]>}
 */
export const EXPORT_FORMATS = [
  ['', 'Choose format…'],
  ['bibtex', 'BibTeX (.bib)'],
  ['ris', 'RIS (.ris)'],
  ['csl', 'CSL-JSON (.json)'],
  ['csv', 'CSV (.csv)'],
  ['json', 'AssisT JSON (.json)'],
  ['txt', 'Reference list, plain text (.txt)'],
];

/**
 * Export citations as JSON
 * @param {Array} citations - Citations to export
 * @returns {string} JSON string
 */
function exportAsJSON(citations) {
  const items = (citations || []).map(normalizeCitation);
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    source: 'AssisT Extension',
    count: items.length,
    citations: items.map(c => ({
      ...c,
      // Remove internal IDs that may conflict on import
      _exportedId: c.id,
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export citations as CSV
 * @param {Array} citations - Citations to export
 * @returns {string} CSV string
 */
function exportAsCSV(citations) {
  const items = (citations || []).map(normalizeCitation);

  const headers = [
    'Title',
    'Authors',
    'Year',
    'Type',
    'URL',
    'DOI',
    'Publisher',
    'Journal',
    'Volume',
    'Issue',
    'Pages',
    'Access Date',
    'Tags',
    'Notes',
  ];

  const escapeCSV = value => {
    if (!value) {
      return '';
    }
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = items.map(c => [
    escapeCSV(c.title),
    escapeCSV(c.authors.join('; ')),
    escapeCSV(extractYear(c.publicationDate)),
    escapeCSV(c.type),
    escapeCSV(c.url),
    escapeCSV(c.doi),
    escapeCSV(c.publisher),
    escapeCSV(c.siteName),
    escapeCSV(c.extra.volume),
    escapeCSV(c.extra.issue),
    escapeCSV(c.extra.pages),
    escapeCSV(c.accessDate),
    escapeCSV(c.tags.join(', ')),
    // The captured quote and its page ride in the Notes column, after the student's own note.
    escapeCSV(notesWithQuote(c)),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/** BibTeX month macros, in month order. */
const BIBTEX_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/** RIS reference types whose SN line carries an ISSN rather than an ISBN. */
const RIS_ISSN_TYPES = new Set(['JOUR', 'MGZN', 'NEWS']);

/**
 * Export citations as BibTeX
 * @param {Array} citations - Citations to export
 * @returns {string} BibTeX string
 */
function exportAsBibTeX(citations) {
  const items = (citations || []).map(normalizeCitation);

  const escapeBibTeX = str => {
    if (!str) {
      return '';
    }
    return str.replace(/[{}&%$#_^~\\]/g, char => `\\${char}`);
  };

  const formatAuthorBibTeX = (names, organisations = []) => {
    if (!Array.isArray(names) || names.length === 0) {
      return '';
    }
    return names
      .map(name => {
        // An organisation goes in its own braces, BibTeX's literal, so no reader inverts it.
        if (organisations.includes(name.trim())) {
          return `{${escapeBibTeX(name.trim())}}`;
        }
        // If already "Last, First" form, keep it; otherwise convert "First Last" -> "Last, First"
        if (name.includes(',')) {
          return escapeBibTeX(name.trim());
        }
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
          const last = parts.pop();
          return escapeBibTeX(`${last}, ${parts.join(' ')}`);
        }
        return escapeBibTeX(name);
      })
      .join(' and ');
  };

  const generateKey = citation => {
    const author =
      citation.authors[0]
        ?.split(/[,\s]+/)
        .filter(Boolean)
        .pop()
        ?.toLowerCase() || 'anon';
    const year = extractYear(citation.publicationDate) || 'nd';
    const titleWord =
      citation.title
        ?.split(' ')[0]
        ?.toLowerCase()
        ?.replace(/[^a-z]/g, '') || 'untitled';
    return `${author}${year}${titleWord}`;
  };

  return items
    .map(c => {
      const type = getBibTeXType(c);
      const key = generateKey(c);
      const year = extractYear(c.publicationDate);
      const ex = c.extra || {};
      const isChapter = type === 'incollection' || type === 'inbook';
      const isThesis = type === 'phdthesis' || type === 'mastersthesis';
      const fields = [];
      const add = (name, value) => {
        if (value) {
          fields.push(`  ${name} = {${value}}`);
        }
      };

      add('author', formatAuthorBibTeX(c.authors, ex.organisationAuthors));
      add('editor', formatAuthorBibTeX(ex.editors));
      add('title', escapeBibTeX(c.title));
      add('year', year);
      // BibTeX states the month as a macro; a full date has no BibTeX field, so it goes in the
      // biblatex `date` field, which the importer reads back in preference to year + month.
      const month = c.publicationDate.match(/^\d{4}-(\d{2})/);
      if (month) {
        fields.push(`  month = ${BIBTEX_MONTHS[Number(month[1]) - 1]}`);
      }
      add('date', /^\d{4}-\d{2}-\d{2}$/.test(c.publicationDate) ? c.publicationDate : '');
      add(isChapter ? 'booktitle' : 'journal', escapeBibTeX(c.siteName));
      add('publisher', escapeBibTeX(c.publisher));
      add(isThesis ? 'school' : 'institution', escapeBibTeX(ex.institution));
      // For a thesis, BibTeX's `type` field is the degree ("Master's thesis"), not the entry type.
      add('type', isThesis ? escapeBibTeX(ex.thesisType) : '');
      add('address', escapeBibTeX(ex.place));
      add('edition', escapeBibTeX(ex.edition));
      add('chapter', escapeBibTeX(ex.chapter));
      add('volume', ex.volume);
      add('number', ex.issue);
      // BibTeX writes a page range with an en-dash.
      add('pages', ex.pages ? String(ex.pages).replace(/\s*-\s*/, '--') : '');
      add('isbn', c.isbn);
      add('issn', c.issn);
      add('doi', c.doi);
      add('url', c.url);
      add('urldate', c.accessDate);
      // The captured quote and its page go in the note, so they reach Zotero and EndNote.
      add('note', escapeBibTeX(notesWithQuote(c)));
      add('keywords', escapeBibTeX(c.tags.join(', ')));

      return `@${type}{${key},\n${fields.join(',\n')}\n}`;
    })
    .join('\n\n');
}

/**
 * Export citations as RIS (Zotero/EndNote compatible)
 * @param {Array} citations - Citations to export
 * @returns {string} RIS string
 */
function exportAsRIS(citations) {
  const items = (citations || []).map(normalizeCitation);

  return items
    .map(c => {
      const lines = [];
      const type = getRISType(c);
      const year = extractYear(c.publicationDate);

      lines.push(`TY  - ${type}`);

      // Authors (AU tag for each author). An organisation is written whole, with no comma, which
      // is how RIS readers (and our own importer) tell it from a person.
      const organisations = c.extra.organisationAuthors || [];
      if (c.authors.length > 0) {
        c.authors.forEach(author => {
          if (organisations.includes(author.trim())) {
            lines.push(`AU  - ${author.trim()}`);
          } else if (author.includes(',')) {
            // Already "Last, First": emit as-is; otherwise convert
            lines.push(`AU  - ${author.trim()}`);
          } else {
            const parts = author.trim().split(' ');
            if (parts.length >= 2) {
              const last = parts.pop();
              lines.push(`AU  - ${last}, ${parts.join(' ')}`);
            } else {
              lines.push(`AU  - ${author}`);
            }
          }
        });
      }

      // Title
      if (c.title) {
        lines.push(`TI  - ${c.title}`);
      }

      // Publication year
      if (year) {
        lines.push(`PY  - ${year}`);
      }

      // Full publication date, at the precision the record actually has: a year alone stays in PY,
      // because writing DA 2011/01/01 for it would invent a day the source never stated.
      const stated = c.publicationDate.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
      if (stated) {
        lines.push(`DA  - ${stated.slice(1).filter(Boolean).join('/')}`);
      }

      // Editors of the containing book
      (c.extra.editors || []).forEach(editor => {
        lines.push(`A2  - ${editor.trim()}`);
      });

      // Journal / container / site name
      if (c.siteName) {
        lines.push(`JO  - ${c.siteName}`);
        lines.push(`T2  - ${c.siteName}`);
      }

      // Publisher — a thesis states its awarding institution here.
      const publisher = c.publisher || c.extra.institution || '';
      if (publisher) {
        lines.push(`PB  - ${publisher}`);
      }

      // Place of publication
      if (c.extra.place) {
        lines.push(`CY  - ${c.extra.place}`);
      }

      // Edition
      if (c.extra.edition) {
        lines.push(`ET  - ${c.extra.edition}`);
      }

      // Volume
      if (c.extra.volume) {
        lines.push(`VL  - ${c.extra.volume}`);
      }

      // Issue
      if (c.extra.issue) {
        lines.push(`IS  - ${c.extra.issue}`);
      }

      // Pages
      if (c.extra.pages) {
        const pageParts = c.extra.pages.split('-');
        if (pageParts.length === 2) {
          lines.push(`SP  - ${pageParts[0].trim()}`);
          lines.push(`EP  - ${pageParts[1].trim()}`);
        } else {
          lines.push(`SP  - ${c.extra.pages}`);
        }
      }

      if (c.doi) {
        lines.push(`DO  - ${c.doi}`);
      }

      if (c.url) {
        lines.push(`UR  - ${c.url}`);
      }

      // Access date
      if (c.accessDate) {
        lines.push(`Y2  - ${c.accessDate}`);
      }

      // The student's note, then the captured quote and its page as a note of their own, so they
      // reach Zotero and EndNote (read back into the quote by the importer).
      if (c.notes) {
        lines.push(`N1  - ${c.notes}`);
      }
      if (quoteNote(c)) {
        lines.push(`N1  - ${quoteNote(c)}`);
      }

      // Tags as keywords
      if (c.tags.length > 0) {
        c.tags.forEach(tag => {
          lines.push(`KW  - ${tag}`);
        });
      }

      // RIS has one serial-number line: an ISSN on a periodical, an ISBN on anything else.
      const serial = RIS_ISSN_TYPES.has(type) ? c.issn || c.isbn : c.isbn || c.issn;
      if (serial) {
        lines.push(`SN  - ${serial}`);
      }

      // End of record — trailing space required by RIS spec
      lines.push('ER  - ');

      // RIS readers take one tag per physical line, so a line break inside any value (a note
      // written in paragraphs, a pasted title) would split the field and corrupt the record.
      return lines.map(line => line.replace(/\s*[\r\n]+\s*/g, ' ')).join('\n');
    })
    .join('\n\n');
}

/**
 * Download file helper — safe in MV3 popup context.
 * Throws a clear Error if document/URL.createObjectURL is unavailable
 * (e.g. called from a service-worker context).
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType) {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    console.warn('[CitationExport] downloadFile: document or URL.createObjectURL not available');
    throw new Error(
      'downloadFile requires a document context (popup) — cannot run in a service worker'
    );
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all citations to a file
 * @param {string} format - Export format (json, csv, bibtex, ris, csl, txt)
 * @param {Array} citations - Optional specific citations (defaults to all)
 * @param {string} [style] - the student's chosen citation style, which the plain-text
 *   bibliography is formatted in; the other formats carry data, not a formatted reference
 * @param {{pool?: Array}} [options] - pool: the whole library, so each entry in the plain-text
 *   bibliography carries the year letter of its own collection, the one its card copies
 */
async function exportCitations(format, citations = null, style = undefined, { pool } = {}) {
  try {
    const data = citations || (await CitationStorage.getAll());

    if (data.length === 0) {
      showErrorToast('No citations to export');
      return;
    }

    let content, filename, mimeType;

    switch (format.toLowerCase()) {
      case 'json':
        content = exportAsJSON(data);
        filename = 'citations.json';
        mimeType = 'application/json';
        break;

      case 'csv':
        content = exportAsCSV(data);
        filename = 'citations.csv';
        mimeType = 'text/csv';
        break;

      case 'bibtex':
      case 'bib':
        content = exportAsBibTeX(data);
        filename = 'citations.bib';
        mimeType = 'application/x-bibtex';
        break;

      case 'ris':
        content = exportAsRIS(data);
        filename = 'citations.ris';
        mimeType = 'application/x-research-info-systems';
        break;

      case 'csl':
      case 'csl-json':
        content = exportAsCSL(data);
        filename = 'citations.csl.json';
        mimeType = 'application/vnd.citationstyles.csl+json';
        break;

      case 'txt':
      case 'text':
        content = formatBibliography(data, style, { pool });
        filename = 'bibliography.txt';
        mimeType = 'text/plain';
        break;

      default:
        showErrorToast(`Unknown export format: ${format}`);
        return;
    }

    downloadFile(content, filename, mimeType);
    showSuccessToast(`Exported ${data.length} citations as ${format.toUpperCase()}`);
  } catch (error) {
    console.error('[CitationExport] Export error:', error);
    showErrorToast('Failed to export citations');
  }
}

/**
 * Heuristic: does this parsed JSON look like CSL-JSON rather than AssisT's own export? CSL items
 * carry distinctive capitalised identifiers (DOI/URL/ISBN/ISSN) and CSL-only fields (issued,
 * container-title), and AssisT's own CSL export tags items with an `assist:extras` overflow key.
 * AssisT's native shape uses lowercase doi/url/title and string authors, so it never matches.
 * @param {*} data - parsed JSON: an array, a single item, or an { items: [...] } wrapper
 * @returns {boolean}
 */
function looksLikeCSL(data) {
  let first;
  if (Array.isArray(data)) {
    first = data[0];
  } else if (data && Array.isArray(data.items)) {
    first = data.items[0];
  } else if (data && typeof data === 'object' && !data.citations) {
    first = data;
  }
  if (!first || typeof first !== 'object') {
    return false;
  }
  return (
    'DOI' in first ||
    'URL' in first ||
    'ISBN' in first ||
    'ISSN' in first ||
    'issued' in first ||
    'container-title' in first ||
    'assist:extras' in first
  );
}

/**
 * Read the entries out of an import file. Throws when the content cannot be understood — the caller
 * turns that into a sentence; nothing here ever reaches a student.
 * @param {string} content - the file's text
 * @param {string} filename - lower-cased file name (the format is chosen by its extension)
 * @returns {Array|null} the entries found, or null when the extension is not one we import
 */
function parseImportFile(content, filename) {
  if (filename.endsWith('.ris')) {
    return parseRIS(content);
  }
  if (filename.endsWith('.bib') || filename.endsWith('.bibtex')) {
    return parseBibTeX(content);
  }
  if (filename.endsWith('.csl') || filename.endsWith('.csl.json')) {
    return importFromCSL(content);
  }
  if (filename.endsWith('.json')) {
    const data = JSON.parse(content);
    // A .json file may be AssisT's own export or a CSL-JSON file. CSL items use distinctive
    // capitalised keys (DOI/URL/ISBN) and CSL-only fields (issued, container-title), so sniff the
    // first item and route CSL through the adapter; otherwise treat it as the native shape.
    if (looksLikeCSL(data)) {
      return importFromCSL(content);
    }
    const entries = Array.isArray(data)
      ? data
      : data && Array.isArray(data.citations)
        ? data.citations
        : null;
    if (!entries) {
      // A JSON file of some other shape entirely. Refusing it here is what turns the old
      // "s.map is not a function" into something a student can be told.
      throw new Error('This JSON file does not hold a list of citations.');
    }
    // Drop internal IDs that would collide with the ids already in this library.
    return entries.map(entry => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      const cleaned = { ...entry };
      delete cleaned._exportedId;
      delete cleaned.id;
      cleaned.createdAt = Date.now();
      return cleaned;
    });
  }
  return null;
}

/**
 * Give a DOI-bearing entry a resolvable URL when it has none (RIS/BibTeX often omit it), so the
 * reference links out. Entries with neither URL nor DOI still validate on their ISBN.
 * @param {Object} entry
 * @returns {Object}
 */
function withResolvableUrl(entry) {
  // The shared DOI reader finds the DOI however the file wrote it ("doi:", "DOI ", a www. or dx.
  // link), so the link is never https://doi.org/doi:… — and something that is not a DOI gets none.
  const link = entry.url ? '' : doiUrl(entry.doi);
  return link ? { ...entry, url: link } : entry;
}

/** What to call an entry that could not be saved: its title, or where it sat in the file. */
function labelForEntry(entry, index) {
  const title = entry && typeof entry === 'object' ? String(entry.title || '').trim() : '';
  return title || `entry ${index + 1}`;
}

/**
 * What an import attempt actually did, in facts rather than words.
 *
 * The surface that started the import owns the wording — this function says nothing to the student
 * and throws nothing for a bad file. Both used to be true at once (the file-input handler toasted as
 * well), so every import was announced twice, a refused one was announced as a success, and a
 * screen reader read out `s.map is not a function`.
 *
 * @typedef {Object} ImportOutcome
 * @property {string} filename - the file the student picked, as they named it
 * @property {number} added - citations actually saved
 * @property {number} failed - entries found in the file that could not be saved
 * @property {string[]} failedLabels - a title, or "entry 3", for each of those, in file order
 * @property {'unsupported'|'unreadable'|'empty'|null} problem - why nothing could be read, if so
 */

/**
 * Import citations from a file. Every entry is saved on its own, so one unusable record can neither
 * abort the import nor half-write anything.
 * @param {File} file - the file the student chose
 * @returns {Promise<ImportOutcome>}
 */
async function importCitations(file) {
  const outcome = {
    filename: (file && file.name) || 'that file',
    added: 0,
    failed: 0,
    failedLabels: [],
    problem: null,
  };

  let content;
  try {
    content = await file.text();
  } catch (error) {
    console.warn('[CitationExport] Could not read the chosen file:', error);
    outcome.problem = 'unreadable';
    return outcome;
  }

  let entries;
  try {
    entries = parseImportFile(content, outcome.filename.toLowerCase());
  } catch (error) {
    console.warn('[CitationExport] Could not read the import file:', error);
    outcome.problem = 'unreadable';
    return outcome;
  }
  if (entries === null) {
    outcome.problem = 'unsupported';
    return outcome;
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    outcome.problem = 'empty';
    return outcome;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    // Title is the one thing a citation cannot do without, so an untitled entry is reported by its
    // place in the file rather than sent to storage to be refused (or silently dropped by a parser).
    if (!entry || typeof entry !== 'object' || !String(entry.title || '').trim()) {
      outcome.failed++;
      outcome.failedLabels.push(labelForEntry(entry, i));
      continue;
    }
    try {
      // Normalising here — not in storage — is what stops a foreign record's flat `year`/`journal`
      // keys being dropped on the way in.
      await CitationStorage.add(normalizeCitation(withResolvableUrl(entry)));
      outcome.added++;
    } catch (addError) {
      console.warn('[CitationExport] Skipped an entry that could not be saved:', addError);
      outcome.failed++;
      outcome.failedLabels.push(labelForEntry(entry, i));
    }
  }

  return outcome;
}

export {
  exportAsJSON,
  exportAsCSV,
  exportAsBibTeX,
  exportAsRIS,
  looksLikeCSL,
  exportCitations,
  importCitations,
};

export default {
  exportCitations,
  importCitations,
};
