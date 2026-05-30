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

import { CitationStorage } from './citation-storage.js';
import { formatBibliography } from './citation-formatter.js';
import { showSuccessToast, showErrorToast } from './citation-ui.js';
import { normalizeCitation, getBibTeXType, getRISType } from './citation-types.js';
import { extractYear } from './citation-model.js';

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
    escapeCSV(c.notes),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

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

  const formatAuthorBibTeX = authors => {
    if (!authors || authors.length === 0) {
      return '';
    }
    return authors
      .map(author => {
        // If already "Last, First" form, keep it; otherwise convert "First Last" -> "Last, First"
        if (author.includes(',')) {
          return author.trim();
        }
        const parts = author.trim().split(' ');
        if (parts.length >= 2) {
          const last = parts.pop();
          return `${last}, ${parts.join(' ')}`;
        }
        return author;
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
      const fields = [];

      if (c.authors.length > 0) {
        fields.push(`  author = {${formatAuthorBibTeX(c.authors)}}`);
      }
      if (c.title) {
        fields.push(`  title = {${escapeBibTeX(c.title)}}`);
      }
      if (year) {
        fields.push(`  year = {${year}}`);
      }
      if (c.siteName) {
        fields.push(`  journal = {${escapeBibTeX(c.siteName)}}`);
      }
      if (c.publisher) {
        fields.push(`  publisher = {${escapeBibTeX(c.publisher)}}`);
      }
      if (c.extra.volume) {
        fields.push(`  volume = {${c.extra.volume}}`);
      }
      if (c.extra.issue) {
        fields.push(`  number = {${c.extra.issue}}`);
      }
      if (c.extra.pages) {
        fields.push(`  pages = {${c.extra.pages}}`);
      }
      if (c.doi) {
        fields.push(`  doi = {${c.doi}}`);
      }
      if (c.url) {
        fields.push(`  url = {${c.url}}`);
      }
      if (c.accessDate) {
        fields.push(`  urldate = {${c.accessDate}}`);
      }

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

      // Authors (AU tag for each author)
      if (c.authors.length > 0) {
        c.authors.forEach(author => {
          // If already "Last, First", emit as-is; otherwise convert
          if (author.includes(',')) {
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

      // Full publication date
      if (c.publicationDate) {
        const date = new Date(c.publicationDate);
        if (!isNaN(date.getTime())) {
          lines.push(
            `DA  - ${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
          );
        }
      }

      // Journal / container / site name
      if (c.siteName) {
        lines.push(`JO  - ${c.siteName}`);
        lines.push(`T2  - ${c.siteName}`);
      }

      // Publisher
      if (c.publisher) {
        lines.push(`PB  - ${c.publisher}`);
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

      // DOI
      if (c.doi) {
        lines.push(`DO  - ${c.doi}`);
      }

      // URL
      if (c.url) {
        lines.push(`UR  - ${c.url}`);
      }

      // Access date
      if (c.accessDate) {
        lines.push(`Y2  - ${c.accessDate}`);
      }

      // Abstract/Notes
      if (c.notes) {
        lines.push(`N1  - ${c.notes}`);
      }

      // Tags as keywords
      if (c.tags.length > 0) {
        c.tags.forEach(tag => {
          lines.push(`KW  - ${tag}`);
        });
      }

      // ISBN (preserved from raw citation in case present)
      if (c.isbn) {
        lines.push(`SN  - ${c.isbn}`);
      }

      // End of record — trailing space required by RIS spec
      lines.push('ER  - ');

      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * Parse RIS format and import citations
 * @param {string} risContent - RIS format content
 * @returns {Array} Parsed citations
 */
function parseRIS(risContent) {
  const typeMappings = {
    JOUR: 'journal-article',
    BOOK: 'book',
    CHAP: 'book-chapter',
    THES: 'thesis',
    CONF: 'conference-paper',
    RPRT: 'report',
    ELEC: 'website',
    VIDEO: 'video',
    NEWS: 'news-article',
    GEN: 'unknown',
  };

  const records = risContent.split(/ER\s+-\s*/);
  const citations = [];

  for (const record of records) {
    if (!record.trim()) {
      continue;
    }

    const lines = record.split('\n');
    const citation = {
      authors: [],
      tags: [],
      createdAt: Date.now(),
      accessDate: new Date().toISOString().split('T')[0],
    };

    for (const line of lines) {
      const match = line.match(/^([A-Z][A-Z0-9])\s+-\s+(.*)$/);
      if (!match) {
        continue;
      }

      const [, tag, value] = match;
      const trimmedValue = value.trim();

      switch (tag) {
        case 'TY':
          citation.type = typeMappings[trimmedValue] || 'unknown';
          break;
        case 'AU':
        case 'A1': {
          // Convert "Last, First" to "First Last"
          const parts = trimmedValue.split(',');
          if (parts.length >= 2) {
            citation.authors.push(`${parts[1].trim()} ${parts[0].trim()}`);
          } else {
            citation.authors.push(trimmedValue);
          }
          break;
        }
        case 'TI':
        case 'T1':
          citation.title = trimmedValue;
          break;
        case 'PY':
        case 'Y1':
          citation.year = trimmedValue.split('/')[0];
          break;
        case 'JO':
        case 'T2':
          citation.journal = trimmedValue;
          break;
        case 'PB':
          citation.publisher = trimmedValue;
          break;
        case 'VL':
          citation.volume = trimmedValue;
          break;
        case 'IS':
          citation.issue = trimmedValue;
          break;
        case 'SP':
          citation.startPage = trimmedValue;
          break;
        case 'EP':
          citation.endPage = trimmedValue;
          break;
        case 'DO':
          citation.doi = trimmedValue;
          break;
        case 'UR':
          citation.url = trimmedValue;
          break;
        case 'N1':
        case 'AB':
          citation.notes = trimmedValue;
          break;
        case 'KW':
          citation.tags.push(trimmedValue);
          break;
        case 'SN':
          citation.isbn = trimmedValue;
          break;
        default:
          break;
      }
    }

    // Combine start and end pages
    if (citation.startPage) {
      citation.pages = citation.endPage
        ? `${citation.startPage}-${citation.endPage}`
        : citation.startPage;
      delete citation.startPage;
      delete citation.endPage;
    }

    // Only add if we have at least a title
    if (citation.title) {
      citations.push(citation);
    }
  }

  return citations;
}

/**
 * Parse BibTeX format and import citations
 * @param {string} bibtexContent - BibTeX format content
 * @returns {Array} Parsed citations
 */
function parseBibTeX(bibtexContent) {
  const typeMappings = {
    article: 'journal-article',
    book: 'book',
    inbook: 'book-chapter',
    incollection: 'book-chapter',
    phdthesis: 'thesis',
    mastersthesis: 'thesis',
    inproceedings: 'conference-paper',
    conference: 'conference-paper',
    techreport: 'report',
    misc: 'website',
    online: 'website',
    unpublished: 'unknown',
  };

  // Match BibTeX entries
  const entryRegex = /@(\w+)\s*\{\s*([^,]+)\s*,([^}]+)\}/g;
  const citations = [];
  let match;

  while ((match = entryRegex.exec(bibtexContent)) !== null) {
    const [, type, , fieldsStr] = match;
    const citation = {
      type: typeMappings[type.toLowerCase()] || 'unknown',
      authors: [],
      tags: [],
      createdAt: Date.now(),
      accessDate: new Date().toISOString().split('T')[0],
    };

    // Parse fields
    const fieldRegex = /(\w+)\s*=\s*\{([^}]*)\}/g;
    let fieldMatch;

    while ((fieldMatch = fieldRegex.exec(fieldsStr)) !== null) {
      const [, field, value] = fieldMatch;
      const cleanValue = value.replace(/\\/g, '');

      switch (field.toLowerCase()) {
        case 'author':
          // Split on " and " and convert "Last, First" to "First Last"
          citation.authors = cleanValue.split(/\s+and\s+/i).map(author => {
            const parts = author.split(',');
            if (parts.length >= 2) {
              return `${parts[1].trim()} ${parts[0].trim()}`;
            }
            return author.trim();
          });
          break;
        case 'title':
          citation.title = cleanValue;
          break;
        case 'year':
          citation.year = cleanValue;
          break;
        case 'journal':
          citation.journal = cleanValue;
          break;
        case 'publisher':
          citation.publisher = cleanValue;
          break;
        case 'volume':
          citation.volume = cleanValue;
          break;
        case 'number':
          citation.issue = cleanValue;
          break;
        case 'pages':
          citation.pages = cleanValue.replace('--', '-');
          break;
        case 'doi':
          citation.doi = cleanValue;
          break;
        case 'url':
          citation.url = cleanValue;
          break;
        case 'urldate':
          citation.accessDate = cleanValue;
          break;
        case 'keywords':
          citation.tags = cleanValue.split(',').map(t => t.trim());
          break;
        default:
          break;
      }
    }

    if (citation.title) {
      citations.push(citation);
    }
  }

  return citations;
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
 * @param {string} format - Export format (json, csv, bibtex, ris, txt, html)
 * @param {Array} citations - Optional specific citations (defaults to all)
 */
async function exportCitations(format, citations = null) {
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

      case 'txt':
      case 'text':
        content = formatBibliography(data);
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
 * Import citations from a file
 * @param {File} file - File to import
 * @returns {Promise<number>} Number of imported citations
 */
async function importCitations(file) {
  try {
    const content = await file.text();
    const filename = file.name.toLowerCase();
    let citations = [];

    if (filename.endsWith('.ris')) {
      citations = parseRIS(content);
    } else if (filename.endsWith('.bib') || filename.endsWith('.bibtex')) {
      citations = parseBibTeX(content);
    } else if (filename.endsWith('.json')) {
      const data = JSON.parse(content);
      citations = data.citations || data;
      // Clean up imported citations - remove internal IDs that may conflict
      citations = citations.map(c => {
        const cleaned = { ...c };
        delete cleaned._exportedId;
        delete cleaned.id;
        cleaned.createdAt = Date.now();
        return cleaned;
      });
    } else {
      throw new Error('Unsupported file format. Please use .ris, .bib, or .json files.');
    }

    // Save imported citations
    let imported = 0;
    for (const citation of citations) {
      await CitationStorage.add(citation);
      imported++;
    }

    showSuccessToast(`Imported ${imported} citations`);
    return imported;
  } catch (error) {
    console.error('[CitationExport] Import error:', error);
    showErrorToast(`Import failed: ${error.message}`);
    throw error;
  }
}

/**
 * Create full backup of all citation data
 * @returns {Promise<string>} Backup data as JSON string
 */
async function createBackup() {
  try {
    const citations = await CitationStorage.getAll();

    const backup = {
      version: '1.0',
      type: 'full-backup',
      createdAt: new Date().toISOString(),
      source: 'AssisT Extension',
      data: {
        citations,
        count: citations.length,
      },
    };

    const content = JSON.stringify(backup, null, 2);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(content, `assist-backup-${timestamp}.json`, 'application/json');

    showSuccessToast(`Backup created: ${citations.length} citations`);
    return content;
  } catch (error) {
    console.error('[CitationExport] Backup error:', error);
    showErrorToast('Failed to create backup');
    throw error;
  }
}

/**
 * Restore from backup file.
 *
 * The MV3 popup context does not support `confirm()` — it always returns false,
 * silently cancelling restores. Instead, the CALLER opts in to replacement via
 * the `replace` option (default: false = non-destructive merge).
 *
 * @param {File} file - Backup file
 * @param {{ replace?: boolean }} [options={}]
 *   replace=false  → merge backup items into existing store (non-destructive)
 *   replace=true   → clear existing citations first, then restore
 * @returns {Promise<Object>} Restore result: { restored, backupDate } or { cancelled: true }
 */
async function restoreFromBackup(file, { replace = false } = {}) {
  try {
    const content = await file.text();
    const backup = JSON.parse(content);

    if (backup.type !== 'full-backup' || !backup.data?.citations) {
      throw new Error('Invalid backup file format');
    }

    if (replace) {
      // Caller has already confirmed — clear existing store before restoring.
      await CitationStorage.clear();
    }

    let restored = 0;
    for (const citation of backup.data.citations) {
      const citationCopy = { ...citation };
      delete citationCopy.id; // Remove internal ID
      await CitationStorage.add(citationCopy);
      restored++;
    }

    showSuccessToast(`Restored ${restored} citations from backup`);
    return { restored, backupDate: backup.createdAt };
  } catch (error) {
    console.error('[CitationExport] Restore error:', error);
    showErrorToast(`Restore failed: ${error.message}`);
    throw error;
  }
}

export {
  exportAsJSON,
  exportAsCSV,
  exportAsBibTeX,
  exportAsRIS,
  parseRIS,
  parseBibTeX,
  exportCitations,
  importCitations,
  createBackup,
  restoreFromBackup,
};

export default {
  exportCitations,
  importCitations,
  createBackup,
  restoreFromBackup,
};
