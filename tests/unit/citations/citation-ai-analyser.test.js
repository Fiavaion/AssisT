/**
 * @jest-environment jsdom
 *
 * Unit tests for citation-ai-analyser.js.
 *
 * The analyser is a thin wrapper over src/features/shared/ai-feature-client.js,
 * which itself calls:
 *   - chrome.storage.local.get([...keys]) → to read aiMode / cloudProvider / cloudModel
 *   - chrome.runtime.sendMessage({ action }) → to check availability and generate
 *
 * Because jest.config.cjs sets resetMocks:true, ALL mocks are reset before every
 * test. We must therefore set mock implementations INSIDE each test or beforeEach.
 *
 * Strategy:
 *   chrome.storage.local.get  → mockImplementation that resolves the desired storage state.
 *   chrome.runtime.sendMessage → mockImplementation that dispatches on message.action.
 */

import {
  getAnalyserAvailability,
  isAnalyserAvailable,
  analyseCitation,
} from '../../../src/features/citations/citation-ai-analyser.js';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const CITATION = {
  title: 'X',
  authors: ['Smith, J.'],
  type: 'journal',
  siteName: 'J',
  publicationDate: '2020',
  doi: '10.1/x',
  url: 'https://x',
};

// ---------------------------------------------------------------------------
// Helpers — configure the two chrome mocks for a given scenario
// ---------------------------------------------------------------------------

/**
 * Configure chrome.storage.local.get to return a storage snapshot.
 * Signature mirrors the real API: get(keys) → Promise<result>.
 */
function mockStorage(storageState) {
  chrome.storage.local.get.mockImplementation(() => Promise.resolve(storageState));
}

/**
 * Configure chrome.runtime.sendMessage to dispatch on message.action.
 * handlers: { [action]: responseObject }
 */
function mockMessages(handlers) {
  chrome.runtime.sendMessage.mockImplementation(msg => {
    const handler = handlers[msg.action];
    if (handler !== undefined) {
      return Promise.resolve(handler);
    }
    // Unrecognised action — return empty object (safe default).
    return Promise.resolve({});
  });
}

// ---------------------------------------------------------------------------
// AI OFF
// ---------------------------------------------------------------------------

describe('citation-ai-analyser — AI OFF', () => {
  beforeEach(() => {
    mockStorage({ aiMode: 'off' });
  });

  test('isAnalyserAvailable() returns false when aiMode is "off"', async () => {
    const available = await isAnalyserAvailable();
    expect(available).toBe(false);
  });

  test('getAnalyserAvailability() returns available:false with a non-empty reason', async () => {
    const result = await getAnalyserAvailability();
    expect(result.available).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  test('analyseCitation() resolves { available:false } without calling sendMessage', async () => {
    const result = await analyseCitation(CITATION);
    expect(result.available).toBe(false);
    // The generate path must not have been invoked.
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AI CLOUD — available + well-formed JSON response
// ---------------------------------------------------------------------------

describe('citation-ai-analyser — AI CLOUD available, good JSON', () => {
  const GOOD_JSON =
    '{"signal":"high","summary":"Reputable peer-reviewed source.","considerations":["Has DOI","Recent"]}';

  beforeEach(() => {
    mockStorage({
      aiMode: 'cloud',
      cloudProvider: 'anthropic',
      cloudModel: 'haiku-4.5',
    });
    mockMessages({
      CLOUD_LLM_CHECK: { success: true, available: true },
      CLOUD_LLM_GENERATE: { success: true, data: GOOD_JSON },
    });
  });

  test('isAnalyserAvailable() returns true', async () => {
    const available = await isAnalyserAvailable();
    expect(available).toBe(true);
  });

  test('analyseCitation() resolves with parsed signal, summary, and considerations', async () => {
    const result = await analyseCitation(CITATION);

    expect(result.available).toBe(true);
    expect(result.signal).toBe('high');
    expect(result.summary).toBe('Reputable peer-reviewed source.');
    expect(result.considerations).toEqual(['Has DOI', 'Recent']);
  });

  test('analyseCitation() calls CLOUD_LLM_CHECK then CLOUD_LLM_GENERATE', async () => {
    await analyseCitation(CITATION);

    const actions = chrome.runtime.sendMessage.mock.calls.map(c => c[0].action);
    expect(actions).toContain('CLOUD_LLM_CHECK');
    expect(actions).toContain('CLOUD_LLM_GENERATE');
  });
});

// ---------------------------------------------------------------------------
// AI CLOUD — available + MALFORMED output
// ---------------------------------------------------------------------------

describe('citation-ai-analyser — AI CLOUD available, malformed output', () => {
  beforeEach(() => {
    mockStorage({
      aiMode: 'cloud',
      cloudProvider: 'anthropic',
      cloudModel: 'haiku-4.5',
    });
    mockMessages({
      CLOUD_LLM_CHECK: { success: true, available: true },
      CLOUD_LLM_GENERATE: { success: true, data: 'not json at all' },
    });
  });

  test('analyseCitation() resolves with available:true and signal:"unknown"', async () => {
    const result = await analyseCitation(CITATION);

    expect(result.available).toBe(true);
    expect(result.signal).toBe('unknown');
  });

  test('analyseCitation() still returns a non-empty summary string', async () => {
    const result = await analyseCitation(CITATION);
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// AI LOCAL (Ollama) — generate returns an ALREADY-PARSED OBJECT (format:'json')
// Regression: local Ollama with format:'json' resolves data to an object, not a string.
// parseResult must accept it instead of throwing on text.match (which broke "Analyse with AI").
// ---------------------------------------------------------------------------

describe('citation-ai-analyser — AI LOCAL, parsed-object response', () => {
  beforeEach(() => {
    mockStorage({ aiMode: 'local' });
    mockMessages({
      LOCAL_LLM_CHECK: { success: true, available: true },
      LOCAL_LLM_GENERATE: {
        success: true,
        data: {
          signal: 'medium',
          summary: 'A general reference; corroborate with a scholarly source.',
          considerations: ['Encyclopaedia-style source', 'No named author'],
        },
      },
    });
  });

  test('isAnalyserAvailable() returns true in local mode', async () => {
    expect(await isAnalyserAvailable()).toBe(true);
  });

  test('analyseCitation() reads the parsed object without throwing', async () => {
    const result = await analyseCitation(CITATION);
    expect(result.available).toBe(true);
    expect(result.signal).toBe('medium');
    expect(result.summary).toBe('A general reference; corroborate with a scholarly source.');
    expect(result.considerations).toEqual(['Encyclopaedia-style source', 'No named author']);
  });
});

describe('citation-ai-analyser — AI LOCAL, {raw, parseError} object', () => {
  beforeEach(() => {
    mockStorage({ aiMode: 'local' });
    mockMessages({
      LOCAL_LLM_CHECK: { success: true, available: true },
      LOCAL_LLM_GENERATE: {
        success: true,
        data: { raw: '{"signal":"low","summary":"Weak.","considerations":[]}', parseError: true },
      },
    });
  });

  test('recovers the JSON embedded in the raw payload', async () => {
    const result = await analyseCitation(CITATION);
    expect(result.available).toBe(true);
    expect(result.signal).toBe('low');
    expect(result.summary).toBe('Weak.');
  });
});

// ---------------------------------------------------------------------------
// AI CLOUD — availability check fails (no API key)
// ---------------------------------------------------------------------------

describe('citation-ai-analyser — AI CLOUD, check reports unavailable', () => {
  beforeEach(() => {
    mockStorage({
      aiMode: 'cloud',
      cloudProvider: 'anthropic',
      cloudModel: 'haiku-4.5',
    });
    mockMessages({
      CLOUD_LLM_CHECK: { success: false, available: false },
    });
  });

  test('isAnalyserAvailable() returns false', async () => {
    const available = await isAnalyserAvailable();
    expect(available).toBe(false);
  });

  test('analyseCitation() resolves { available:false } without calling GENERATE', async () => {
    const result = await analyseCitation(CITATION);
    expect(result.available).toBe(false);

    const actions = chrome.runtime.sendMessage.mock.calls.map(c => c[0].action);
    expect(actions).not.toContain('CLOUD_LLM_GENERATE');
  });
});
