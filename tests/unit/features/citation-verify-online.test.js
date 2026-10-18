/**
 * @jest-environment jsdom
 *
 * The citation analyser's online check (turned on in settings) looks a reference up on CrossRef by
 * its DOI, and on Semantic Scholar by its title when CrossRef has nothing. Both go through the
 * service worker's one route (ADR 0006), behind the student's answer for each service; the
 * analyser never fetches, and the worker no longer has a second CrossRef path of its own.
 */

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  ...jest.requireActual('../../../src/features/shared/ai-feature-client.js'),
  getAIMode: jest.fn(),
  checkAIAvailable: jest.fn(),
}));

jest.mock('../../../src/utils/consent-panel.js', () => ({
  ...jest.requireActual('../../../src/utils/consent-panel.js'),
  askForConsent: jest.fn(),
}));

const aiClient = require('../../../src/features/shared/ai-feature-client.js');
const { askForConsent } = require('../../../src/utils/consent-panel.js');

const WITH_DOI =
  'Vaswani, A. (2017). Attention is all you need. NeurIPS, 30. https://doi.org/10.1000/xyz123';
const WITHOUT_DOI = 'Vaswani, A. (2017). Attention is all you need. NeurIPS, 30.';

const CROSSREF = {
  success: true,
  data: {
    work: {
      title: ['Attention Is All You Need'],
      author: [{ given: 'Ashish', family: 'Vaswani' }],
      published: { 'date-parts': [[2017]] },
      'container-title': ['NeurIPS'],
      DOI: '10.1000/xyz123',
      URL: 'https://doi.org/10.1000/xyz123',
    },
  },
};
const SCHOLAR = {
  success: true,
  data: {
    paper: {
      paperId: 'abc',
      title: 'Attention Is All You Need',
      authors: ['Ashish Vaswani'],
      year: 2017,
      venue: 'NeurIPS',
      doi: null,
    },
  },
};

let mod;

const slot = () => document.getElementById('citation-verify-slot');
const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

/** Answer each THIRD_PARTY_REQUEST by destination. */
function worker(replies) {
  chrome.runtime.sendMessage = jest.fn(async message =>
    message.type === 'THIRD_PARTY_REQUEST' ? replies[message.destination] : {}
  );
}

function requestsTo(destination) {
  return chrome.runtime.sendMessage.mock.calls.filter(
    ([message]) => message.type === 'THIRD_PARTY_REQUEST' && message.destination === destination
  );
}

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mod = await import('../../../src/features/citationAnalyzer/citationAnalyzer.js');
});

beforeEach(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = jest.fn();
  askForConsent.mockReset();
  aiClient.getAIMode.mockResolvedValue({ isOff: true, mode: 'off' });
  aiClient.checkAIAvailable.mockResolvedValue({ available: false });
  chrome.runtime.sendMessage = jest.fn().mockResolvedValue({});
  await mod.citation_show();
  await settle();
});

afterEach(() => {
  mod.citation_hide();
});

test('a DOI is checked on CrossRef, through the worker', async () => {
  worker({ citations: CROSSREF });

  await mod.citation_startVerification(WITH_DOI);

  expect(requestsTo('citations')[0][0].params).toEqual({ doi: '10.1000/xyz123' });
  expect(requestsTo('citationVerification')).toHaveLength(0);
  expect(slot().textContent).toMatch(/Found on CrossRef/);
  expect(slot().textContent).toMatch(/Attention Is All You Need/);
  expect(slot().textContent).toMatch(/Vaswani/);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('with no DOI, the title is checked on Semantic Scholar', async () => {
  worker({ citationVerification: SCHOLAR });

  await mod.citation_startVerification(WITHOUT_DOI);

  expect(requestsTo('citations')).toHaveLength(0);
  expect(requestsTo('citationVerification')[0][0].params.title).toMatch(/Attention/);
  expect(slot().textContent).toMatch(/Found on Semantic Scholar/);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a DOI CrossRef does not know falls back to the title', async () => {
  worker({ citations: { success: false, code: 'not-found' }, citationVerification: SCHOLAR });

  await mod.citation_startVerification(WITH_DOI);

  expect(requestsTo('citationVerification')).toHaveLength(1);
  expect(slot().textContent).toMatch(/Found on Semantic Scholar/);
});

test('after "not now", it says nothing was sent and offers Allow, rather than "not found"', async () => {
  worker({
    citations: { success: false, code: 'consent-unasked', destination: 'citations' },
    citationVerification: {
      success: false,
      code: 'consent-declined',
      destination: 'citationVerification',
    },
  });
  askForConsent.mockResolvedValue('declined');

  await mod.citation_startVerification(WITH_DOI);

  expect(global.fetch).not.toHaveBeenCalled();
  expect(slot().textContent).toMatch(/nothing was sent/i);
  expect(slot().textContent).not.toMatch(/Not found in/);
  expect(slot().querySelector('[data-assist-consent-notice] button').textContent).toMatch(
    /Allow Crossref/
  );
});

test('nothing found anywhere still says so', async () => {
  worker({
    citations: { success: false, code: 'not-found' },
    citationVerification: { success: false, code: 'not-found' },
  });

  await mod.citation_startVerification(WITH_DOI);

  expect(slot().textContent).toMatch(/Not found in CrossRef or Semantic Scholar/);
});

test('Semantic Scholar without Chrome access is asked again, and a no offers Allow in place', async () => {
  // ADR 0009: a missing host is no consent. The question asks for both, and refusing it ends as
  // the usual notice, never "not found" and never a trip to the popup.
  worker({
    citationVerification: {
      success: false,
      code: 'permission-missing',
      destination: 'citationVerification',
    },
  });
  askForConsent.mockResolvedValue('declined');

  await mod.citation_startVerification(WITHOUT_DOI);

  expect(askForConsent).toHaveBeenCalledWith('citationVerification', expect.any(Object));
  expect(global.fetch).not.toHaveBeenCalled();
  expect(slot().textContent).not.toMatch(/Not found/);
  expect(slot().querySelector('[data-assist-consent-notice] button').textContent).toBe(
    'Allow Semantic Scholar'
  );
});

test('a publication year from a service is shown as text, never as markup', async () => {
  worker({
    citationVerification: {
      success: true,
      data: { paper: { ...SCHOLAR.data.paper, year: '<img src=x onerror="window.pwned=1">' } },
    },
  });

  await mod.citation_startVerification(WITHOUT_DOI);

  expect(slot().querySelector('img')).toBeNull();
  expect(slot().textContent).toContain('<img src=x');
});
