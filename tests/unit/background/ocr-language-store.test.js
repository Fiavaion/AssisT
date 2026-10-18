/**
 * Where a downloaded OCR language file is kept (ADR 0008): the extension origin's own IndexedDB,
 * written by the service worker, so a file is downloaded once and the visited site never holds it.
 * Reading and writing never throw; a store that cannot be opened reads as "not kept".
 */

import 'fake-indexeddb/auto';

import {
  readStoredLanguage,
  storeLanguage,
} from '../../../src/background/ocr-language-store.js';

test('a file that was never kept reads as null', async () => {
  await expect(readStoredLanguage('fra')).resolves.toBeNull();
});

test('a kept file reads back byte for byte, under its own language', async () => {
  const bytes = new Uint8Array([31, 139, 8, 0, 1, 2, 3]);
  await expect(storeLanguage('spa', bytes)).resolves.toBe(true);

  const back = await readStoredLanguage('spa');
  expect(back).toBeInstanceOf(Uint8Array);
  expect([...back]).toEqual([...bytes]);
  await expect(readStoredLanguage('deu')).resolves.toBeNull();
});

test('a store that cannot be opened is "not kept", never an exception', async () => {
  const realOpen = indexedDB.open;
  indexedDB.open = () => {
    throw new Error('blocked');
  };
  try {
    await expect(readStoredLanguage('spa')).resolves.toBeNull();
    await expect(storeLanguage('spa', new Uint8Array([1]))).resolves.toBe(false);
  } finally {
    indexedDB.open = realOpen;
  }
});
