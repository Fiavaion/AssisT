/**
 * The one route off the device (ADR 0006).
 *
 * Every request to a third-party service is made here, in the service worker, and nowhere else;
 * `tests/unit/architecture/third-party-hosts.test.js` fails if any other file in `src/` names one of
 * these hosts. Content scripts and extension pages send THIRD_PARTY_REQUEST with a destination name
 * and its parameters, through `utils/third-party-client.js`.
 *
 * This is deliberately not a fetch proxy. A caller never supplies a URL, a header or a method: it
 * names a destination and hands over a word, a text and a language pair, a DOI, a short title, or
 * an OCR language code.
 * The request builder for that destination checks the parameters, builds the exact URL itself, and
 * picks out of the answer only the fields the caller shows. For every request, in this order:
 *
 *   1. unknown destination            -> refused, nothing read, nothing sent
 *   2. parameters malformed           -> refused, consent not even read
 *   3. consent not given (read fresh) -> refused with consent-unasked or consent-declined
 *   4. its optional host permission not held -> refused with permission-missing
 *   5. fetch, then pick
 *
 * Replies use the worker's usual shape: { success: true, data } or
 * { success: false, code, error }, where `error` for a network failure comes from sanitizeError.
 *
 * @module background/third-party-requests
 */

import { getConsent } from '../utils/consent.js';
import { cleanDOI, isValidDOI } from '../utils/doi.js';
import { sanitizeError } from '../utils/sanitize-error.js';
import { readStoredLanguage, storeLanguage } from './ocr-language-store.js';

/** A dictionary looks up a word or a short phrase; the content side already stops at three words. */
const MAX_DICTIONARY_WORDS = 3;
const MAX_DICTIONARY_CHARS = 64;

/** MyMemory refuses more than 500 characters; the content side splits longer text first. */
const MAX_TRANSLATION_CHARS = 500;

/** ISO 639 code with an optional region or script, e.g. en, fil, zh-CN, sr-Latn. */
const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

/** A reference title as the citation analyser extracts it, and how much of it is sent. */
const MAX_TITLE_CHARS = 300;
const SENT_TITLE_CHARS = 120;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** The @tesseract.js-data release every OCR language file is downloaded from (ADR 0008). */
const OCR_LANGUAGE_DATA_VERSION = '1.0.0';

/**
 * Every OCR language file AssisT downloads, with the size and SHA-256 measured from that release on
 * 2026-10-04. English is in the package and is not here. A file that does not match is refused,
 * so a changed file on the CDN never reaches the engine.
 */
export const OCR_LANGUAGE_DOWNLOADS = Object.freeze({
  spa: {
    bytes: 2100190,
    sha256: '40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb',
  },
  fra: {
    bytes: 707406,
    sha256: 'd611139672b3752c7097e671e4a1d9209dfd37f2aeb081ef6487fba3351e9255',
  },
  deu: {
    bytes: 1333102,
    sha256: '306c4280d0cbed46fbff727486bd43b92730181bae80f56941a091f363bdf28b',
  },
  ita: {
    bytes: 1660998,
    sha256: 'f702fcfad297ce028ede3626d1467b67939f23ff23595f9badd54681cf25a4d3',
  },
  por: {
    bytes: 1392239,
    sha256: 'dacebc1386ddaaf8389f81094236cca0d690897cde693d48cbdaa881c86e2b4c',
  },
  nld: {
    bytes: 3005696,
    sha256: 'a2d904b6ddc4feb0d31ecfcd7361a554102e7aa2e278c54f4fc029e0d0815571',
  },
  pol: {
    bytes: 2642356,
    sha256: 'a20fdec4ff99d8f8e84c708da3e42a4e935c26863055a0ed88aef5c66a59b91b',
  },
  rus: {
    bytes: 2679598,
    sha256: 'f51f5edc992249ff9b70a227b22f242dfa47b2b1bbc7ae0ea74908640c101f6a',
  },
  chi_sim: {
    bytes: 1718768,
    sha256: 'b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c',
  },
  chi_tra: {
    bytes: 1656239,
    sha256: '11fe2610dab05d8a880d02f193ce70203f4c4bbe061b987d5529a2c038a22743',
  },
  jpn: {
    bytes: 2030256,
    sha256: '2b63ebfbf1484de4a08ce53b29ef98a1c17658a93cbd38acb665d7d316d0be88',
  },
  kor: {
    bytes: 1572336,
    sha256: '78c21276ab14c9bb734d83be1055d9fe5469a4e7e977c51ad385be5737e61126',
  },
  ara: {
    bytes: 1661906,
    sha256: 'f4746c44b02342dd5b3d4f0198000f47d7c49f1a229e63e0f436c0592dcd9639',
  },
});

/** A 3 MB file on a slow school connection. */
const OCR_LANGUAGE_TIMEOUT_MS = 60000;

/**
 * Every destination's host, each an OPTIONAL host permission in the manifest (ADR 0009). Listed here
 * because this is the only module allowed to name a third-party host; the wizard, the popup, the
 * consent panel and the consent window ask Chrome for these through utils/host-permissions, in the
 * same press as the consent.
 *
 * The keyed cloud AI providers are here too (ADR 0006, and ADR 0007 for Google Gemini). Their
 * requests are not made by this module but by the cloud router, which refuses one whose permission
 * is not held.
 */
const MYMEMORY_ORIGINS = Object.freeze(['https://api.mymemory.translated.net/*']);

export const OPTIONAL_HOST_ORIGINS = Object.freeze({
  dictionary: Object.freeze(['https://api.dictionaryapi.dev/*']),
  translation: MYMEMORY_ORIGINS,
  pageTranslation: MYMEMORY_ORIGINS,
  citations: Object.freeze(['https://api.crossref.org/*']),
  ocrLanguages: Object.freeze(['https://cdn.jsdelivr.net/*']),
  citationVerification: Object.freeze(['https://api.semanticscholar.org/*']),
  anthropic: Object.freeze(['https://api.anthropic.com/*']),
  openai: Object.freeze(['https://api.openai.com/*']),
  google: Object.freeze(['https://generativelanguage.googleapis.com/*']),
  perplexity: Object.freeze(['https://api.perplexity.ai/*']),
});

/**
 * Whether Chrome holds the optional host permission a destination needs. Unreadable is a no.
 * @param {string} destination
 * @returns {Promise<boolean>}
 */
async function holdsHostPermission(destination) {
  const origins = Object.hasOwn(OPTIONAL_HOST_ORIGINS, destination)
    ? OPTIONAL_HOST_ORIGINS[destination]
    : null;
  if (!origins) {
    return true;
  }
  try {
    return (await chrome.permissions.contains({ origins: [...origins] })) === true;
  } catch {
    return false;
  }
}

/** A refusal: carries its own code, so the dispatcher can pass it straight back. */
class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function refuse(code, message) {
  throw new Refusal(code, message);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function strings(list) {
  return Array.isArray(list) ? list.filter(item => typeof item === 'string') : [];
}

/**
 * A Crossref date as whole numbers only: year, then month and day where given. Anything else in
 * the field (a date-time string, a timestamp, a value that is not a number) is dropped, so what a
 * page shows from it can never be markup.
 * @param {*} value - Crossref's `published` or `published-online`
 * @returns {{'date-parts': number[][]}|undefined}
 */
function wholeNumberDate(value) {
  const parts = value && Array.isArray(value['date-parts']) ? value['date-parts'][0] : null;
  if (!Array.isArray(parts)) {
    return undefined;
  }
  const numbers = [];
  for (const part of parts.slice(0, 3)) {
    if (!Number.isInteger(part)) {
      break;
    }
    numbers.push(part);
  }
  return numbers.length > 0 ? { 'date-parts': [numbers] } : undefined;
}

/** An audio link is kept only when it is plain https: it ends up in a play button. */
function httpsOrEmpty(value) {
  return typeof value === 'string' && value.startsWith('https://') ? value : '';
}

/** A GET with no credentials, refused unless it answers 2xx. */
async function getOk(url, timeoutMs) {
  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error && error.name;
    const code = name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
    throw new Refusal(code, sanitizeError(error));
  }
  if (response.status === 404) {
    refuse('not-found', 'Nothing was found');
  }
  if (!response.ok) {
    refuse('http-error', `The service answered ${response.status}`);
  }
  return response;
}

async function getJson(url, timeoutMs) {
  const response = await getOk(url, timeoutMs);
  try {
    return await response.json();
  } catch {
    return refuse('http-error', 'The service sent an answer that could not be read');
  }
}

/**
 * A response body, read no further than `limit` bytes: a body announced as longer is refused
 * before any of it is read, and one that runs past the limit is cancelled, so a wrong file is never
 * buffered whole.
 * @param {Response} response
 * @param {number} limit
 * @returns {Promise<Uint8Array>}
 */
async function readAtMost(response, limit) {
  const announced = Number(response.headers?.get('content-length'));
  if (Number.isFinite(announced) && announced > limit) {
    refuse('integrity', 'The language file was not the one AssisT expects');
  }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(limit);
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return bytes.subarray(0, length);
    }
    if (length + value.byteLength > limit) {
      await reader.cancel().catch(() => {});
      refuse('integrity', 'The language file was not the one AssisT expects');
    }
    bytes.set(value, length);
    length += value.byteLength;
  }
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Bytes as base64, for a runtime message, which carries JSON only. Chunked: a file is ~3 MB. */
function base64FromBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * MyMemory, for a selection and for a whole page alike. The two are separate destinations because
 * the student is asked about them separately: a page sends far more than a selection.
 */
const MYMEMORY = Object.freeze({
  validate(params) {
    const { text, source, target } = params;
    if (!nonEmptyString(text) || text.length > MAX_TRANSLATION_CHARS) {
      refuse('invalid-params', 'Text of up to 500 characters is required');
    }
    if (
      typeof source !== 'string' ||
      typeof target !== 'string' ||
      !LANGUAGE_CODE.test(source) ||
      !LANGUAGE_CODE.test(target) ||
      source === target
    ) {
      refuse('invalid-params', 'Two different language codes are required');
    }
    return { text, source, target };
  },
  async request({ text, source, target }) {
    const query = new URLSearchParams({ q: text, langpair: `${source}|${target}` });
    const data = await getJson(`https://api.mymemory.translated.net/get?${query}`, 15000);
    if (data && data.quotaFinished === true) {
      refuse('quota-exceeded', 'The daily translation limit has been reached');
    }
    if (!data || data.responseStatus !== 200) {
      // The provider's wording can echo the student's text, so only its status is logged, and
      // none of it goes into the reply.
      const status = data ? Number(data.responseStatus) : null;
      console.warn('[AssisT] Translation service refused, status', status);
      refuse('provider-error', 'The translation service could not translate that text');
    }
    const translatedText = data.translatedText || data.responseData?.translatedText;
    if (!nonEmptyString(translatedText)) {
      refuse('provider-error', 'The translation service sent no translation');
    }
    return { translatedText };
  },
});

/**
 * The fixed allowlist. Each builder validates its own parameters, builds its own URL and picks its
 * own answer; nothing here takes a URL from a caller.
 */
const BUILDERS = Object.freeze({
  translation: MYMEMORY,
  pageTranslation: MYMEMORY,

  dictionary: {
    validate(params) {
      const word = params.word;
      if (!nonEmptyString(word) || CONTROL_CHARACTERS.test(word)) {
        refuse('invalid-params', 'A word to look up is required');
      }
      const trimmed = word.trim();
      if (
        trimmed.length > MAX_DICTIONARY_CHARS ||
        trimmed.split(/\s+/).length > MAX_DICTIONARY_WORDS
      ) {
        refuse('invalid-params', 'That is longer than the dictionary looks up');
      }
      return { word: trimmed.toLowerCase() };
    },
    async request({ word }) {
      const entries = await getJson(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        8000
      );
      if (!Array.isArray(entries) || entries.length === 0) {
        refuse('not-found', 'Nothing was found');
      }
      return entries.map(entry => ({
        word: String(entry.word || ''),
        phonetics: (Array.isArray(entry.phonetics) ? entry.phonetics : []).map(p => ({
          text: typeof p.text === 'string' ? p.text : '',
          audio: httpsOrEmpty(p.audio),
        })),
        meanings: (Array.isArray(entry.meanings) ? entry.meanings : []).map(m => ({
          partOfSpeech: String(m.partOfSpeech || ''),
          definitions: (Array.isArray(m.definitions) ? m.definitions : []).map(d => ({
            definition: String(d.definition || ''),
            ...(typeof d.example === 'string' ? { example: d.example } : {}),
          })),
          synonyms: strings(m.synonyms),
          antonyms: strings(m.antonyms),
        })),
      }));
    },
  },

  citations: {
    validate(params) {
      if (!isValidDOI(params.doi)) {
        refuse('invalid-params', 'A DOI is required');
      }
      return { doi: cleanDOI(params.doi) };
    },
    async request({ doi }) {
      const data = await getJson(
        `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
        10000
      );
      const m = data && data.message;
      if (!m || typeof m !== 'object') {
        refuse('not-found', 'Nothing was found');
      }
      // Crossref's own field names, only the ones a citation is built from.
      const work = {
        type: m.type,
        title: strings(m.title),
        author: (Array.isArray(m.author) ? m.author : []).map(a => {
          const person = {};
          for (const key of ['given', 'family', 'name']) {
            if (typeof a[key] === 'string') {
              person[key] = a[key];
            }
          }
          return person;
        }),
        'container-title': strings(m['container-title']),
        publisher: m.publisher,
        DOI: m.DOI,
        volume: m.volume,
        issue: m.issue,
        page: m.page,
        published: wholeNumberDate(m.published),
        'published-online': wholeNumberDate(m['published-online']),
        ISSN: strings(m.ISSN),
        ISBN: strings(m.ISBN),
        URL: m.URL,
      };
      return { work };
    },
  },

  // An OCR language file (ADR 0008): a public file, named by a language from a fixed list, checked
  // against its pinned hash and kept so it is downloaded once. Nothing from the page is sent.
  ocrLanguages: {
    validate(params) {
      const lang = params.lang;
      if (typeof lang !== 'string' || !Object.hasOwn(OCR_LANGUAGE_DOWNLOADS, lang)) {
        refuse('invalid-params', 'A language AssisT can download is required');
      }
      return { lang };
    },
    async request({ lang }) {
      const kept = await readStoredLanguage(lang);
      if (kept) {
        return { lang, base64: base64FromBytes(kept) };
      }
      const pinned = OCR_LANGUAGE_DOWNLOADS[lang];
      const response = await getOk(
        `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}@${OCR_LANGUAGE_DATA_VERSION}` +
          `/4.0.0_best_int/${lang}.traineddata.gz`,
        OCR_LANGUAGE_TIMEOUT_MS
      );
      const bytes = await readAtMost(response, pinned.bytes);
      if (bytes.byteLength !== pinned.bytes || (await sha256Hex(bytes)) !== pinned.sha256) {
        refuse('integrity', 'The language file was not the one AssisT expects');
      }
      // A file that could not be kept is still used; it is downloaded again next time.
      await storeLanguage(lang, bytes);
      return { lang, base64: base64FromBytes(bytes) };
    },
  },

  citationVerification: {
    validate(params) {
      const title = params.title;
      if (typeof title !== 'string' || title.length > MAX_TITLE_CHARS) {
        refuse('invalid-params', 'A short title is required');
      }
      const query = title
        .substring(0, SENT_TITLE_CHARS)
        .replace(/[^\w\s]/g, ' ')
        .trim();
      if (!query) {
        refuse('invalid-params', 'A short title is required');
      }
      return { query };
    },
    async request({ query }) {
      const search = new URLSearchParams({
        query,
        fields: 'title,authors,year,venue,externalIds',
        limit: '1',
      });
      const data = await getJson(
        `https://api.semanticscholar.org/graph/v1/paper/search?${search}`,
        10000
      );
      const p = data && Array.isArray(data.data) ? data.data[0] : null;
      if (!p) {
        refuse('not-found', 'Nothing was found');
      }
      return {
        paper: {
          paperId: String(p.paperId || ''),
          title: String(p.title || ''),
          authors: (Array.isArray(p.authors) ? p.authors : [])
            .map(a => a && a.name)
            .filter(name => typeof name === 'string'),
          year: typeof p.year === 'number' ? p.year : null,
          venue: String(p.venue || ''),
          doi: p.externalIds?.DOI || null,
        },
      };
    },
  },
});

/**
 * Make one request to a named destination, if the student has said yes to it.
 *
 * @param {string} destination - a key of BUILDERS
 * @param {Object} params - that destination's parameters
 * @returns {Promise<{success: true, data: Object} | {success: false, code: string, error: string, destination?: string}>}
 */
export async function performThirdPartyRequest(destination, params) {
  const builder =
    typeof destination === 'string' && Object.hasOwn(BUILDERS, destination)
      ? BUILDERS[destination]
      : null;
  if (!builder) {
    return { success: false, code: 'unknown-destination', error: 'Unknown destination' };
  }

  try {
    const safe = builder.validate(params && typeof params === 'object' ? params : {});

    const consent = await getConsent(destination);
    if (consent !== 'granted') {
      return {
        success: false,
        code: consent === 'declined' ? 'consent-declined' : 'consent-unasked',
        destination,
        error: 'The student has not allowed this service',
      };
    }

    // Every destination is behind an optional host permission (ADR 0009) and needs Chrome to
    // hold it, so the manifest's "optional" means the request does not happen without it.
    if (!(await holdsHostPermission(destination))) {
      return {
        success: false,
        code: 'permission-missing',
        destination,
        error: 'AssisT has not been given access to this service',
      };
    }

    return { success: true, data: await builder.request(safe) };
  } catch (error) {
    if (error instanceof Refusal) {
      return { success: false, code: error.code, error: error.message };
    }
    return { success: false, code: 'failed', error: sanitizeError(error) };
  }
}

/**
 * The worker's message handler for THIRD_PARTY_REQUEST.
 *
 * @param {Object} message
 * @param {Function} sendResponse
 * @returns {boolean} true when the message was this handler's (the reply is asynchronous)
 */
export function handleThirdPartyMessage(message, sendResponse) {
  if (!message || message.type !== 'THIRD_PARTY_REQUEST') {
    return false;
  }
  performThirdPartyRequest(message.destination, message.params).then(sendResponse);
  return true;
}
