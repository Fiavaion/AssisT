/**
 * The one route off the device (ADR 0006).
 *
 * Every third-party request is made here, in the service worker, and only after the student has
 * said yes to that destination. The worker is not a fetch proxy: a caller names a destination and
 * hands over a word, a text and two languages, a DOI or a short title, and the worker builds the
 * URL itself. Anything else is refused before the network is touched, and each refusal below is
 * proven by counting fetch calls, not by looking at what came back.
 */

import {
  performThirdPartyRequest,
  handleThirdPartyMessage,
} from '../../../src/background/third-party-requests.js';
import { consentStorageKey } from '../../../src/utils/consent.js';

let stored;

function grant(...destinations) {
  for (const destination of destinations) {
    stored[consentStorageKey(destination)] = { granted: true, at: '2026-09-25T10:00:00.000Z' };
  }
}

function decline(destination) {
  stored[consentStorageKey(destination)] = { granted: false, at: '2026-09-25T10:00:00.000Z' };
}

function respondWith(body, { ok = true, status = 200 } = {}) {
  global.fetch.mockResolvedValue({ ok, status, statusText: '', json: async () => body });
}

beforeAll(() => {
  if (typeof AbortSignal.timeout !== 'function') {
    AbortSignal.timeout = () => new AbortController().signal;
  }
});

afterAll(() => {
  delete chrome.permissions;
});

beforeEach(() => {
  stored = {};
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
  chrome.storage.local.set = jest.fn(async values => Object.assign(stored, values));
  // Every destination is behind an optional host (ADR 0009); here Chrome holds them all, and
  // outside-service-permissions.test.js covers it not holding one.
  chrome.permissions = { contains: jest.fn().mockResolvedValue(true) };
  global.fetch = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

const VALID = {
  dictionary: { word: 'dyslexia' },
  translation: { text: 'Hello', source: 'en', target: 'es' },
  citations: { doi: '10.1000/xyz123' },
  citationVerification: { title: 'Attention is all you need' },
};

describe('what is refused, and that refusing sends nothing', () => {
  it('refuses a destination it has no request builder for', async () => {
    grant('dictionary');
    const reply = await performThirdPartyRequest('https://evil.example/', { word: 'x' });
    expect(reply).toMatchObject({ success: false, code: 'unknown-destination' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses a destination named like an inherited property', async () => {
    const reply = await performThirdPartyRequest('toString', {});
    expect(reply).toMatchObject({ success: false, code: 'unknown-destination' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(Object.keys(VALID))('refuses %s when the student has never been asked', async name => {
    const reply = await performThirdPartyRequest(name, VALID[name]);
    expect(reply).toMatchObject({ success: false, code: 'consent-unasked', destination: name });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each(Object.keys(VALID))('refuses %s when the student said no', async name => {
    decline(name);
    const reply = await performThirdPartyRequest(name, VALID[name]);
    expect(reply).toMatchObject({ success: false, code: 'consent-declined', destination: name });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses when the stored answer cannot be read', async () => {
    chrome.storage.local.get = jest.fn().mockRejectedValue(new Error('gone'));
    const reply = await performThirdPartyRequest('dictionary', VALID.dictionary);
    expect(reply).toMatchObject({ success: false, code: 'consent-unasked' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a yes for one destination is not a yes for another', async () => {
    grant('dictionary');
    const reply = await performThirdPartyRequest('translation', VALID.translation);
    expect(reply).toMatchObject({ success: false, code: 'consent-unasked' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('withdrawing refuses the very next request', async () => {
    grant('dictionary');
    respondWith([{ word: 'dyslexia', meanings: [] }]);
    await performThirdPartyRequest('dictionary', VALID.dictionary);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    decline('dictionary');
    const reply = await performThirdPartyRequest('dictionary', VALID.dictionary);
    expect(reply).toMatchObject({ success: false, code: 'consent-declined' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['dictionary', { word: '' }],
    ['dictionary', { word: 42 }],
    ['dictionary', {}],
    ['dictionary', { word: 'a'.repeat(65) }],
    ['dictionary', { word: 'one two three four' }],
    ['dictionary', { word: 'line\nbreak' }],
    ['translation', { text: '', source: 'en', target: 'es' }],
    ['translation', { text: 'x'.repeat(501), source: 'en', target: 'es' }],
    ['translation', { text: 'Hello', source: 'en', target: 'en' }],
    ['translation', { text: 'Hello', source: 'en', target: 'es&key=1' }],
    ['translation', { text: 'Hello', source: 'auto', target: 'es' }],
    ['translation', { text: 'Hello', source: 'en' }],
    ['citations', { doi: 'not a doi' }],
    ['citations', { doi: '10.1000/xyz 123' }],
    ['citations', { doi: '../../users' }],
    ['citations', { doi: `10.1000/${'a'.repeat(300)}` }],
    ['citationVerification', { title: '' }],
    ['citationVerification', { title: '!!!' }],
    ['citationVerification', { title: 'x'.repeat(301) }],
    ['citationVerification', { title: ['array'] }],
  ])('refuses %s with malformed parameters %j', async (name, params) => {
    grant(name);
    const reply = await performThirdPartyRequest(name, params);
    expect(reply).toMatchObject({ success: false, code: 'invalid-params' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('checks the parameters before it reads consent, so a bad call never prompts anyone', async () => {
    const reply = await performThirdPartyRequest('dictionary', { word: '' });
    expect(reply.code).toBe('invalid-params');
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it('ignores anything extra a caller sends along, including a URL', async () => {
    grant('dictionary');
    respondWith([{ word: 'dyslexia', meanings: [] }]);
    await performThirdPartyRequest('dictionary', {
      word: 'dyslexia',
      url: 'https://evil.example/',
    });
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.dictionaryapi.dev/api/v2/entries/en/dyslexia'
    );
  });
});

describe('dictionary', () => {
  beforeEach(() => grant('dictionary'));

  it('asks for the lower-cased, encoded word and returns only what the dictionary shows', async () => {
    respondWith([
      {
        word: 'café',
        license: { name: 'CC BY-SA 3.0' },
        sourceUrls: ['https://en.wiktionary.org/wiki/caf%C3%A9'],
        phonetics: [
          { text: '/kæˈfeɪ/', audio: 'https://api.dictionaryapi.dev/media/cafe.mp3', license: {} },
          { text: '/x/', audio: 'javascript:alert(1)' },
        ],
        meanings: [
          {
            partOfSpeech: 'noun',
            definitions: [{ definition: 'A coffee shop', example: 'We met at a café', extra: 1 }],
            synonyms: ['coffeehouse'],
            antonyms: [],
          },
        ],
      },
    ]);

    const reply = await performThirdPartyRequest('dictionary', { word: '  Café ' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent('café')}`
    );
    expect(global.fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
    expect(reply).toEqual({
      success: true,
      data: [
        {
          word: 'café',
          phonetics: [
            { text: '/kæˈfeɪ/', audio: 'https://api.dictionaryapi.dev/media/cafe.mp3' },
            { text: '/x/', audio: '' },
          ],
          meanings: [
            {
              partOfSpeech: 'noun',
              definitions: [{ definition: 'A coffee shop', example: 'We met at a café' }],
              synonyms: ['coffeehouse'],
              antonyms: [],
            },
          ],
        },
      ],
    });
  });

  it('reports a word the dictionary does not have as not found', async () => {
    respondWith({ title: 'No Definitions Found' }, { ok: false, status: 404 });
    const reply = await performThirdPartyRequest('dictionary', { word: 'zzqx' });
    expect(reply).toMatchObject({ success: false, code: 'not-found' });
  });

  it('reports a dropped connection in the sanitised error shape', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const reply = await performThirdPartyRequest('dictionary', { word: 'dyslexia' });
    expect(reply).toEqual({
      success: false,
      code: 'network',
      error: 'Network error — check your internet connection',
    });
  });

  it('reports a timeout as a timeout', async () => {
    const timeout = new Error('signal timed out');
    timeout.name = 'TimeoutError';
    global.fetch.mockRejectedValue(timeout);
    const reply = await performThirdPartyRequest('dictionary', { word: 'dyslexia' });
    expect(reply).toMatchObject({ success: false, code: 'timeout' });
  });

  it('reports a server error as an HTTP failure', async () => {
    respondWith({}, { ok: false, status: 503 });
    const reply = await performThirdPartyRequest('dictionary', { word: 'dyslexia' });
    expect(reply).toMatchObject({ success: false, code: 'http-error' });
  });
});

describe('translation', () => {
  beforeEach(() => grant('translation'));

  it('builds the MyMemory request from the text and the language pair', async () => {
    respondWith({ responseStatus: 200, responseData: { translatedText: 'Hola' }, matches: [1] });
    const reply = await performThirdPartyRequest('translation', {
      text: 'Hello & goodbye',
      source: 'en',
      target: 'zh-CN',
    });
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://api.mymemory.translated.net/get');
    expect(url.searchParams.get('q')).toBe('Hello & goodbye');
    expect(url.searchParams.get('langpair')).toBe('en|zh-CN');
    expect([...url.searchParams.keys()].sort()).toEqual(['langpair', 'q']);
    expect(reply).toEqual({ success: true, data: { translatedText: 'Hola' } });
  });

  it('reports a finished daily quota', async () => {
    respondWith({ quotaFinished: true, responseStatus: 200 });
    const reply = await performThirdPartyRequest('translation', VALID.translation);
    expect(reply).toMatchObject({ success: false, code: 'quota-exceeded' });
  });

  it('a yes to translating a selection is not a yes to translating the whole page', async () => {
    const reply = await performThirdPartyRequest('pageTranslation', VALID.translation);
    expect(reply).toMatchObject({ success: false, code: 'consent-unasked' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('translates a passage of the page once the whole page is allowed', async () => {
    grant('pageTranslation');
    respondWith({ responseStatus: 200, responseData: { translatedText: 'Hola' } });
    const reply = await performThirdPartyRequest('pageTranslation', VALID.translation);
    expect(new URL(global.fetch.mock.calls[0][0]).origin).toBe('https://api.mymemory.translated.net');
    expect(reply).toEqual({ success: true, data: { translatedText: 'Hola' } });
  });

  it("keeps the provider's own wording out of the reply", async () => {
    respondWith({ responseStatus: 403, responseDetails: 'PLEASE SELECT TWO DISTINCT LANGUAGES' });
    const reply = await performThirdPartyRequest('translation', VALID.translation);
    expect(reply).toMatchObject({ success: false, code: 'provider-error' });
    expect(JSON.stringify(reply)).not.toMatch(/PLEASE SELECT/);
  });
});

describe('citations (Crossref)', () => {
  beforeEach(() => grant('citations'));

  const WORK = {
    type: 'journal-article',
    title: ['Attention Is All You Need'],
    author: [{ given: 'Ashish', family: 'Vaswani', ORCID: 'x', affiliation: [] }],
    'container-title': ['NeurIPS'],
    publisher: 'Curran',
    DOI: '10.1000/xyz123',
    volume: '30',
    issue: '1',
    page: '1-10',
    published: { 'date-parts': [[2017, 6, 12]] },
    ISSN: ['1234-5678'],
    URL: 'https://doi.org/10.1000/xyz123',
    reference: [{ key: 'a' }],
    abstract: 'long',
  };

  it('looks up a DOI, cleaned of its link prefix, and returns the work without the extras', async () => {
    respondWith({ status: 'ok', message: WORK });
    const reply = await performThirdPartyRequest('citations', {
      doi: 'https://doi.org/10.1000/xyz123',
    });
    expect(global.fetch.mock.calls[0][0]).toBe(
      `https://api.crossref.org/works/${encodeURIComponent('10.1000/xyz123')}`
    );
    expect(reply.success).toBe(true);
    expect(reply.data.work.title).toEqual(['Attention Is All You Need']);
    expect(reply.data.work.author).toEqual([{ given: 'Ashish', family: 'Vaswani' }]);
    expect(reply.data.work.reference).toBeUndefined();
    expect(reply.data.work.abstract).toBeUndefined();
    expect(reply.data.work.published).toEqual({ 'date-parts': [[2017, 6, 12]] });
  });

  it('passes a publication date on as whole numbers only, never as markup', async () => {
    respondWith({
      status: 'ok',
      message: {
        ...WORK,
        published: {
          'date-parts': [['<img src=x onerror=alert(1)>', 6]],
          'date-time': '<script>',
          timestamp: 1,
        },
        'published-online': { 'date-parts': [[2016, 12, 1, 99]], extra: '<b>' },
      },
    });
    const reply = await performThirdPartyRequest('citations', VALID.citations);
    expect(reply.data.work.published).toBeUndefined();
    expect(reply.data.work['published-online']).toEqual({ 'date-parts': [[2016, 12, 1]] });
    expect(JSON.stringify(reply)).not.toMatch(/<|script|timestamp/);
  });

  it('reports an unknown DOI as not found', async () => {
    respondWith('Resource not found.', { ok: false, status: 404 });
    const reply = await performThirdPartyRequest('citations', VALID.citations);
    expect(reply).toMatchObject({ success: false, code: 'not-found' });
  });
});

describe('citation verification (Semantic Scholar)', () => {
  beforeEach(() => {
    grant('citationVerification');
  });

  it('searches by a short, punctuation-free title and returns the first paper', async () => {
    respondWith({
      data: [
        {
          paperId: 'abc',
          title: 'Attention Is All You Need',
          authors: [{ name: 'Ashish Vaswani', authorId: '1' }],
          year: 2017,
          venue: 'NeurIPS',
          externalIds: { DOI: '10.1000/xyz123', ArXiv: '1706' },
        },
      ],
    });
    const reply = await performThirdPartyRequest('citationVerification', {
      title: 'Attention: is all you need?',
    });
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(
      'https://api.semanticscholar.org/graph/v1/paper/search'
    );
    expect(url.searchParams.get('query')).toBe('Attention  is all you need');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(reply).toEqual({
      success: true,
      data: {
        paper: {
          paperId: 'abc',
          title: 'Attention Is All You Need',
          authors: ['Ashish Vaswani'],
          year: 2017,
          venue: 'NeurIPS',
          doi: '10.1000/xyz123',
        },
      },
    });
  });

  it('reports no match as not found', async () => {
    respondWith({ data: [] });
    const reply = await performThirdPartyRequest('citationVerification', VALID.citationVerification);
    expect(reply).toMatchObject({ success: false, code: 'not-found' });
  });
});

describe('the message handler', () => {
  it('answers THIRD_PARTY_REQUEST and nothing else', async () => {
    const sendResponse = jest.fn();
    expect(handleThirdPartyMessage({ type: 'SOMETHING_ELSE' }, sendResponse)).toBe(false);
    expect(sendResponse).not.toHaveBeenCalled();

    const handled = handleThirdPartyMessage(
      { type: 'THIRD_PARTY_REQUEST', destination: 'dictionary', params: { word: 'x' } },
      sendResponse
    );
    expect(handled).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'consent-unasked' })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
