/**
 * The language a capture is read in (ADR 0008).
 *
 * English ships in the package. Any other language's file is asked of the service worker, the one
 * route off the device (`background/third-party-requests.js`), which downloads it once after the
 * student allows jsDelivr and keeps it in the extension's own storage. Here the bytes become a
 * blob: URL in the page, which tesseract.js reads as `langPath`: it appends
 * `/<lang>.traineddata.gz`, and after the `#` that is a fragment, which a fetch ignores. The bytes
 * are data the engine reads, never code.
 *
 * A no, or no connection, reads the capture as English and says why, so Read from Images always
 * does something; after a no, the result offers Allow in place.
 *
 * @module features/ocr/ocr-language-data
 */

import { requestThirdParty } from '../../utils/third-party-client.js';
import {
  BUNDLED_OCR_LANGUAGES,
  OCR_LANGUAGE_NAMES,
  bundledLanguagePath,
} from './ocr-engine-files.js';

const ENGLISH = 'eng';

function nothing() {}

function bundled(code) {
  return {
    language: { code, langPath: bundledLanguagePath(code) },
    release: nothing,
    notice: null,
    declined: false,
  };
}

function bytesFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * What a student is told when their language could not be used. After a no, the result dialog
 * shows the declined notice under this, with its own Allow, so this does not say where to go.
 * @param {string} code - the worker's refusal code
 * @param {string} name - the language, in English
 * @returns {string}
 */
function noticeFor(code, name) {
  if (code === 'consent-declined') {
    return (
      `The ${name} language file is not on this device, so this was read as English. ` +
      `To read it in ${name}, allow jsDelivr below and capture it again.`
    );
  }
  return (
    `The ${name} language file could not be downloaded, so this was read as English. ` +
    'Check your connection and try again.'
  );
}

/**
 * Get a language ready for the engine.
 *
 * @param {string} code - a Tesseract language code, as the student chose it
 * @returns {Promise<{language: {code: string, langPath: string}, release: () => void,
 *   notice: string|null, declined: boolean}>} the language to read in; `release` lets the page's
 *   copy of a downloaded file go once recognition is over; `notice` says why it is English, when it
 *   had to be; `declined` is true when that was the student's no, which the dialog offers to change
 */
export async function prepareOcrLanguage(code) {
  const name = Object.hasOwn(OCR_LANGUAGE_NAMES, code) ? OCR_LANGUAGE_NAMES[code] : null;
  if (!name) {
    return bundled(ENGLISH);
  }
  if (BUNDLED_OCR_LANGUAGES.includes(code)) {
    return bundled(code);
  }

  const reply = await requestThirdParty(
    'ocrLanguages',
    { lang: code },
    { detail: name, detailLabel: 'The language is:' }
  );
  if (!reply.success || typeof reply.data?.base64 !== 'string') {
    return {
      ...bundled(ENGLISH),
      notice: noticeFor(reply.code, name),
      declined: reply.code === 'consent-declined',
    };
  }

  const url = URL.createObjectURL(
    new Blob([bytesFromBase64(reply.data.base64)], { type: 'application/gzip' })
  );
  return {
    language: { code, langPath: `${url}#` },
    release: () => URL.revokeObjectURL(url),
    notice: null,
    declined: false,
  };
}
