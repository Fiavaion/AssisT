/**
 * Where the text-recognition engine lives inside the extension (ADR 0008).
 *
 * tesseract.js fetches its worker, its WebAssembly core and its language model from a CDN unless
 * told otherwise, and the store forbids running fetched code. Every worker is therefore created with
 * these options, which point at copies the build ships under their node_modules paths and
 * web_accessible_resources exposes to the page the worker runs in. English ships in the package;
 * the other languages are downloaded on request (`ocr-language-data.js`).
 *
 * @module features/ocr/ocr-engine-files
 */

const WORKER_FILE = 'node_modules/tesseract.js/dist/worker.min.js';
const CORE_DIR = 'node_modules/tesseract.js-core';

/**
 * The cores tesseract.js picks between for an LSTM-only worker: SIMD where the processor has it.
 * The legacy-engine cores are never loaded and are not shipped.
 */
const CORE_FILES = ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'];

/** Every language the student can choose, by Tesseract code, in the order the picker shows. */
export const OCR_LANGUAGE_NAMES = Object.freeze({
  eng: 'English',
  spa: 'Spanish',
  fra: 'French',
  deu: 'German',
  ita: 'Italian',
  por: 'Portuguese',
  nld: 'Dutch',
  pol: 'Polish',
  rus: 'Russian',
  chi_sim: 'Chinese (Simplified)',
  chi_tra: 'Chinese (Traditional)',
  jpn: 'Japanese',
  kor: 'Korean',
  ara: 'Arabic',
});

export const OCR_LANGUAGES = Object.freeze(Object.keys(OCR_LANGUAGE_NAMES));

/** Languages whose model ships in the package. The rest are downloaded on request. */
export const BUNDLED_OCR_LANGUAGES = Object.freeze(['eng']);

/** The directory holding a bundled language's LSTM model, as tesseract.js names the file in it. */
function languageDir(lang) {
  return `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int`;
}

/** Every file the engine can load from the package, relative to the extension root. */
export const OCR_ENGINE_FILES = Object.freeze([
  WORKER_FILE,
  ...CORE_FILES.map(file => `${CORE_DIR}/${file}`),
  ...BUNDLED_OCR_LANGUAGES.map(lang => `${languageDir(lang)}/${lang}.traineddata.gz`),
]);

/**
 * The extension URL of a bundled language's directory.
 * @param {string} lang - one of BUNDLED_OCR_LANGUAGES
 * @returns {string}
 */
export function bundledLanguagePath(lang) {
  return chrome.runtime.getURL(languageDir(lang));
}

/**
 * createWorker options that keep every file the worker loads inside the extension: the worker and
 * the core from the package, and the language from `langPath` (the package for English, a blob:
 * URL of the downloaded bytes otherwise).
 *
 * `corePath` is the directory, not a file, so tesseract.js still chooses the SIMD core or not.
 * Caching is off: the cache is the visited site's IndexedDB.
 *
 * @param {string} langPath
 * @returns {{workerPath: string, corePath: string, langPath: string, cacheMethod: string}}
 */
export function ocrWorkerOptions(langPath) {
  return {
    workerPath: chrome.runtime.getURL(WORKER_FILE),
    corePath: chrome.runtime.getURL(CORE_DIR),
    langPath,
    cacheMethod: 'none',
  };
}
