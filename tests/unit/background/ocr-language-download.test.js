/**
 * OCR language files, downloaded on request through the one route (ADR 0008).
 *
 * English ships in the package. Any other language's file is downloaded by the service worker,
 * once, after the student allows jsDelivr: the request names a language from a fixed list, never a
 * URL; the URL, its version and the file's SHA-256 are pinned here; and the file is kept in the
 * extension's own storage so it is never downloaded twice. Every refusal is proven by counting
 * fetch calls.
 */

import {
  OCR_LANGUAGE_DOWNLOADS,
  performThirdPartyRequest,
} from '../../../src/background/third-party-requests.js';
import { consentStorageKey } from '../../../src/utils/consent.js';
import { readStoredLanguage, storeLanguage } from '../../../src/background/ocr-language-store.js';
import {
  BUNDLED_OCR_LANGUAGES,
  OCR_LANGUAGES,
} from '../../../src/features/ocr/ocr-engine-files.js';

jest.mock('../../../src/background/ocr-language-store.js', () => ({
  readStoredLanguage: jest.fn(),
  storeLanguage: jest.fn(),
}));

const { webcrypto } = require('node:crypto');
const { Buffer } = require('node:buffer');

const SPANISH_URL =
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa@1.0.0/4.0.0_best_int/spa.traineddata.gz';

let stored;

/** Bytes the size the pinned table expects, so only the hash decides. */
function spanishSizedBytes() {
  return new Uint8Array(OCR_LANGUAGE_DOWNLOADS.spa.bytes).fill(7);
}

/** A response whose body arrives in chunks, as a fetch body does, and records what was read. */
function respondWithBytes(bytes, { ok = true, status = 200, contentLength, chunk = 65536 } = {}) {
  const reads = { count: 0, cancelled: false };
  global.fetch.mockResolvedValue({
    ok,
    status,
    headers: {
      get: name =>
        name.toLowerCase() === 'content-length' && contentLength !== undefined
          ? String(contentLength)
          : null,
    },
    body: {
      getReader() {
        let offset = 0;
        return {
          read: async () => {
            reads.count += 1;
            if (offset >= bytes.length) {
              return { done: true, value: undefined };
            }
            const value = bytes.subarray(offset, offset + chunk);
            offset += value.length;
            return { done: false, value };
          },
          cancel: async () => {
            reads.cancelled = true;
          },
        };
      },
    },
  });
  return reads;
}

/** Makes the digest of anything equal the pinned hash, as the real Spanish file's is. */
function digestMatchesPinned(lang) {
  const hex = OCR_LANGUAGE_DOWNLOADS[lang].sha256;
  const raw = new Uint8Array(hex.match(/../g).map(pair => parseInt(pair, 16)));
  jest.spyOn(globalThis.crypto.subtle, 'digest').mockResolvedValue(raw.buffer);
}

beforeAll(() => {
  if (typeof AbortSignal.timeout !== 'function') {
    AbortSignal.timeout = () => new AbortController().signal;
  }
  if (!globalThis.crypto.subtle) {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle });
  }
});

beforeEach(() => {
  stored = { [consentStorageKey('ocrLanguages')]: { granted: true, at: '2026-10-04T10:00:00Z' } };
  chrome.storage.local.get = jest.fn(async key => {
    const out = {};
    for (const k of [].concat(key)) {
      if (k in stored) {
        out[k] = stored[k];
      }
    }
    return out;
  });
  chrome.permissions = { contains: jest.fn().mockResolvedValue(true) };
  global.fetch = jest.fn();
  readStoredLanguage.mockResolvedValue(null);
  storeLanguage.mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  delete chrome.permissions;
});

describe('which files can be downloaded', () => {
  it('pins every language the picker offers except the ones in the package', () => {
    const downloadable = OCR_LANGUAGES.filter(code => !BUNDLED_OCR_LANGUAGES.includes(code));
    expect(Object.keys(OCR_LANGUAGE_DOWNLOADS).sort()).toEqual(downloadable.sort());
    for (const file of Object.values(OCR_LANGUAGE_DOWNLOADS)) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(file.bytes).toBeGreaterThan(500000);
    }
  });

  it.each([
    ['English, which is in the package', 'eng'],
    ['a language the picker does not offer', 'klingon'],
    ['a path', '../../evil'],
    ['an inherited property', 'constructor'],
    ['nothing', undefined],
  ])('refuses %s, and fetches nothing', async (_, lang) => {
    const reply = await performThirdPartyRequest('ocrLanguages', { lang });
    expect(reply).toMatchObject({ success: false, code: 'invalid-params' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('downloads nothing without consent', async () => {
    delete stored[consentStorageKey('ocrLanguages')];
    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });
    expect(reply).toMatchObject({ success: false, code: 'consent-unasked' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('downloading', () => {
  it('fetches exactly the pinned file, keeps it, and returns it', async () => {
    const bytes = spanishSizedBytes();
    respondWithBytes(bytes);
    digestMatchesPinned('spa');

    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(SPANISH_URL);
    expect(global.fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit' });
    expect(storeLanguage).toHaveBeenCalledWith('spa', expect.any(Uint8Array));
    expect(reply.success).toBe(true);
    expect(reply.data.lang).toBe('spa');
    expect(Buffer.from(reply.data.base64, 'base64').equals(Buffer.from(bytes))).toBe(true);
  });

  it('refuses a file whose hash is not the pinned one, and keeps nothing', async () => {
    respondWithBytes(spanishSizedBytes());

    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });

    expect(reply).toMatchObject({ success: false, code: 'integrity' });
    expect(storeLanguage).not.toHaveBeenCalled();
  });

  it('refuses a file of the wrong size before hashing it', async () => {
    respondWithBytes(new Uint8Array(10));
    const digest = jest.spyOn(globalThis.crypto.subtle, 'digest');

    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });

    expect(reply).toMatchObject({ success: false, code: 'integrity' });
    expect(digest).not.toHaveBeenCalled();
  });

  it('refuses a file announced as larger than the pin without reading any of it', async () => {
    const reads = respondWithBytes(spanishSizedBytes(), {
      contentLength: OCR_LANGUAGE_DOWNLOADS.spa.bytes + 1,
    });

    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });

    expect(reply).toMatchObject({ success: false, code: 'integrity' });
    expect(reads.count).toBe(0);
  });

  it('stops reading a body that runs past the pinned size', async () => {
    // No Content-Length (or a false one): the cap is enforced on what actually arrives.
    const tooLong = new Uint8Array(OCR_LANGUAGE_DOWNLOADS.spa.bytes * 3);
    const reads = respondWithBytes(tooLong, { chunk: 1000000 });

    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });

    expect(reply).toMatchObject({ success: false, code: 'integrity' });
    expect(reads.cancelled).toBe(true);
    expect(reads.count).toBeLessThanOrEqual(4);
    expect(storeLanguage).not.toHaveBeenCalled();
  });

  it('reads a file it already has from its own storage and downloads nothing', async () => {
    const bytes = new Uint8Array([31, 139, 8, 0]);
    readStoredLanguage.mockResolvedValue(bytes);

    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(Buffer.from(reply.data.base64, 'base64').equals(Buffer.from(bytes))).toBe(true);
  });

  it('still hands the file over when it could not be kept', async () => {
    respondWithBytes(spanishSizedBytes());
    digestMatchesPinned('spa');
    storeLanguage.mockResolvedValue(false);

    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });
    expect(reply.success).toBe(true);
  });

  it('reports no connection as a network failure', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const reply = await performThirdPartyRequest('ocrLanguages', { lang: 'spa' });
    expect(reply).toMatchObject({ success: false, code: 'network' });
  });
});
