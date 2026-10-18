/**
 * Where a downloaded OCR language file is kept (ADR 0008).
 *
 * The extension origin's own IndexedDB, written and read by the service worker, so a language is
 * downloaded once and the visited site never holds it. A file is kept as the gzip bytes jsDelivr
 * served, after their SHA-256 has been checked against the pinned one. Nothing here throws: a store
 * that cannot be opened reads as "not kept", and the caller downloads instead.
 *
 * @module background/ocr-language-store
 */

const DB_NAME = 'assist-ocr-languages';
const STORE = 'files';

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function settle(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * A language's file, if it has been kept.
 * @param {string} lang - Tesseract language code
 * @returns {Promise<Uint8Array|null>}
 */
export async function readStoredLanguage(lang) {
  let db = null;
  try {
    db = await openStore();
    const kept = await settle(db.transaction(STORE, 'readonly').objectStore(STORE).get(lang));
    return kept ? new Uint8Array(kept) : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Keep a language's file.
 * @param {string} lang - Tesseract language code
 * @param {Uint8Array} bytes - the checked gzip bytes
 * @returns {Promise<boolean>} whether it was kept
 */
export async function storeLanguage(lang, bytes) {
  let db = null;
  try {
    db = await openStore();
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await settle(db.transaction(STORE, 'readwrite').objectStore(STORE).put(copy, lang));
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}
