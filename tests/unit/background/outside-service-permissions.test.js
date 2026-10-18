/**
 * Every outside service is an optional host permission (ADR 0009).
 *
 * The dictionary, MyMemory, Crossref and jsDelivr used to be granted at install, or (jsDelivr) not
 * declared at all. Now each is asked for with its consent, and the worker refuses a request whose
 * host Chrome does not hold, with consent or without, so a manifest that says "optional" means the
 * request does not happen without it. Each refusal is proven by counting fetch calls.
 */

import {
  OPTIONAL_HOST_ORIGINS,
  performThirdPartyRequest,
} from '../../../src/background/third-party-requests.js';
import { consentStorageKey } from '../../../src/utils/consent.js';

jest.mock('../../../src/background/ocr-language-store.js', () => ({
  readStoredLanguage: jest.fn(),
  storeLanguage: jest.fn(),
}));

const SERVICES = [
  ['dictionary', 'https://api.dictionaryapi.dev/*', { word: 'dyslexia' }],
  ['translation', 'https://api.mymemory.translated.net/*', { text: 'Hi', source: 'en', target: 'es' }],
  [
    'pageTranslation',
    'https://api.mymemory.translated.net/*',
    { text: 'Hi', source: 'en', target: 'es' },
  ],
  ['citations', 'https://api.crossref.org/*', { doi: '10.1000/xyz123' }],
  ['ocrLanguages', 'https://cdn.jsdelivr.net/*', { lang: 'spa' }],
];

let stored;

beforeAll(() => {
  if (typeof AbortSignal.timeout !== 'function') {
    AbortSignal.timeout = () => new AbortController().signal;
  }
});

beforeEach(() => {
  stored = {};
  for (const [destination] of SERVICES) {
    stored[consentStorageKey(destination)] = { granted: true, at: '2026-10-04T10:00:00.000Z' };
  }
  chrome.storage.local.get = jest.fn(async key => {
    const keys = Array.isArray(key) ? key : [key];
    const out = {};
    for (const k of keys) {
      if (k in stored) {
        out[k] = JSON.parse(JSON.stringify(stored[k]));
      }
    }
    return out;
  });
  chrome.permissions = { contains: jest.fn().mockResolvedValue(false) };
  global.fetch = jest.fn();
});

afterAll(() => {
  delete chrome.permissions;
});

describe.each(SERVICES)('%s', (destination, origin, params) => {
  it(`is listed against ${origin}`, () => {
    expect(OPTIONAL_HOST_ORIGINS[destination]).toEqual([origin]);
  });

  it('sends nothing without the host, even with consent', async () => {
    const reply = await performThirdPartyRequest(destination, params);
    expect(reply).toMatchObject({ success: false, code: 'permission-missing', destination });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.permissions.contains).toHaveBeenCalledWith({ origins: [origin] });
  });

  it('sends nothing when Chrome cannot say whether it holds the host', async () => {
    chrome.permissions.contains.mockRejectedValue(new Error('no'));
    const reply = await performThirdPartyRequest(destination, params);
    expect(reply).toMatchObject({ success: false, code: 'permission-missing' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
