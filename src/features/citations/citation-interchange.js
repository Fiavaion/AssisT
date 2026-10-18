/**
 * Reading what other reference managers write: BibTeX and RIS.
 *
 * A student arriving from Zotero, Mendeley or EndNote brings an export file, and the whole point of
 * importing is that nothing has to be retyped. So both parsers here return records already in the
 * citation model's shape — canonical `type`, "Family, Given" authors, container on `siteName`,
 * volume/issue/pages/place/edition/editors on `extra` — rather than the flat `year`/`journal` keys
 * the storage layer would silently drop. An author the file names as an organisation (BibTeX
 * braces, an RIS name without a comma) is listed on `extra.organisationAuthors`, so every style
 * prints it whole.
 *
 * Pure string functions: no DOM, no Chrome APIs, no I/O, so the citation core stays portable.
 *
 * @module features/citations/citation-interchange
 */

import {
  canonicalName,
  splitAuthorList,
  isOrganisation,
  organisationsAmong,
} from './author-names.js';
import { splitQuoteNote } from './citation-quote-note.js';
import { todayLocal } from './citation-model.js';

/* ─────────────────────────── shared record shape ─────────────────────────── */

/**
 * Assemble a parsed record in the citation-model shape, dropping every empty field so a record
 * never carries keys it has no value for.
 * @param {Object} parts - loose fields gathered by a parser
 * @returns {Object} a `createCitation`-compatible record
 */
function toRecord(parts) {
  const extra = {};
  for (const key of [
    'volume',
    'issue',
    'pages',
    'place',
    'edition',
    'editors',
    'institution',
    'thesisType',
    'chapter',
    'subtype',
    'organisationAuthors',
  ]) {
    const value = parts[key];
    if (Array.isArray(value) ? value.length > 0 : value) {
      extra[key] = value;
    }
  }

  // A quote AssisT exported as the last line of the note comes back as the quote, once.
  const { notes, quote, locator } = splitQuoteNote(parts.notes);
  const captured = quote ? { quote, locator } : {};

  return {
    type: parts.type || 'website',
    title: parts.title || '',
    authors: parts.authors || [],
    publicationDate: parts.publicationDate || '',
    accessDate: parts.accessDate || todayLocal(),
    publisher: parts.publisher || '',
    siteName: parts.siteName || '',
    url: parts.url || '',
    doi: parts.doi || '',
    isbn: parts.isbn || '',
    issn: parts.issn || '',
    notes,
    ...captured,
    tags: parts.tags || [],
    extra,
    createdAt: Date.now(),
  };
}

/** Month names and abbreviations as BibTeX and bibliographies write them. */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Month number (1-12) from a BibTeX month macro, name or number; 0 when it is not a month.
 * @param {string} raw
 * @returns {number}
 */
function monthNumber(raw) {
  const token = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!token) {
    return 0;
  }
  if (/^\d{1,2}$/.test(token)) {
    const n = Number(token);
    return n >= 1 && n <= 12 ? n : 0;
  }
  return MONTHS.indexOf(token.slice(0, 3)) + 1;
}

/**
 * Normalise a stated date to ISO, keeping only the precision given: "2020/09/16" and "2020-9-16"
 * become "2020-09-16", "2020/09" becomes "2020-09", "2020" stays "2020".
 * @param {string} raw
 * @returns {string}
 */
function isoDate(raw) {
  const match = String(raw || '')
    .trim()
    .match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/);
  if (!match) {
    return '';
  }
  const parts = [match[1]];
  if (match[2]) {
    parts.push(match[2].padStart(2, '0'));
  }
  if (match[2] && match[3]) {
    parts.push(match[3].padStart(2, '0'));
  }
  return parts.join('-');
}

/**
 * One author name as the styles need it. A name the file protected (BibTeX braces) keeps its
 * reading order when it is an organisation; anything else is canonicalised to "Family, Given".
 * @param {string} raw
 * @param {boolean} [protectedName=false]
 * @returns {Array<string>}
 */
function toNames(raw, protectedName = false) {
  const name = String(raw || '').trim();
  if (!name) {
    return [];
  }
  if (protectedName) {
    return [isOrganisation(name) ? name : canonicalName(name)].filter(Boolean);
  }
  return splitAuthorList(name);
}

/* ──────────────────────────────── BibTeX ─────────────────────────────────── */

/** BibTeX entry type -> canonical citation type. */
const BIBTEX_TYPES = Object.freeze({
  article: 'journal',
  book: 'book',
  booklet: 'book',
  proceedings: 'book',
  inbook: 'chapter',
  incollection: 'chapter',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  inproceedings: 'journal',
  conference: 'journal',
  techreport: 'website',
  manual: 'website',
  misc: 'website',
  online: 'website',
  electronic: 'website',
  unpublished: 'website',
});

/**
 * Academic sub-types that collapse onto a canonical type but must survive a round-trip, so a
 * conference paper is exported as `@inproceedings` again rather than as `@article`.
 */
const BIBTEX_SUBTYPES = Object.freeze({
  inproceedings: 'conference-paper',
  conference: 'conference-paper',
  techreport: 'report',
});

/**
 * Characters BibTeX escapes (\\& and \\{). Each is parked on a private-use code point while the
 * protective braces around the rest of the value are stripped, then put back verbatim.
 */
const PROTECTED = Object.freeze({
  '&': '\uE000',
  '%': '\uE001',
  $: '\uE002',
  '#': '\uE003',
  _: '\uE004',
  '{': '\uE005',
  '}': '\uE006',
});
const UNPROTECT = /[\uE000-\uE006]/g;
const UNPROTECT_MAP = Object.fromEntries(Object.entries(PROTECTED).map(([k, v]) => [v, k]));

/** Combining marks for the accent commands: applied to the letter, then composed with NFC. */
const ACCENTS = Object.freeze({
  "'": '\u0301', // acute
  '`': '\u0300', // grave
  '^': '\u0302', // circumflex
  '"': '\u0308', // diaeresis
  '~': '\u0303', // tilde
  '=': '\u0304', // macron
  '.': '\u0307', // dot above
  H: '\u030B', // double acute
  c: '\u0327', // cedilla
  k: '\u0328', // ogonek
  u: '\u0306', // breve
  v: '\u030C', // caron
  d: '\u0323', // dot below
  b: '\u0331', // macron below
  r: '\u030A', // ring above
});

/** Standalone LaTeX letters and symbols. */
const SYMBOLS = Object.freeze({
  ss: 'ß',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  aa: 'å',
  AA: 'Å',
  o: 'ø',
  O: 'Ø',
  l: 'ł',
  L: 'Ł',
  i: 'ı',
  j: 'ȷ',
  pounds: '£',
  copyright: '©',
  textendash: '–',
  textemdash: '—',
});

/**
 * Decode a BibTeX field value into the text a student expects: escapes resolved, protective braces
 * removed, en-dash ranges reduced to a hyphen.
 * @param {string} raw - the value as written, without its outer braces or quotes
 * @param {{keepPunctuation?: boolean}} [options] - true for URLs and DOIs, where `--` and `~` are data
 * @returns {string}
 */
function decodeLatex(raw, { keepPunctuation = false } = {}) {
  let text = String(raw || '');

  text = text.replace(/\\([&%$#_{}])/g, (_, char) => PROTECTED[char]);

  // An accent over a dotless i or j: \'{\i} -> í
  text = text.replace(
    /\\(['`^"~=.])\s*\{?\\([ij])\}?/g,
    (_, accent, letter) => letter + ACCENTS[accent]
  );
  // Symbol accents, braced or bare: \"{O} and \"O
  text = text.replace(
    /\\(['`^"~=.])\s*(?:\{([A-Za-z])\}|([A-Za-z]))/g,
    (_, accent, braced, bare) => (braced || bare) + ACCENTS[accent]
  );
  // Letter accents, braced only, so \relax and friends are never mistaken for one: \c{c} -> ç
  text = text.replace(
    /\\([Hckudvbr])\s*\{([A-Za-z])\}/g,
    (_, accent, letter) => letter + ACCENTS[accent]
  );
  text = text.replace(
    /\\(ss|ae|AE|oe|OE|aa|AA|pounds|copyright|textendash|textemdash|[oOlLij])(?![a-zA-Z])/g,
    (_, name) => SYMBOLS[name]
  );

  text = text
    .replace(/\\[a-zA-Z]+\s*/g, '') // any command left over, e.g. \emph{x} -> x
    .replace(/\\([^a-zA-Z])/g, '$1') // \\ and escaped punctuation
    .replace(/[{}]/g, '');

  if (!keepPunctuation) {
    text = text.replace(/-{2,}/g, '-').replace(/~/g, ' ');
  }

  return text
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(UNPROTECT, char => UNPROTECT_MAP[char]);
}

/**
 * Index of the brace that closes the one at `open`, or the end of the text when it never closes.
 * @param {string} text
 * @param {number} open
 * @returns {number}
 */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      i++;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return text.length;
}

/**
 * Index of the quote that closes the one at `open` (braces inside it are ignored, as BibTeX
 * requires), or the end of the text.
 * @param {string} text
 * @param {number} open
 * @returns {number}
 */
function matchQuote(text, open) {
  let depth = 0;
  for (let i = open + 1; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      i++;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    } else if (char === '"' && depth === 0) {
      return i;
    }
  }
  return text.length;
}

/**
 * Read one field value — braced, quoted, or a bare word/number — resolving `@string` macros and
 * `#` concatenation.
 * @param {string} text - the entry body
 * @param {number} start - index just after the `=`
 * @param {Map<string, string>} macros
 * @returns {{value: string, next: number}}
 */
function readValue(text, start, macros) {
  const parts = [];
  let i = start;

  for (;;) {
    while (i < text.length && /\s/.test(text[i])) {
      i++;
    }
    if (text[i] === '{') {
      const end = matchBrace(text, i);
      parts.push(text.slice(i + 1, end));
      i = end + 1;
    } else if (text[i] === '"') {
      const end = matchQuote(text, i);
      parts.push(text.slice(i + 1, end));
      i = end + 1;
    } else {
      const wordStart = i;
      while (i < text.length && !/[\s,}#]/.test(text[i])) {
        i++;
      }
      const token = text.slice(wordStart, i);
      if (!token) {
        break;
      }
      parts.push(macros.get(token.toLowerCase()) ?? token);
    }

    while (i < text.length && /\s/.test(text[i])) {
      i++;
    }
    if (text[i] !== '#') {
      break;
    }
    i++;
  }

  return { value: parts.join(''), next: i };
}

/**
 * Split an entry body into its fields (the citation key is skipped).
 * @param {string} body - everything between the entry's outer braces
 * @param {Map<string, string>} macros
 * @returns {Object<string, string>} raw field values, keyed by lower-cased name
 */
function readFields(body, macros) {
  const fields = {};
  let i = body.indexOf(',');
  if (i === -1) {
    return fields;
  }
  i++;

  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) {
      i++;
    }
    const nameStart = i;
    while (i < body.length && /[A-Za-z0-9_:+-]/.test(body[i])) {
      i++;
    }
    const name = body.slice(nameStart, i).toLowerCase();
    while (i < body.length && /\s/.test(body[i])) {
      i++;
    }
    if (!name || body[i] !== '=') {
      const nextComma = body.indexOf(',', i);
      if (nextComma === -1) {
        break;
      }
      i = nextComma + 1;
      continue;
    }

    const { value, next } = readValue(body, i + 1, macros);
    fields[name] = value;
    i = next;
    while (i < body.length && body[i] !== ',') {
      i++;
    }
    i++;
  }

  return fields;
}

/**
 * Split a BibTeX author or editor list on the "and" separators that are not inside braces, so a
 * protected organisation ("{World Health Organization}") stays one author.
 * @param {string} raw
 * @returns {Array<{text: string, protected: boolean}>}
 */
function splitBibTeXNames(raw) {
  const pieces = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && /\s/.test(char) && /^and\s/i.test(raw.slice(i + 1))) {
      pieces.push(current);
      current = '';
      i += 3;
      continue;
    }
    current += char;
  }
  pieces.push(current);

  return pieces
    .map(piece => piece.trim())
    .filter(Boolean)
    .map(piece => ({
      text: piece,
      protected: piece.startsWith('{') && matchBrace(piece, 0) === piece.length - 1,
    }));
}

/**
 * The authors in a BibTeX author field, and which of them are organisations. A name in its own
 * braces ("{{World Health Organization}}") is a literal, which is how BibTeX and Zotero write an
 * organisation: it is kept whole. Any other name is canonicalised to "Family, Given".
 * @param {string} raw
 * @returns {{authors: Array<string>, organisationAuthors: Array<string>}}
 */
function bibtexAuthors(raw) {
  const authors = [];
  const organisationAuthors = [];
  for (const piece of splitBibTeXNames(String(raw || ''))) {
    if (piece.protected) {
      const name = decodeLatex(piece.text);
      if (name) {
        authors.push(name);
        organisationAuthors.push(name);
      }
      continue;
    }
    const names = toNames(decodeLatex(piece.text));
    authors.push(...names);
    organisationAuthors.push(...organisationsAmong(names));
  }
  return { authors, organisationAuthors };
}

/**
 * The names in a BibTeX editor field, canonicalised to "Family, Given".
 * @param {string} raw
 * @returns {Array<string>}
 */
function bibtexNames(raw) {
  return splitBibTeXNames(String(raw || '')).flatMap(piece =>
    toNames(decodeLatex(piece.text), piece.protected)
  );
}

/**
 * Parse a BibTeX file into citation records.
 *
 * Entries are read with a balanced-brace scanner rather than a regular expression, because Zotero
 * protects capitals with braces ("{NumPy}") and any `[^}]+` match stops at the first one — which is
 * why such files used to import as nothing at all. `@comment`, `@preamble` and free text between
 * entries are skipped; `@string` macros are resolved; an entry with fields but no title comes back with an empty
 * title, for the importer to report, and an entry with no fields at all is skipped.
 *
 * @param {string} text - the file's contents
 * @returns {Array<Object>} records in the citation-model shape
 */
export function parseBibTeX(text) {
  const source = typeof text === 'string' ? text : '';
  const macros = new Map();
  const records = [];
  let i = 0;

  while (i < source.length) {
    const at = source.indexOf('@', i);
    if (at === -1) {
      break;
    }

    let j = at + 1;
    while (j < source.length && /\s/.test(source[j])) {
      j++;
    }
    const typeStart = j;
    while (j < source.length && /[A-Za-z]/.test(source[j])) {
      j++;
    }
    const entryType = source.slice(typeStart, j).toLowerCase();
    while (j < source.length && /\s/.test(source[j])) {
      j++;
    }
    if (!entryType || (source[j] !== '{' && source[j] !== '(')) {
      i = at + 1;
      continue;
    }

    const end = source[j] === '{' ? matchBrace(source, j) : source.indexOf(')', j);
    const body = source.slice(j + 1, end === -1 ? source.length : end);
    i = end === -1 ? source.length : end + 1;

    if (entryType === 'comment' || entryType === 'preamble') {
      continue;
    }
    if (entryType === 'string') {
      const macro = body.match(/^\s*([A-Za-z0-9_:+-]+)\s*=\s*(.*)$/s);
      if (macro) {
        macros.set(macro[1].toLowerCase(), decodeLatex(macro[2].replace(/^[{"]|[}"]$/g, '')));
      }
      continue;
    }

    // An entry with no fields holds nothing to lose; one with fields but no title is kept, so the
    // importer can say it could not be read.
    const fields = readFields(body, macros);
    if (Object.keys(fields).length > 0) {
      records.push(bibtexRecord(entryType, fields));
    }
  }

  return records;
}

/**
 * Turn one parsed BibTeX entry into a record.
 * @param {string} entryType - e.g. "article", "incollection"
 * @param {Object<string, string>} raw - field values as written
 * @returns {Object} the record; its title is empty when the file gave none
 */
function bibtexRecord(entryType, raw) {
  const field = (...names) => {
    for (const name of names) {
      if (raw[name]) {
        return decodeLatex(raw[name]);
      }
    }
    return '';
  };
  const verbatim = name => (raw[name] ? decodeLatex(raw[name], { keepPunctuation: true }) : '');

  // An untitled entry is still returned, title empty: the importer counts it and names it by its
  // place in the file, where dropping it here would lose it without a word.
  const title = field('title');

  const type = BIBTEX_TYPES[entryType] || 'website';
  const stated = field('date', 'issued');
  const year = field('year').match(/\d{4}/);
  const month = monthNumber(raw.month);
  let publicationDate = isoDate(stated);
  if (!publicationDate && year) {
    publicationDate = month ? `${year[0]}-${String(month).padStart(2, '0')}` : year[0];
  }

  const keywords = field('keywords', 'keyword');

  return toRecord({
    type,
    subtype: BIBTEX_SUBTYPES[entryType] || '',
    title,
    ...bibtexAuthors(raw.author),
    editors: bibtexNames(raw.editor),
    publicationDate,
    accessDate: isoDate(field('urldate', 'accessed')) || undefined,
    publisher: field('publisher', 'organization'),
    siteName: field('journal', 'journaltitle', 'booktitle'),
    url: verbatim('url'),
    doi: verbatim('doi').replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''),
    isbn: field('isbn'),
    issn: field('issn'),
    notes: field('note', 'annote', 'abstract'),
    tags: keywords ? keywords.split(/\s*[,;]\s*/).filter(Boolean) : [],
    volume: field('volume'),
    issue: field('number', 'issue'),
    pages: field('pages'),
    place: field('address', 'location'),
    edition: field('edition'),
    chapter: field('chapter'),
    institution: field('school', 'institution'),
    thesisType: type === 'thesis' ? field('type') || defaultThesisType(entryType) : '',
  });
}

/**
 * The degree a BibTeX thesis entry implies when it does not state one.
 * @param {string} entryType
 * @returns {string}
 */
function defaultThesisType(entryType) {
  if (entryType === 'mastersthesis') {
    return "Master's thesis";
  }
  return entryType === 'phdthesis' ? 'PhD thesis' : '';
}

/* ────────────────────────────────── RIS ──────────────────────────────────── */

/** RIS reference type -> canonical citation type. */
const RIS_TYPES = Object.freeze({
  JOUR: 'journal',
  BOOK: 'book',
  EBOOK: 'book',
  CHAP: 'chapter',
  ECHAP: 'chapter',
  THES: 'thesis',
  CONF: 'journal',
  CPAPER: 'journal',
  RPRT: 'website',
  NEWS: 'newspaper',
  MGZN: 'newspaper',
  ELEC: 'website',
  ICOMM: 'website',
  WEB: 'website',
  VIDEO: 'video',
  MPCT: 'video',
  GEN: 'other',
});

/** RIS types whose SN is an ISSN rather than an ISBN. */
const ISSN_TYPES = new Set(['JOUR', 'MGZN', 'NEWS']);

/** Academic sub-types preserved so an exported record keeps its RIS type. */
const RIS_SUBTYPES = Object.freeze({
  CONF: 'conference-paper',
  CPAPER: 'conference-paper',
  RPRT: 'report',
});

/**
 * Parse an RIS file into citation records.
 *
 * Tolerant of what real exports contain: CRLF line endings, trailing spaces after `ER  -`, and
 * wrapped values continued on the following line. A record without a title comes back with an
 * empty title, for the importer to report.
 *
 * @param {string} text - the file's contents
 * @returns {Array<Object>} records in the citation-model shape
 */
export function parseRIS(text) {
  const lines = String(typeof text === 'string' ? text : '').split(/\r?\n/);
  const records = [];
  let fields = new Map();
  let lastTag = '';

  const flush = () => {
    if (fields.size > 0) {
      records.push(risRecord(fields));
    }
    fields = new Map();
    lastTag = '';
  };

  for (const line of lines) {
    const tagged = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
    if (!tagged) {
      // A wrapped value continues the field above it.
      if (lastTag && line.trim()) {
        const values = fields.get(lastTag);
        values[values.length - 1] = `${values[values.length - 1]} ${line.trim()}`.trim();
      }
      continue;
    }

    const [, tag, value] = tagged;
    if (tag === 'ER') {
      flush();
      continue;
    }
    if (tag === 'TY') {
      flush();
    }
    if (!fields.has(tag)) {
      fields.set(tag, []);
    }
    fields.get(tag).push(value.trim());
    lastTag = tag;
  }
  flush();

  return records;
}

/**
 * The authors of an RIS record, and which of them are organisations. RIS writes a person
 * "Family, Given"; a name with no comma is an organisation's, kept whole, as Zotero reads it.
 * @param {Array<string>} values - the AU and A1 values
 * @returns {{authors: Array<string>, organisationAuthors: Array<string>}}
 */
function risAuthors(values) {
  const authors = [];
  const organisationAuthors = [];
  for (const value of values) {
    const name = value.replace(/\s+/g, ' ').trim();
    if (!name) {
      continue;
    }
    if (name.includes(',')) {
      authors.push(...toNames(name, true));
    } else {
      authors.push(name);
      organisationAuthors.push(name);
    }
  }
  return { authors, organisationAuthors };
}

/**
 * Turn one parsed RIS record into a citation record.
 * @param {Map<string, Array<string>>} fields
 * @returns {Object} the record; its title is empty when the file gave none
 */
function risRecord(fields) {
  const all = tag => fields.get(tag) || [];
  const one = (...tags) => {
    for (const tag of tags) {
      const value = all(tag)[0];
      if (value) {
        return value;
      }
    }
    return '';
  };

  // An untitled record is still returned, title empty: the importer counts it and names it by its
  // place in the file, where dropping it here would lose it without a word.
  const title = one('TI', 'T1', 'CT');

  const risType = (one('TY') || 'GEN').toUpperCase();
  const type = RIS_TYPES[risType] || 'website';

  // PY is the year; DA states the full date when the exporter knows it.
  const year = isoDate(one('PY'));
  const stated = isoDate(one('DA'));
  const publicationDate = stated.length >= year.length ? stated || year : year;

  const start = one('SP');
  const end = one('EP');
  const serial = one('SN');
  const notes = [...all('N1'), ...all('AB')].filter(Boolean).join('\n');
  const publisher = one('PB');
  const authors = risAuthors([...all('AU'), ...all('A1')]);

  return toRecord({
    type,
    subtype: RIS_SUBTYPES[risType] || '',
    title,
    ...authors,
    editors: all('A2').flatMap(name => toNames(name, true)),
    publicationDate,
    accessDate: isoDate(one('Y2')) || undefined,
    publisher,
    siteName: one('T2', 'JO', 'JF', 'T3'),
    url: one('UR'),
    doi: one('DO').replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''),
    isbn: ISSN_TYPES.has(risType) ? '' : serial,
    issn: ISSN_TYPES.has(risType) ? serial : '',
    notes,
    tags: all('KW').filter(Boolean),
    volume: one('VL'),
    issue: one('IS'),
    pages: start && end ? `${start}-${end}` : start,
    place: one('CY', 'PP'),
    edition: one('ET'),
    institution: type === 'thesis' ? publisher : '',
  });
}

export default { parseBibTeX, parseRIS };
